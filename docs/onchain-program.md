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
| entry_fee | u64 | e.g. 0.5 tUSDC (500_000) |
| bond | u64 | e.g. 25 tUSDC; also the cap on what BUST can win per run |
| liquidity | u64 | per market, e.g. 50 tUSDC |
| max_buy | u64 | per trade, e.g. 50 tUSDC |
| nitro_fee | u64 | charged per nitro charge fired, e.g. 0.5 tUSDC |
| open_bps | [u16; 3] | opening RIDE (YES) price per line, e.g. [8500, 4500, 1500] |
| bump, vault_bump | u8, u8 | |

188 bytes. Read-only inside the ER (the ER reads non-delegated base accounts; verify
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
| runner_fees | u64 | accrued driver fee share |
| markets | [Market; 3] | |
| results | [RunResult; 16] | ring of finished runs |
| results_head | u8 | |

`Market` (57 bytes): `line u16, status u8 (0 open, 1 YES, 2 NO, 3 VOID), yes_r u64,
no_r u64, resolved_tick u32, house_yes u64, house_no u64, no_profit u64, ride_cost u64,
ride_back_bps u16`. `house_yes` / `house_no` are the tokens the house minted at an uneven
opening but kept out of the pool; `no_profit` is Σ (shares − net) over BUST buys on this
line; `ride_cost` is Σ net over RIDE buys; `ride_back_bps` is set on a bust (see settle run).
`RunResult` (23 bytes): `nonce u32, outcomes u8 (2 bits per market), resolved_ticks [u32; 3],
ride_back_bps [u16; 3]`.

641 bytes. Instructions take it as `Box<Account<Arena>>`: on the stack it pushed `start_run`
and `tick` past the 4 KB frame. No slot guard: `tick` only accepts the crank signer (see [spike-results.md](spike-results.md)), so `last_tick_slot` was dropped.

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
2. Debit house `3 * liquidity`; each market opens at `open_bps[m]` with `market::open_pool`
   (below), `status = open`, `resolved_tick = 0`, `no_profit = ride_cost = ride_back_bps = 0`.
3. Reset sim per [game-design.md](game-design.md) (`car_x = 2 * LANE_WIDTH`, `target_lane = 2`, `speed = SPEED_START`,
   `police_gap = GAP_START`, `nitro_left = 3`, …). `runner_fees = 0`.
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
  `entry_fee + bond` (house returns entry), return liquidity to house (each market's
  `yes_r + house_yes`, which still equals `liquidity` because `buy` needs the seed), all
  markets VOID, push result, → Settled.
- **Live:** nitro fee first: if the pending input will fire a charge (`nitro_will_fire`:
  pressed, a charge left, none burning), debit the runner `nitro_fee` and credit the house;
  if the runner's balance is short, clear `nitro_pressed` so no charge fires and nothing is
  charged. Unused charges cost nothing. Then `sim::step(&mut arena.sim, seed)`. Then markets:
  for each open market: if `t >= line` → resolve YES at `t` and credit the house (see
  settlement below). If `busted` → every open market resolves NO at `t`, then
  **settle run**.
- **Settled:** `phase_ticks += 1`; at `SETTLE_TICKS` → Idle.

Settlement when a market resolves (mid-run or at bust): the house is the LP, so it gets
its winning-side tokens, the pool's plus those it kept at the opening: YES → credit house
`yes_r + house_yes`; NO → credit house `no_r + house_no`.
Each YES resolution emits `LineCrossed { arena, nonce, market, t }`.

Settle run (once, at bust or hard stop):
- Bond. `owed = Σ no_profit` over the markets this bust resolved NO (lines already passed owe
  BUST nothing). `forfeit = min(bond, owed)`. Credit runner `runner_fees + bond − forfeit`
  and the house `forfeit`. For each of those markets,
  `ride_back_bps = min(10_000, (forfeit × no_profit / owed) × 10_000 / ride_cost)` (rounded
  down; 0 without RIDE buys): the house pays it back to that line's losing RIDE holders as they
  claim, and keeps any rest. A hard stop at 150 s has passed every line, so nothing is owed.
- Push `RunResult` into `results[results_head]`, advance head mod 16.
- `status = Settled`, `phase_ticks = 0`. `emit!(RunSettled { … })`.

Why only what BUST won: anyone may be the driver betting BUST from another wallet, so a bust
must take at least everything BUST holders win, or crashing on purpose would pay. Nothing
needs more than that. A run nobody bet against costs the driver only the entry fee and the
nitro used; the old rule (bond lost unless the 90 s line passed) took 25 tUSDC from a solo
driver for nothing. The forfeit goes to the RIDE holders on those lines, the fans who backed
the driver, rather than staying with the house.

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
    market.no_profit += shares - net
    require!(Σ no_profit over open markets <= arena.bond)   // NoInterestCapReached
else:
    market.ride_cost += net
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
    if outcome == entry.side:
        house.available += entry.shares   // the refunded winning tokens are now the house's
elif outcome == entry.side:
    trader.available += entry.shares      // 1 share = 1 unit
elif entry.side == YES and ride_back_bps > 0:
    back = entry.cost * ride_back_bps / 10_000
    trader.available += back              // share of the driver's forfeited bond
    house.available  -= back              // the house received the forfeit at the bust
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

open_pool(liquidity, open_bps):   // market/settle.rs; open_bps strictly in (0, 10_000)
  q = open_bps / 10_000           // opening YES price
  if q >= 1/2: no = liquidity, yes = floor(liquidity * (1 - q) / q)
  else:        yes = liquidity, no = floor(liquidity * q / (1 - q))
  house_yes = liquidity - yes, house_no = liquidity - no
```

The house mints `liquidity` complete sets per market; the pool gets reserves priced at the
opening odds and the house keeps the rest as plain tokens, so every token is accounted for.
Opening at the line's real odds matters: at a flat 50/50, the first trader on the 30 s line
(passed about 85% of the time) buys YES at 50% and takes the difference out of the house's
liquidity, about 0.4 × liquidity per market per run.
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
pool holds some (`yes_r` or `no_r`) and the house kept the rest at the opening
(`house_yes` or `house_no`); the last two are credited to the house. So payouts ≤
collateral. Void and cooldown refunds are debited from the house balance, and a refunded
winning position's shares are credited to the house instead of being paid, so refunds
cannot create money (and no token is left owned by nobody). RIDE refunds on a bust are
paid by the house out of the forfeit it received at the bust, and round down, so they never
exceed it. BUST tanking profit is capped by the driver's forfeit (see settle run). Max house
loss per market ≤ `liquidity`.

Test: `programs/sirenrun/tests/solvency.rs` drives 60 random runs (random driver,
traders, sides, amounts, aborts, nitro, uneven openings, RIDE refunds, late and expired
claims) through the same pure logic the
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

Events carry what the client and the indexer need to show a feed and total money per wallet;
no account stores trade history. Amounts are tUSDC base units (6 decimals).

| Event | Fields | Emitted by |
|---|---|---|
| `RunStarted` | `arena, nonce, runner, entry_fee, bond` | `start_run` |
| `SeedSet` | `arena, nonce` | `vrf_callback_seed` |
| `Trade` | `arena, nonce, market, side, net, shares, yes_r, no_r, owner, amount` | `buy` |
| `NitroUsed` | `arena, nonce, runner, fee` | `tick`, when a nitro charge fires and is paid |
| `LineCrossed` | `arena, nonce, market, t` | `tick` |
| `RunSettled` | `arena, nonce, t, outcomes, runner, runner_fees, runner_paid` | `tick`, once per run |
| `Claimed` | `owner, arena, nonce, market, paid` | `claim` |

- `Trade.owner` is the trader's wallet, not the session key. `amount` is what they spent, fees
  included; `net = amount - fee` is what went into the pool.
- `RunSettled.runner_paid` is everything credited to the driver at the end: `runner_fees`
  plus the bond left after a bust (or the whole bond when the run survived). For a run
  refunded because the seed never arrived, every outcome is `void` and `runner_paid` is the
  entry fee plus the bond.
- Driver PnL for a run: `runner_paid - entry_fee - bond - sum(NitroUsed.fee)`.
- Trader PnL: `sum(Claimed.paid) - sum(Trade.amount)` over the trader's wallet.

The client uses them for the trade feed, run stats and toasts; the indexer (`indexer/`)
stores them in Postgres for wallet stats and analytics.

## Admin scripts (`scripts/`)

- `create-mint.ts`: create tUSDC (6 decimals) on devnet, mint authority = admin.
- `init-devnet.ts`: `init_config`, house `init_balance` + deposit 10,000 tUSDC +
  delegate, `init_arena(0..2)` + delegate.
- `faucet`: the app's "Get test USDC" button calls a Next.js route that mints 100 tUSDC
  to the user (admin key in a Vercel env var; devnet only; rate-limited by wallet).
  It touches no game logic. The other server code is the read-only stats side (the
  `indexer/` worker and `app/api/stats`), which reads events and decides nothing.
- `keeper-tick.ts`: fallback ticker, only if scheduled cranks turn out unusable.

## Run economics

Defaults (set by `scripts/src/init-devnet.ts`, tunable with `update_config`): trade fee 2%
(1% house, 1% driver), entry 0.5, bond 25, liquidity 50 per market, nitro 0.5 per charge
fired, opening RIDE prices 85% / 45% / 15% for the 30 / 60 / 90 s lines. tUSDC is treated as
1 USD.

Where the money goes:

| Flow | Goes to |
|---|---|
| Entry fee | House |
| Trade fee, 2% of each buy | 1% house, 1% driver (paid at settle) |
| Nitro, per charge fired | House |
| Bond, after the run | Driver, minus the forfeit |
| Forfeit (what BUST won on the busted lines, at most the bond) | RIDE holders on those lines, pro rata to cost, up to their cost; any rest to the house |
| Pool remainder at resolution | House (it provided the liquidity) |

The opening prices come from simulating the program's own rules (an exact port of
`sim/`) with a mix of drivers: 25% good (miss 5% of rows), 50% average (12%), 25% weak (20%).
Their pass rates are about 88% / 49% / 17%; real players do a little worse, hence 85 / 45 / 15.
Opening there instead of 50/50 removes the first trader's free profit out of the house's
liquidity, which was about 34 tUSDC per run with 10 traders watching.

Expected result per run in the same simulation, where sharp traders keep each line at its
fair odds second by second and fans bet 1 to 10 tUSDC:

| Crowd | Driver (before) | Driver (now) | Fans' return | House (now) |
|---|---|---|---|---|
| Nobody trades | −22.0 | −1.9 | | +1.9 |
| 3 casual fans | −22.0 | −5.4 | +17% | −0.4 |
| 10 fans + sharps | −17.1 | −18.3 | −4% (was −17%) | +5.4 |
| 100 fans + sharps | −16.5 | −19.3 | −8% (was −13%) | +21.5 |

A driver nobody bets against now loses only the entry and the nitro used. With sharp traders
in the crowd the BUST side fills to the cap, so a busted driver forfeits about the bond, but
that money now refunds the fans who backed them instead of going to the house. The bond is
the one dial: a 15 tUSDC bond puts about 11 at risk per bust, 10 about 7, at the cost of fewer
BUST bets fitting under the cap.

