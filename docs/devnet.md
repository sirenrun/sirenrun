# Devnet

## Addresses

| What | Address |
|---|---|
| Program | `8NnGx94QrpwcUW6LL7NBzbgrTPUfVyaLsd8iHnfserHj` (deployed 2026-11-20) |
| Config PDA | `45ZPR1NTLK9adm2RnvJDF4Rk5N2CE2x9CTfYdEmwz3Rq` |
| Arena PDAs 0, 1, 2 | `4JJZ8iHwasVhBNgXhVCaPSVsbb9BkRgsyBv5YBj165UD`, `GAzj9xcnbsTHkZSc4e62u79atXzWzDAtmFpyzJtwbSMX`, `6dfuJvcBt5YRf7XtgnTFHUxzhvQdp3C7EzYwC8MkrMh4` |
| tUSDC mint | set by `create-mint`; also stored in Config |
| ER (Asia) | `https://devnet-as.magicblock.app`, validator `MAS1Dt9qreoRMQ14YQuhg8UTZMMzDdKhmkZMECCzk57` |
| VRF queue (ER) | `5hBR571xnXppuCPveTrctfTU7tJLSN94nq7kv7FRK5Tc` |

The app reads the mint, house and fees from Config, so only the program id is hardcoded.

## Setup

The admin wallet is the config admin, the tUSDC mint authority and the house. It defaults
to `~/.config/solana/id.json`; set `SIRENRUN_ADMIN_KEYPAIR` to use another file.

```bash
anchor build
solana program deploy target/deploy/sirenrun.so \
  --program-id target/deploy/sirenrun-keypair.json -u devnet   # needs ~5.5 SOL at peak
pnpm --filter @sirenrun/scripts create-mint                     # prints SIRENRUN_MINT
SIRENRUN_MINT=<mint> pnpm --filter @sirenrun/scripts init-devnet
SIRENRUN_MINT=<mint> pnpm --filter @sirenrun/scripts smoke
```

`init-devnet` is idempotent: it creates Config, funds the house balance with 10,000 tUSDC
and delegates it, and creates and delegates arenas 0 to 2, skipping whatever exists.

`smoke` makes a fresh driver and trader (0.03 SOL and 100 tUSDC each), starts a run on
arena 0 with the driver's session key, buys YES on the 30 s line and NO on the 90 s line
once the VRF seed lands, steers perfectly for 35 s and then stops, claims after
settlement, undelegates, withdraws and revokes both sessions. It exits non-zero unless
two trades landed and a claim paid out.

## Local stack

`SIRENRUN_CLUSTER=local` points the scripts at `scripts/local-up.sh`. Everything up to
`start_run` works there, but `start_run` fails: the local VRF build charges a 500,000
lamport fee on the ephemeral test queue, which the ER refuses to take from a non-delegated
payer. The devnet ephemeral queue is fee-exempt
([solana-vrf `fees.rs`](https://github.com/magicblock-labs/solana-vrf/blob/main/program/src/fees.rs)),
and the local stack has no VRF oracle anyway, so full runs need devnet or MagicSVM.

The local ER can serve a stale copy of an account cached before `--reset` when the same
keypair is reused; use fresh keypairs per local session.
