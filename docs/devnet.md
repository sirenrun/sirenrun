# Devnet

## Addresses

| What | Address |
|---|---|
| Program | `6D65tPwcsoSoPK2qcXD87jcUQpMxwCjfX7tX7tKARiZ4` (deployed 2026-11-21) |
| Config PDA | `BwF2fRi8vCXBUAuJx1GajG61ymKAF4rFE9QRTi4YdWyu` |
| Arena PDAs 0, 1, 2 | `CSLE8p4H2zB2RRbsaFtKVYh5YKZVpRoc5tdrABMRV66B`, `2tRiPD6dbwchUBbte1X434Dy4NMNus1Xj4NwGgXSbpep`, `3PSeBtQ8WvVehxrN98QQdsAuaQk5sn45XD7KRk57KEnm` |
| tUSDC mint | `6B4g5L3Ep7FwhmsnNC5saupGySfs39T8o8BWTWFLVWQU` (6 decimals; also stored in Config) |
| ER (Asia) | `https://devnet-as.magicblock.app`, validator `MAS1Dt9qreoRMQ14YQuhg8UTZMMzDdKhmkZMECCzk57` |
| VRF queue (ER) | `5hBR571xnXppuCPveTrctfTU7tJLSN94nq7kv7FRK5Tc` |

The app reads the mint, house and fees from Config, so only the program id is hardcoded.

The default base RPC is `https://rpc.magicblock.app/devnet`: `api.devnet.solana.com`
rate-limits a browser that subscribes and polls (HTTP 429). Set `NEXT_PUBLIC_BASE_RPC` to
use another, e.g. a keyed provider for a public demo.

## Smoke run (2026-11-21)

Fresh program id for the run-economics account layout (Config 188 bytes, Arena 641); the
2026-11-20 deployment `8NnGx94QrpwcUW6LL7NBzbgrTPUfVyaLsd8iHnfserHj` is no longer used. The
tUSDC mint is unchanged.

Arena 0, run 1: the driver was busted at t = 274, so all three lines resolved NO. The trader
paid 8 tUSDC (5 YES on 30 s, 3 NO on 90 s) and claimed 0 + 3.43001, withdrawing 95.43001.
The driver paid entry 0.5 and lost only 0.49001 of the bond (the BUST profit owed on the
90 s line; that line had no RIDE holders, so the house kept it), earned 0.08 in runner fees
and withdrew 99.08999. Both match the program's math to the unit.

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

### Faucet key

The app's `/api/faucet` route mints test USDC, so it holds a key on the server. That key is
a dedicated faucet key, never the admin key: after `set-faucet` it is the tUSDC mint
authority and holds about 1 SOL, and nothing else.

```bash
solana-keygen new -o ~/.config/solana/sirenrun-faucet.json
SIRENRUN_MINT=<mint> SIRENRUN_FAUCET_KEYPAIR=~/.config/solana/sirenrun-faucet.json \
  pnpm --filter @sirenrun/scripts set-faucet
```

Then set `FAUCET_SECRET_KEY` on the app server (`app/.env.local` locally, the Vercel env
in production) to the contents of that file. Scripts that mint (`init-devnet`, `smoke`)
need `SIRENRUN_FAUCET_KEYPAIR` from then on. Each claim gives 100 tUSDC, plus 0.02 SOL when
the wallet holds less than 0.01 SOL, once per wallet per hour (in memory).

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

## Stats indexer

The stats (wallet PnL, analytics page, visitor counts) come from `indexer/`, a worker that
writes the program's ER events to Postgres. Put the database URL in `indexer/.env` and
`app/.env.local` as `DATABASE_URL` (never commit it), then:

```bash
pnpm --filter @sirenrun/indexer migrate   # create tables (also runs on every start)
pnpm --filter @sirenrun/indexer start     # follow events; backfills what it missed
```

Run it as an always-on process. On start it walks back from the last stored signature,
at most `INDEXER_MAX_BACKFILL` transactions (default 6000, about 3 minutes of ticks on
three live arenas), at roughly 30 transactions a second. Writes are idempotent, so
restarting is always safe. Transactions from program builds before the current event
layout are skipped. A slow first database connection is retried with backoff.

To test the SQL, point `TEST_DATABASE_URL` at a throwaway database (the suite drops its
tables) and run `pnpm --filter @sirenrun/indexer test`; without it that suite is skipped.
