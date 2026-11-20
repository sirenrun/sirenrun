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

≈ 265 bytes. Max 8 open entries (`MAX_ENTRIES`): the client auto-claims, so this is plenty.

### `Arena`: one per channel (3), delegated to the ER
Seeds: `[b"arena", &[id]]`

| Field | Type | Notes |
|---|---|---|
| id, bump | u8, u8 | |
| status | u8 enum | 0 Idle, 1 Staging, 2 Live, 3 Settled |
| phase_ticks | u16 | ticks spent in Staging or Settled |
| nonce | u32 | run counter, +1 at each start |
| runner | Pubkey | driver wallet |
| seed_ready | bool | |
| seed | u64 | |
| sim | RunSim | 27 bytes: borsh copy of `sim::SimState` (the fields in [game-design.md](game-design.md) minus `seed`, plus `nitro_pressed`) |
| bond | u64 | bond held for this run |
| no_profit_oi | u64 | Σ (shares − cost) over NO buys this run |
| runner_fees | u64 | accrued driver fee share |
| markets | [Market; 3] | |
| results | [RunResult; 16] | ring of finished runs |
| results_head | u8 | |

`Market` (23 bytes): `line u16, status u8 (0 open, 1 YES, 2 NO, 3 VOID), yes_r u64,
no_r u64, resolved_tick u32`.
`RunResult` (17 bytes): `nonce u32, outcomes u8 (2 bits per market), resolved_ticks [u32; 3]`.

451 bytes. No slot guard: `tick` only accepts the crank signer (see [spike-results.md](spike-results.md)), so `last_tick_slot` was dropped.

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
| 16 | `recover_arena()` | ER | admin | Move a stuck Settled arena to Idle |

`deposit`/`withdraw` require the Balance to be **owned by the program** (i.e. not
delegated). Anchor's owner check on `Account<Balance>` enforces this for free (error 3007,
`AccountOwnedByWrongProgram`); the client shows "Balance is in the rollup, moving it back
first". The vault is the token account PDA `[b"vault"]`, owned by the Config PDA, which
signs withdrawals. `undelegate_balance` accepts the balance owner or a `SessionTokenV2`
signer for that owner; anyone else gets `Unauthorized`.

`undelegate_balance` also takes `config` and the three arena PDAs (read-only, pinned by
seeds; an arena that was never initialised counts as idle). It fails with `BalanceInUse`
while the owner is the runner of an arena that is not Idle, or is the house while any arena
is not Idle (`Arena::uses_balance`). Every `tick` lists the runner and house balances as
writable, and the ER rejects writable accounts that are not delegated, so undelegating one
mid-run would make every later tick fail and leave the arena stuck (found on devnet,
2026-11-20).

### `recover_arena` (ER)
Accounts: `admin` (signer, `config.admin`), `config`, `arena` (mut). Only a **Settled**
arena may be moved to Idle (`ArenaNotSettled` otherwise); its payouts were applied when it
settled, so this only skips the results hold. `nonce` and `results` are kept, so leftover
crank iterations of that run stay no-ops and claims still work. It exists to rescue an
arena whose crank cannot run any more.

Tests: `tests/magicsvm/tests/liveness.rs` covers the undelegate guard and recovery.
`tests/magicsvm/` loads `target/deploy/sirenrun.so` into MagicSVM (base and ER
ledgers in one process) and runs the money round trip. Run `anchor build` first, then
`cargo test` in that folder.

### `start_run` (ER)
Accounts: `signer`, `session_token` (opt), `runner_balance` (mut), `house_balance` (mut),
`config`, `arena` (mut), `oracle_queue` (`DEFAULT_EPHEMERAL_QUEUE`, or
`DEFAULT_EPHEMERAL_TEST_QUEUE` locally), VRF accounts (`program_identity`, `vrf_program`,
`slot_hashes`, `system_program`), `magic_program` (crank schedule).

`caller_seed` = `[id, nonce LE (4), slot LE (8), 0…]`; `callback_args` = `nonce` LE, so
the callback receives `(randomness, nonce)`.

Checks, in order: signer authorized for `runner_balance`; `arena.status == Idle`
(`ArenaBusy`); `house_balance.available >= 3 * liquidity` (`HouseInsufficient`);
`runner_balance.available >= entry_fee + bond` (`InsufficientBalance`). The arena reset
lives in `Arena::begin`.

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
6. Schedule crank: `tick(nonce)` every `TICK_MS`, iterations
   `STAGING_TICKS + SEED_TIMEOUT_TICKS + MAX_LIVE_TICKS + SETTLE_TICKS`, accounts
   `[arena, runner_balance, house_balance, config, crank_signer]`. The arena PDA is the task
   authority (signs the schedule with its seeds), so `crank_signer =
   PDA([b"crank-executor", arena], Crank11111111111111111111111111111111111111)`.
   `task_id` = i64 from `nonce` LE (4 bytes) + the first 4 bytes of the arena key.

Steps 5 and 6 together cost ~40k CU (MagicSVM), so no `arm_run` split is needed.
Session checks use `session::authorize` (same rule as `session_auth_or`), because that
macro drops handler generics and `start_run` needs `'info` for the crank CPI.

### `vrf_callback_seed` (ER)
Guarded by `#[vrf_callback]`. If `arena.status == Staging && nonce == arena.nonce &&
!seed_ready`: `seed = u64::from_le_bytes(randomness[0..8])`, `seed_ready = true`,
`emit!(SeedSet)`. Otherwise no-op, so stale fulfilments are not retried.

### `tick` (ER)
Args: `nonce`. Accounts: `arena` (mut), `runner_balance` (mut, PDA of `arena.runner`),
`house_balance` (mut, PDA of `config.house`), `config`, `crank_signer` (signer, must equal
the arena's crank signer PDA). Only the scheduled crank can produce that signature.
If `nonce != arena.nonce` the call is a no-op, so a previous run's leftover iterations never
tick a newer run. The state machine is `Arena::advance` (unit-tested without Anchor); the
handler applies its payouts with checked math and emits `RunSettled` on entering Settled.

- **Idle:** no-op (leftover crank iterations).
- **Staging:** `phase_ticks += 1`. If `phase_ticks >= STAGING_TICKS && seed_ready` → Live.
  If `phase_ticks >= STAGING_TICKS + SEED_TIMEOUT_TICKS && !seed_ready` → **abort**: refund runner
  `entry_fee + bond` (house returns entry), return liquidity to house (each pool's
  `yes_r`, which still equals `liquidity` because `buy` needs the seed), all markets VOID,
  push result, → Settled.
- **Live:** `sim::step(&mut arena.sim, seed)`. Then markets:
  for each open market: if `t >= line` → resolve YES at `t` and credit the house (see
  settlement below). If `busted` → every open market resolves NO at `t`, then
  **settle run**.
- **Settled:** `phase_ticks += 1`; at `SETTLE_TICKS` → Idle.

Settlement when a market resolves (mid-run or at bust): the house is the LP, so it gets
the pool's winning-side tokens: YES → credit house `yes_r`; NO → credit house `no_r`.
Each YES resolution emits `LineCrossed { arena, nonce, market, t }`.

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

Args: `market u8`, `side` (enum `Yes | No`), `amount u64`, `min_shares u64`.

Checks:
- `arena.status ∈ {Staging, Live}`, `arena.seed_ready` (else `SeedNotReady`),
  `markets[m].status == open`. Requiring the seed means a run that aborts for lack of VRF
  has no trades, so its VOID markets owe nobody anything.
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
Args: `entry_index`. Accounts: `signer`, `session_token` (opt), `trader_balance` (mut),
`house_balance` (mut), `config`, `arena` (read-only, so claims never wait on the crank's
write lock). An empty entry gives `NoEntry`; an entry from another arena `InvalidArena`;
a refund the house cannot cover `HouseInsufficient`. Emits
`Claimed { owner, arena, nonce, market, paid }`.

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
`ceil_div` keeps the remainder in the pool, so `pool reserve + buyers' shares` equals the
collateral exactly; a MagicSVM test checks the vault against balances plus unclaimed
winning shares to the unit. `fee` and `runner_fee` round down.

Properties to unit-test (property tests with random inputs):
- `shares >= a` (you always get at least 1 share per unit spent).
- `k` never decreases (`y2 * n1 >= y * n`).
- Price moves in the direction of the buy.
- Overflow returns an error, never panics.

`programs/sirenrun/tests/fpmm.rs` writes `packages/test-vectors/fpmm.json` (fills, `mul_bps`,
and full quotes through `Arena::buy`); the TS price helpers in `packages/sdk` must match it.

## Solvency argument (write it in a test comment)

Every buy mints `net` complete sets (one YES + one NO per unit). Per market, total
winning-side tokens = `liquidity + Σ net` = collateral received. Winners hold some, the
pool holds the rest (`yes_r` or `no_r`), which is credited to the house. So payouts ≤
collateral. Void refunds are debited from the house balance, and voided shares are never
paid, so they cannot create money. NO-side tanking profit is capped by the driver's
forfeited bond. Max house loss per market ≤ `liquidity`.

Test: `programs/sirenrun/tests/solvency.rs` drives 60 random runs (random driver,
traders, sides, amounts, aborts, late and expired claims) through the same pure logic the
instructions call (`Arena::start`, `advance`, `buy`, `claim`) and asserts
`Σ Balance.available <= deposits` after every run. The MagicSVM test checks the onchain
version to the unit: after all claims, the vault equals the sum of all balances.

## Errors (`errors.rs`)

`ArenaBusy, ArenaNotLive, MarketClosed, InsufficientBalance, HouseInsufficient,
TooLarge, Slippage, NoInterestCapReached, RunnerCannotTrade, NoFreeEntry, NotResolved,
ResultExpired, InvalidLane, Unauthorized, MathOverflow, SeedNotReady, InvalidConfig,
InvalidArena, NoEntry, BalanceInUse, ArenaNotSettled`.

Codes are `6000 + position`, so new variants are appended, never inserted. (`TickTooSoon`
was removed before any deployment, together with `last_tick_slot`.)
`InvalidArena`: `init_arena` requires `id < ARENAS` (3).
`InvalidConfig`: `init_config` / `update_config` reject `fee_bps > 10_000`,
`runner_fee_bps > fee_bps`, `liquidity == 0` or `max_buy == 0`.

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
