# Onchain program (Anchor)

Program name: `sirenrun`. One program. Pure logic in `sim/` and `market/`; instruction
handlers are thin wrappers that load accounts, call pure functions, and write results.

## Design rules

1. Store only what a later instruction must read to make a decision.
2. Tokens move only on the base layer (deposit/withdraw). Inside the ER, balances are
   integers in `Balance` accounts. One SPL vault backs everything.
3. Fixed-size accounts, no `Vec`/`String`. Integers only. Checked math.
4. Everything per-run lives in the reusable `Arena` account (one per channel). Users never
   need a new account per run, so spectators can trade instantly.

## What is deliberately NOT onchain

| Data | Where it lives instead |
|---|---|
| Obstacle rows, obstacle types | Derived from `seed` by `packages/sim` |
| Police car positions, camera, effects | Client rendering only |
| Price history, charts, trade ticker | Client builds from account updates + program logs (`emit!`) |
| Usernames, avatars, car skins, chat | Not in MVP |
| Leaderboards, run history beyond 16 runs | Not in MVP (post-MVP indexer) |
| Replays | Client-side clip recording |
| Market volume | Derived client-side from logs |

## Accounts

All sizes include the 8-byte discriminator. Use `#[derive(InitSpace)]` and assert the
numbers below in a unit test so layout changes are noticed.

### `Config`: base layer, never delegated
Seeds: `[b"config"]`

| Field | Type | Notes |
|---|---|---|
| admin | Pubkey | can init arenas, update params |
| mint | Pubkey | tUSDC mint |
| vault | Pubkey | token account owned by Config PDA |
| house | Pubkey | wallet that owns the house `Balance` |
| fee_bps | u16 | total trade fee, 200 = 2% |
| runner_fee_bps | u16 | part of fee to driver, 100 = 1% |
| entry_fee | u64 | e.g. 1 tUSDC (1_000_000) |
| bond | u64 | e.g. 25 tUSDC |
| liquidity | u64 | per market, e.g. 50 tUSDC |
| max_buy | u64 | per trade, e.g. 50 tUSDC |
| bump, vault_bump | u8, u8 | |

≈ 174 bytes. Read-only inside the ER (the ER reads non-delegated base accounts; verify
this in the MagicBlock spike).

### `Balance`: one per user (and one for the house), delegated to the ER
Seeds: `[b"balance", owner]`

| Field | Type | Notes |
|---|---|---|
| owner | Pubkey | wallet |
| available | u64 | spendable tUSDC (6 decimals) |
| entries | [PositionEntry; 8] | open positions across runs |
| bump | u8 | |

`PositionEntry` (27 bytes): `arena_id u8, nonce u32, market u8, side u8 (0 empty, 1 YES,
2 NO), shares u64, cost u64 (net of fee), tick u32 (live tick when bought)`.

≈ 265 bytes. Max 8 open entries: the client auto-claims, so this is plenty.

### `Arena`: one per channel (3), delegated to the ER
Seeds: `[b"arena", &[id]]`

| Field | Type | Notes |
|---|---|---|
| id, bump | u8, u8 | |
| status | u8 | 0 Idle, 1 Staging, 2 Live, 3 Settled |
| phase_ticks | u16 | ticks spent in Staging or Settled |
| nonce | u32 | run counter, +1 at each start |
| runner | Pubkey | driver wallet |
| seed_ready | bool | |
| seed | u64 | |
| sim | SimState | ~27 bytes: the fields in [game-design.md](game-design.md) (minus `seed`) + `nitro_pressed` |
| bond | u64 | bond held for this run |
| no_profit_oi | u64 | Σ (shares − cost) over NO buys this run |
| runner_fees | u64 | accrued driver fee share |
| last_tick_slot | u64 | anti-double-tick guard (see [magicblock.md](magicblock.md)) |
| markets | [Market; 3] | |
| results | [RunResult; 16] | ring of finished runs |
| results_head | u8 | |

`Market` (23 bytes): `line u16, status u8 (0 open, 1 YES, 2 NO, 3 VOID), yes_r u64,
no_r u64, resolved_tick u32`.
`RunResult` (17 bytes): `nonce u32, outcomes u8 (2 bits per market), resolved_ticks [u32; 3]`.

≈ 465 bytes.

## Instructions

Legend: **B** = base layer, **ER** = ephemeral rollup, **S** = signer may be a session key.

| # | Name | Layer | Signer | Purpose |
|---|---|---|---|---|
| 1 | `init_config(params)` | B | admin | Create Config + vault |
| 2 | `update_config(params)` | B | admin | Tune fees/amounts |
| 3 | `init_balance()` | B | user | Create Balance |
| 4 | `deposit(amount)` | B | user | user ATA → vault, `available += amount` |
| 5 | `withdraw(amount)` | B | user | vault → user ATA, `available -= amount` |
| 6 | `delegate_balance()` | B | user | Delegate Balance to the ER validator |
| 7 | `undelegate_balance()` | ER | user (S) | Commit + undelegate Balance (before withdraw/deposit) |
| 8 | `init_arena(id)` | B | admin | Create Arena with lines [300, 600, 900] |
| 9 | `delegate_arena(id)` | B | admin | Delegate Arena |
| 10 | `start_run()` | ER | driver (S) | Begin staging, request VRF, schedule crank |
| 11 | `vrf_callback_seed(randomness, nonce)` | ER | VRF program only | Store seed |
| 12 | `tick()` | ER | crank / keeper | Advance staging, sim, markets, settlement |
| 13 | `set_input(target_lane, nitro)` | ER | driver (S) | Steering |
| 14 | `buy(market, side, amount, min_shares)` | ER | trader (S) | FPMM buy |
| 15 | `claim(entry_index)` | ER | trader (S) | Pay winnings / refund voids |

`deposit`/`withdraw` require the Balance to be **owned by the program** (i.e. not
delegated). Anchor's owner check on `Account<Balance>` enforces this for free; return a
clear error message in the client ("Balance is in the rollup, moving it back first").

### `start_run` (ER)
Accounts: `signer`, `session_token` (opt), `runner_balance` (mut), `house_balance` (mut),
`config`, `arena` (mut), VRF accounts (`oracle_queue` = ephemeral queue, injected by
`#[vrf]`), `magic_program` (crank schedule).

Checks: `arena.status == Idle`; `runner_balance.available >= entry_fee + bond`;
`house_balance.available >= 3 * liquidity`; signer authorized for `runner_balance`.

Effects:
1. Debit runner `entry_fee + bond`; credit house `entry_fee`; `arena.bond = bond`.
2. Debit house `3 * liquidity`; each market: `yes_r = no_r = liquidity`, `status = open`,
   `resolved_tick = 0`.
3. Reset sim per [game-design.md](game-design.md) (`car_x = 2 * LANE_WIDTH`, `target_lane = 2`, `speed = SPEED_START`,
   `police_gap = GAP_START`, `nitro_left = 3`, …). `no_profit_oi = 0`, `runner_fees = 0`.
4. `nonce += 1`, `runner = signer's authority`, `status = Staging`, `phase_ticks = 0`,
   `seed_ready = false`.
5. Request randomness (ephemeral queue), `caller_seed` from `(arena.id, nonce, slot)`,
   callback args include `nonce`.
6. Schedule crank: `tick` every 100 ms, iterations
   `STAGING_TICKS + 50 + MAX_LIVE_TICKS + SETTLE_TICKS`, accounts
   `[arena, runner_balance, house_balance]`, task_id = `(id as u64) << 32 | nonce`.

If 5 + 6 exceed compute in one instruction, split into `start_run` and `arm_run` sent in
the same transaction.

### `vrf_callback_seed` (ER)
Guarded by `#[vrf_callback]`. If `arena.status == Staging && nonce == arena.nonce`:
`seed = u64::from_le_bytes(randomness[0..8])`, `seed_ready = true`. Otherwise no-op.

### `tick` (ER)
Accounts: `arena` (mut), `runner_balance` (mut), `house_balance` (mut).
Must check `runner_balance.owner == arena.runner` and `house_balance.owner == config.house`
(pass `config` too, or store `house` in the arena at start).

- **Idle:** no-op (leftover crank iterations).
- **Staging:** `phase_ticks += 1`. If `phase_ticks >= STAGING_TICKS && seed_ready` → Live.
  If `phase_ticks >= STAGING_TICKS + 50 && !seed_ready` → **abort**: refund runner
  `entry_fee + bond` (house returns entry), return liquidity to house, all markets VOID,
  push result, → Settled.
- **Live:** `sim::step(&mut arena.sim, seed)`. Then markets:
  for each open market: if `t >= line` → resolve YES at `t` and credit the house (see
  settlement below). If `busted` → every open market resolves NO at `t`, then
  **settle run**.
- **Settled:** `phase_ticks += 1`; at `SETTLE_TICKS` → Idle.

Settlement when a market resolves (mid-run or at bust): the house is the LP, so it gets
the pool's winning-side tokens: YES → credit house `yes_r`; NO → credit house `no_r`.

Settle run (once, at bust or hard stop):
- Credit runner `runner_fees`.
- Bond: if market 2 (90 s) resolved YES → credit runner `bond`, else credit house `bond`.
- Push `RunResult` into `results[results_head]`, advance head mod 16.
- `status = Settled`, `phase_ticks = 0`. `emit!(RunSettled { … })`.

### `set_input` (ER)
`#[session_auth_or(arena.runner == signer)]`-style check (authority = `arena.runner`).
Allowed in Staging and Live. `target_lane = min(target_lane, 4)`; if `nitro`, set
`nitro_pressed = true`.

### `buy` (ER)
Accounts: `signer`, `session_token` (opt), `trader_balance` (mut), `house_balance` (mut),
`config`, `arena` (mut).

Checks:
- `arena.status ∈ {Staging, Live}`, `markets[m].status == open`.
- `trader_balance.owner != arena.runner` (driver can't trade own run from main wallet).
- `amount <= config.max_buy`, `trader_balance.available >= amount`.
- A free entry slot exists, or an entry with the same `(arena_id, nonce, market, side)`.
Math:
```
fee        = amount * fee_bps / 10_000
runner_fee = amount * runner_fee_bps / 10_000
net        = amount - fee
shares     = fpmm_buy(&mut market, side, net)?    // see below
require!(shares >= min_shares)
if side == NO:
    arena.no_profit_oi += shares - net
    require!(arena.no_profit_oi <= arena.bond)
trader.available -= amount
house.available  += fee - runner_fee
arena.runner_fees += runner_fee
entry: shares += , cost += net, tick = arena.sim.t   // merge resets tick (stricter)
emit!(Trade { arena, nonce, market, side, net, shares, yes_r, no_r })
```

### `claim` (ER)
Accounts: `signer`, `session_token` (opt), `trader_balance` (mut), `house_balance` (mut),
`arena`.

Find the outcome for `entry.nonce`: if `entry.nonce == arena.nonce` read
`arena.markets[market]`, otherwise search `arena.results`. Not resolved yet → error
`NotResolved`. Not found (older than 16 runs) → error `ResultExpired`.

```
if outcome == VOID or resolved_tick < entry.tick + COOLDOWN_TICKS:
    trader.available += entry.cost        // refund net
    house.available  -= entry.cost        // house funds refunds (see solvency)
elif outcome == entry.side:
    trader.available += entry.shares      // 1 share = 1 unit
clear entry
```
`COOLDOWN_TICKS = 15` (1.5 s). The client calls `claim` automatically as soon as it sees a
market resolve.

## FPMM (fixed product market maker)

Pure functions in `market/fpmm.rs`, all `u128` intermediate math:

```
buy(y, n, side, a):           // a = net collateral in
  k = y * n
  if side == YES:
     n1 = n + a; y1 = y + a
     y2 = ceil_div(k, n1)
     shares = y1 - y2
     return (y2, n1, shares)
  else symmetric (swap roles)

price_yes(y, n) = n / (y + n)     // display only, computed client-side
```

Properties to unit-test (property tests with random inputs):
- `shares >= a` (you always get at least 1 share per unit spent).
- `k` never decreases (`y2 * n1 >= y * n`).
- Price moves in the direction of the buy.
- Overflow returns an error, never panics.

## Solvency argument (write it in a test comment)

Every buy mints `net` complete sets (one YES + one NO per unit). Per market, total
winning-side tokens = `liquidity + Σ net` = collateral received. Winners hold some, the
pool holds the rest (`yes_r` or `no_r`), which is credited to the house. So payouts ≤
collateral. Void refunds are debited from the house balance, and voided shares are never
paid, so they cannot create money. NO-side tanking profit is capped by the driver's
forfeited bond. Max house loss per market ≤ `liquidity`.

Test: a randomized integration test runs many buys/claims and asserts
`vault.amount >= Σ Balance.available` after every run.

## Errors (`errors.rs`)

`ArenaBusy, ArenaNotLive, MarketClosed, InsufficientBalance, HouseInsufficient,
TooLarge, Slippage, NoInterestCapReached, RunnerCannotTrade, NoFreeEntry, NotResolved,
ResultExpired, InvalidLane, Unauthorized, MathOverflow, TickTooSoon, SeedNotReady`.

## Events (`emit!`): logs only, nothing stored

`RunStarted { arena, nonce, runner }`, `SeedSet { arena, nonce }`,
`Trade { … }`, `LineCrossed { arena, nonce, market, t }`,
`RunSettled { arena, nonce, t, outcomes }`, `Claimed { owner, nonce, market, paid }`.
The client uses them for the ticker and toasts.

## Admin scripts (`scripts/`)

- `create-mint.ts`: create tUSDC (6 decimals) on devnet, mint authority = admin.
- `init-devnet.ts`: `init_config`, house `init_balance` + deposit 10,000 tUSDC +
  delegate, `init_arena(0..2)` + delegate.
- `faucet`: the app's "Get test USDC" button calls a Next.js route that mints 100 tUSDC
  to the user (admin key in a Vercel env var; devnet only; rate-limited by wallet).
  This is the only server code, and it touches no game logic.
- `keeper-tick.ts`: fallback ticker, only if scheduled cranks turn out unusable.
