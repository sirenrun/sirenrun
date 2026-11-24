# MagicBlock spike results

Measured 2026-11-20 on the local stack from `scripts/local-up.sh`: base `solana-core 4.1.2`,
ER `magicblock-core 1.1.1` (the line the Asia devnet ER runs). Program built with Anchor 1.2.2
and `ephemeral-rollups-sdk` 0.18.0. The throwaway spike program and script are in this
branch's history (`chore(spike): ...` commit) and were removed before merge.

Each crank test scheduled one task that increments a delegated counter and stores
`Clock::slot`. The client subscribed to the account on the ER and timed every update.

## U1: cranks

| Interval | Ran | Wall gap p50 / p95 / max | Slots between ticks | Payer cost |
|---|---|---|---|---|
| 100 ms | 100 / 100 in 10.1 s | 100 / 102 / 104 ms | 2 | 0 |
| 50 ms | 100 / 100 in 5.0 s | 50 / 52 / 56 ms | 1 | 0 |
| 10 ms | 100 / 100 in 1.0 s | 10 / 11 / 41 ms | 0 or 1 | 0 |
| 100 ms, crank-signer tick | 50 / 50 in 5.0 s | 100 / 101 / 102 ms | 2 | 0 |

- **100 ms works and is regular.** No missed or doubled ticks.
- **Minimum interval:** 10 ms worked. On 1.1.1 the interval is not rounded up to whole slots
  (that rounding is a validator 2.0 rule). The program accepts 1 ms to `u32::MAX - 1` ms.
- **Iterations:** 1,000,000 was accepted. The program only requires at least 1.
- **Cancel:** `CancelCrankCpi` stopped a running task within one tick (380 → 381, then no
  change for 4 s). In 1.1.1 only the authority at account index 0 is checked; the
  `task_context` slot is not read.
- **Cost:** the scheduling payer's ER balance did not change.
- **Crank-only tick works.** The scheduled instruction lists
  `crank_signer = PDA([b"crank-executor", authority], Crank11111111111111111111111111111111111111)`
  as a read-only signer, and the handler requires
  `#[account(address = crank_signer(&authority))] crank_signer: Signer`. All 50 scheduled
  calls succeeded; a direct call without that signer was rejected.

## U2: ER slot time

50.0 ms per slot (measured over 5 s twice). A 100 ms crank fires every 2 slots.

## U3: session keys

- A `SessionTokenV2` created on the base layer (via `create_session_v2`, default validity)
  is readable by the ER without delegating it.
- A session signer with **0 lamports** can send ER transactions as fee payer: ER
  transactions are fee-free. No top-up is needed for ER-only actions.
- A different signer using the same token was rejected.

## Other findings

- **Delegation latency:** the probe account was readable on the ER 425 to 460 ms after the
  base delegation transaction.
- **The ER caches cloned programs.** After a program upgrade on the base, the running ER
  kept executing the old build (new instruction failed with Anchor error 101). Restart the
  local stack after redeploying. Devnet behavior is unchecked.
- **pnpm 11 blocks scripts on unapproved native builds.** `@solana/web3.js` 1.99 pulls in
  `bufferutil` and `utf-8-validate`; with their build scripts unapproved, pnpm refuses to
  run workspace scripts. The SDK PR must set a build policy in `pnpm-workspace.yaml`.
- **Peer warning:** web3.js 1.99 depends on `@solana/codecs` 5.x, which declares
  TypeScript `^5` as a peer. We use 6.0. Types-only, runtime unaffected.

## Decisions for the program PRs

1. Drive `tick` with a scheduled crank at 100 ms, one task per run, cancelled at settle.
2. Make `tick` crank-only with the crank-signer PDA, using the arena's authority as the task
   authority. This replaces the `last_tick_slot` slot guard; the keeper fallback is not
   needed. **Superseded 2026-11-24:** validator 2.0 rejects signers in scheduled
   instructions, so `tick` is open and rate-limited by `Config.min_tick_slots` (see
   [magicblock.md](magicblock.md#5-cranks-the-100-ms-tick)).
3. Sessions: create `SessionTokenV2` on the base layer with no lamport top-up.
