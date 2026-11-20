import { PublicKey } from "@solana/web3.js";

export const PROGRAM_ID = new PublicKey("8NnGx94QrpwcUW6LL7NBzbgrTPUfVyaLsd8iHnfserHj");

export const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
export const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey(
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
);

/** MagicBlock session-keys program (`SessionTokenV2`). */
export const SESSION_PROGRAM_ID = new PublicKey("KeyspM2ssCJbqUhQ4k7sveSiY4WjnYsrXkC8oDbwde5");

/**
 * VRF oracle queues that `start_run` accepts. The pinned TS SDK does not export them, so they
 * are copied from `ephemeral_rollups_sdk::vrf::consts` and checked by the sdk.json vectors.
 */
export const VRF_EPHEMERAL_QUEUE = new PublicKey("5hBR571xnXppuCPveTrctfTU7tJLSN94nq7kv7FRK5Tc");
export const VRF_EPHEMERAL_TEST_QUEUE = new PublicKey(
  "Sc9MJUngNbQXSXGP3F67KvKwVnhaYn6kcioxXNVowYT",
);

/** tUSDC has 6 decimals. */
export const TOKEN_DECIMALS = 6;
export const TOKEN_UNIT = 1_000_000n;

export const BPS_DENOMINATOR = 10_000n;
export const U64_MAX = (1n << 64n) - 1n;
export const U128_MAX = (1n << 128n) - 1n;
