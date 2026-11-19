# MagicBlock integration

Sources: docs.magicblock.gg, the `magicblock-engine-examples` repo and the MagicBlock dev
skill (synced 2026-11-19). Where the sources are silent, this file says **SPIKE**: prove it
with a tiny test before building on it.

## 0. MagicBlock dev skill for Claude Code

```bash
npx skills add https://github.com/magicblock-labs/magicblock-dev-skill
```
It covers base vs ER connections, delegation/commit/undelegate, cranks, VRF, session keys
and version setup. Follow it over memory; it tracks the deployed validators.

## 1. Versions

| Tool | Version |
|---|---|
| Solana (Agave) CLI | 4.1.2 |
| Anchor (CLI, `anchor-lang`, `anchor-spl`) | 1.2.2 |
| `ephemeral-rollups-sdk` | 0.18.0, features `anchor`, `vrf`, `crank` |
| `session-keys` | 3.1.1, feature `no-entrypoint` |
| Node | 24 LTS |

```toml
[dependencies]
anchor-lang = { version = "=1.2.2", features = ["init-if-needed"] }
anchor-spl = "=1.2.2"
ephemeral-rollups-sdk = { version = "=0.18.0", features = ["anchor", "vrf", "crank"] }
session-keys = { version = "=3.1.1", features = ["no-entrypoint"] }
```

Why these and not newer or older:

- **SDK 0.18.x** supports MagicBlock validator 1.x and 2.0. Only devnet-us runs 2.0; Asia,
  EU and the rest run 1.x. SDK 0.20.x is the 2.0-only line, and its `#[vrf]` macro does not
  compile. A bare `cargo add ephemeral-rollups-sdk` or `npm i @magicblock-labs/ephemeral-rollups-sdk`
  installs 0.20, so always pin the version (npm dist-tag `legacy` = 0.18.0).
- **Anchor 1.2.2** with the crates above passes `cargo check` with `#[ephemeral]`,
  `#[delegate]`, `#[vrf]`, `#[vrf_callback]` and a `Session` context (2026-11-20). With
  Anchor 1.0.2 the same set fails: its macro crates float to 1.2.x and `session-keys`
  stops compiling. Keep every `anchor-*` crate on the same exact version and commit
  `Cargo.lock`.
- **Solana 4.1.2** is the version the Anchor 1.2.2 release notes recommend.

## 2. Endpoints and validator identities (devnet)

| What | URL | Validator identity |
|---|---|---|
| Solana devnet RPC | `https://api.devnet.solana.com` (or `https://rpc.magicblock.app/devnet`) | |
| Magic Router | `https://devnet-router.magicblock.app` | |
| ER Asia (1.x) | `https://devnet-as.magicblock.app` | `MAS1Dt9qreoRMQ14YQuhg8UTZMMzDdKhmkZMECCzk57` |
| ER EU (1.x) | `https://devnet-eu.magicblock.app` | `MEUGGrYPxKk17hCr7wpT6s8dtNokZj5U2L57vjYMS8e` |
| ER US (2.0) | `https://devnet-us.magicblock.app` | `MUS3hc9TCw4cGC12vHNoYcCGzJG1txjgQLZWVoeNHNd` |
| Local ER | `http://localhost:7799`, ws `:7800` | `mAGicPQYBMvcYveUZA5F5UNNwyHvfYh5xkLS2Fr1mev` |
| Mainnet ER | contact MagicBlock | |

We use **Asia**. Delegate every account to the same identity and send ER transactions to
the matching endpoint. Do not use the router for delegation: it can place accounts on
devnet-us (2.0), where cranks and commit receipts behave differently. Keep the region in
one env var: `NEXT_PUBLIC_ER_REGION=as`. Check `getVersion` on the target ER before relying
on version-specific behavior (2.0 reports `core`, 1.x reports `magicblock-core`).

## 3. Program skeleton

```rust
use anchor_lang::prelude::*;
use ephemeral_rollups_sdk::anchor::{delegate, ephemeral};

#[ephemeral] // must come before #[program]; injects the undelegation callback
#[program]
pub mod sirenrun { /* thin handlers calling instructions::* */ }
```

### Delegation (base layer)
`#[delegate]` on the accounts struct, `#[account(mut, del)]` on the PDA, then:

```rust
use ephemeral_rollups_sdk::cpi::DelegateConfig;

ctx.accounts.delegate_pda(
    &ctx.accounts.payer,
    &[b"arena", &[id]],                       // the PDA's seeds
    DelegateConfig {
        validator: ctx.remaining_accounts.first().map(|a| a.key()),  // the Asia identity
        ..Default::default()
    },
)?;
```
Same for `Balance` with seeds `[b"balance", owner]`.

### Commit / undelegate (ER)
```rust
use ephemeral_rollups_sdk::ephem::MagicIntentBundleBuilder;

balance.exit(&crate::ID)?;   // serialize before the CPI
MagicIntentBundleBuilder::new(payer, magic_context, magic_program)
    .commit_and_undelegate(&[balance_info])
    .build_and_invoke()?;
```
The builder takes owned `AccountInfo`s. Do not use the deprecated free functions
`commit_accounts` / `commit_and_undelegate_accounts`. After this, the client polls the base
layer until the Balance's owner is our program again, then sends `withdraw`.

Optional: at run settle, `commit` (not undelegate) the arena so the latest result is
visible on the base layer. Not required for correctness.

## 4. VRF inside the ER (course seed)

- Request context gets `#[vrf]` (injects the VRF accounts and `invoke_signed_vrf`).
- `start_run` runs inside the ER, so the oracle queue is `vrf::consts::DEFAULT_EPHEMERAL_QUEUE`
  on devnet and `DEFAULT_EPHEMERAL_TEST_QUEUE` locally.
- Build the request with `create_request_randomness_ix_const(params, PROGRAM_IDENTITY)`, where
  `PROGRAM_IDENTITY = vrf::consts::program_identity_pubkey(&crate::ID)`. `params` is a
  `RequestRandomnessParams { payer, oracle_queue, callback_program_id: ID,
  callback_discriminator: instruction::VrfCallbackSeed::DISCRIMINATOR.to_vec(), caller_seed,
  accounts_metas: Some(vec![arena (writable)]), .. }`. Older examples call this
  `create_request_scoped_randomness_ix` (0.16 name); in 0.18 the non-`_const` form is deprecated.
- Callback context gets `#[vrf_callback]`. Without it the callback still compiles but
  accepts spoofed randomness. Never copy a callback that trusts the legacy global VRF
  identity (`9irBy75…`).
- Expected latency inside an ER: about 100 ms. The 10 s staging window is plenty.

## 5. Cranks (the 100 ms tick)

ER validator 1.x runs `MagicBlockInstruction::ScheduleTask` on the Magic program. Use the
SDK's `crank` feature:

```rust
#[allow(deprecated)] // the Hydra replacement only exists on validator 2.0
use ephemeral_rollups_sdk::crank::{CancelCrankCpi, ScheduleCrankCpi, ScheduleTaskArgs};
// ScheduleTaskArgs { task_id: i64, execution_interval_millis: i64, iterations: i64,
//                    instructions: Vec<Instruction> }
```

- `task_id` is global per validator. Derive it from program id, arena and run nonce so it
  can't collide with another app's task.
- `tick_ix` lists `arena`, `runner_balance`, `house_balance` as writable.
- Pass the arena as `AccountInfo` in the scheduling context so Anchor doesn't overwrite it
  with stale data after the CPI.
- Schedule from inside the ER after the arena is delegated. Keep preflight on for schedule
  and cancel transactions: on the ER, `skipPreflight` only hides errors.
- **Permissioned tick:** the scheduler can sign for one PDA,
  `[b"crank-executor", task_authority]` under `Crank11111111111111111111111111111111111111`.
  Add it read-only as a signer to `tick_ix` and require it in `tick`. Then only the crank
  can call `tick`, which stops anyone from speeding up a run by spamming it.

**SPIKE:** confirm (a) a 100 ms interval works and how regular it is, (b) the minimum
interval, (c) the iteration limit, (d) cancel, (e) who pays. Log `Clock::slot` per tick.

**Fallback if cranks fail the spike:** `scripts/keeper-tick.ts` sends `tick` every 100 ms
from a small Node process. Then `tick` is permissionless and needs the slot guard:
`last_tick_slot` plus `MIN_SLOTS` (measured in the spike), error `TickTooSoon`.

## 6. Session keys

Programs use `SessionTokenV2`. V1 and V2 tokens do not interoperate.

```rust
use session_keys::{session_auth_or, Session, SessionError, SessionTokenV2};

#[derive(Accounts, Session)]
pub struct Buy<'info> {
    #[account(mut, seeds = [b"balance", trader_balance.owner.as_ref()], bump = trader_balance.bump)]
    pub trader_balance: Account<'info, Balance>,
    #[session(signer = signer, authority = trader_balance.owner.key())]
    pub session_token: Option<Account<'info, SessionTokenV2>>,
    #[account(mut)]
    pub signer: Signer<'info>,
    // arena, house_balance, config …
}

#[session_auth_or(ctx.accounts.trader_balance.owner == ctx.accounts.signer.key(), SessionError::InvalidToken)]
pub fn buy(ctx: Context<Buy>, …) -> Result<()> { … }
```
- Client: `@magicblock-labs/gum-sdk`, `createSessionV2` / `revokeSessionV2` through
  `SessionTokenManager.program`. Not `gum-react-sdk`: its hooks only create V1 tokens.
- One wallet signature after connecting creates the token on the base layer (expiry 1 h).
  Keep the ephemeral keypair in memory. The optional lamports top-up is a one-time transfer,
  not a spending limit; limits live in our program (`max_buy`).
- Withdrawals stay wallet-only. Sessions cover `set_input`, `buy`, `claim`, `start_run`.
- Session program id: `KeyspM2ssCJbqUhQ4k7sveSiY4WjnYsrXkC8oDbwde5`.

**SPIKE:** confirm a session token created on the base layer is readable by the ER when
the session signer sends an ER transaction, and whether the signer needs lamports there.

## 7. Local development

Pinned to validator 1.1.1, the line the Asia ER runs:

```bash
# base validator :8899, ER :7799, public ER entrypoint :6699 (ws = port + 1)
npx --yes --package=@magicblock-labs/ephemeral-validator@1.1.1 mb-stack
```
`mb-stack` does not start a VRF oracle or the router; its `--vrf` / `--cranker` flags are
2.0 only. For VRF and crank tests use **MagicSVM** (`magicsvm` crate 0.3.0): base and ER
ledgers in one process, real delegation and Magic program paths, VRF fulfilment and the
1.1.1 crank scheduler, tests in milliseconds. It needs a newer host Rust than the program
build. Session keys program for local runs:
```bash
solana program dump -u devnet KeyspM2ssCJbqUhQ4k7sveSiY4WjnYsrXkC8oDbwde5 ./session-keys.so
```
`scripts/local-up.sh` wraps all of this in one command.

## 8. Client patterns (`packages/sdk`)

- Two `Connection`s: `base` and `er` (plus their websockets). Never mix.
- `sendEr(tx, signers)`: blockhash from the **ER** connection, sign with the session
  keypair, send with preflight on, confirm `processed`.
- `sendBase(tx)`: normal wallet-adapter flow.
- Subscriptions: `er.onAccountChange(arenaPda, …, "processed")`;
  `er.onLogs(programId, …)` for events.
- After `delegate_*` on base, wait until the account is readable on the ER before sending
  ER instructions (poll `er.getAccountInfo`).

## 9. Where MagicBlock is used

1. **Delegation:** Arena ×3 and every user's Balance live in the ER.
2. **Cranks:** a scheduled `tick` per run drives a 10 Hz onchain physics sim.
3. **VRF:** each course is seeded by ephemeral-queue VRF during staging.
4. **Session keys:** driving, trading, claiming without popups.
5. **Commit/undelegate:** balances return to Solana for withdrawals.

## 10. Known unknowns

| # | Question | Answered by |
|---|---|---|
| U1 | Crank min interval, regularity, iteration limit, cancel | MagicBlock spike |
| U2 | ER slot time (only needed for the keeper fallback) | MagicBlock spike |
| U3 | Session token readable in ER; session signer lamports | MagicBlock spike |
| U4 | VRF request + crank schedule fit in one instruction's compute | program run PR |
| U5 | ER websocket update rate to many subscribers | app scene PR |
| U6 | SBPF version the 1.x ER executes vs what Solana 4.1.2 builds by default | scaffold, then spike |
