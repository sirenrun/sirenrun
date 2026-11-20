import { BN, BorshCoder, type Idl } from "@anchor-lang/core";
import gplSessionIdl from "@magicblock-labs/gum-sdk/lib/idl/gpl_session.json" with { type: "json" };
import { Keypair, type Connection, type PublicKey, type Signer } from "@solana/web3.js";
import { PROGRAM_ID, SESSION_PROGRAM_ID } from "./constants.ts";
import {
  IdlInstructions,
  tagged,
  u64,
  type Authority,
  type BaseInstruction,
} from "./ix/instruction.ts";
import { sessionTokenPda } from "./pdas.ts";

/**
 * Session keys (MagicBlock `gpl_session`, `SessionTokenV2`). The instructions come from the
 * IDL that `@magicblock-labs/gum-sdk` ships, encoded with our Anchor coder so the app does
 * not also bundle gum's older Anchor client.
 */
const SESSION_IDL = gplSessionIdl as Idl;
const sessionProgram = new IdlInstructions(SESSION_IDL, SESSION_PROGRAM_ID);
const sessionCoder = new BorshCoder(SESSION_IDL);

/** One hour, the program's default. The program rejects more than a week. */
export const SESSION_SECONDS = 60 * 60;

export interface Session {
  /** Ephemeral key kept in memory only; it signs `set_input`, `buy`, `claim`, `start_run`. */
  keypair: Keypair;
  authority: PublicKey;
  token: PublicKey;
  /** Unix seconds. */
  validUntil: number;
}

export interface SessionToken {
  authority: PublicKey;
  targetProgram: PublicKey;
  sessionSigner: PublicKey;
  feePayer: PublicKey;
  validUntil: number;
}

export function sessionAuthority(session: Session): Authority {
  return { signer: session.keypair.publicKey, sessionToken: session.token };
}

export function isSessionLive(session: Pick<Session, "validUntil">, nowSeconds: number): boolean {
  return nowSeconds < session.validUntil;
}

/**
 * Starts a session for `authority` (the wallet, which also pays rent). Send the returned
 * instruction with `sendBase`; it carries the session keypair as an extra signer.
 * `topUpLamports` funds the session key, which ER transactions do not need.
 */
export function createSession(a: {
  authority: PublicKey;
  keypair?: Keypair;
  nowSeconds: number;
  seconds?: number;
  topUpLamports?: bigint;
}): { session: Session; ix: BaseInstruction } {
  const keypair = a.keypair ?? Keypair.generate();
  const validUntil = a.nowSeconds + (a.seconds ?? SESSION_SECONDS);
  const ix = createSessionIx({
    authority: a.authority,
    sessionSigner: keypair,
    validUntil,
    topUpLamports: a.topUpLamports,
  });
  const token = sessionTokenPda(keypair.publicKey, a.authority);
  return { session: { keypair, authority: a.authority, token, validUntil }, ix };
}

export function createSessionIx(a: {
  authority: PublicKey;
  sessionSigner: Signer;
  validUntil: number;
  topUpLamports?: bigint | undefined;
}): BaseInstruction {
  const signer = a.sessionSigner.publicKey;
  const instruction = sessionProgram.build(
    "create_session_v2",
    {
      top_up: a.topUpLamports !== undefined,
      valid_until: new BN(a.validUntil),
      lamports: a.topUpLamports === undefined ? null : u64(a.topUpLamports),
    },
    {
      session_token: sessionTokenPda(signer, a.authority),
      session_signer: signer,
      fee_payer: a.authority,
      authority: a.authority,
      target_program: PROGRAM_ID,
    },
  );
  return tagged("base", instruction, [a.sessionSigner]);
}

/**
 * Closes the token and returns its rent to the wallet. While the session is still valid the
 * program requires the authority's signature, which the IDL does not mark, so we do.
 */
export function revokeSessionIx(a: {
  authority: PublicKey;
  sessionSigner: PublicKey;
}): BaseInstruction {
  const instruction = sessionProgram.build(
    "revoke_session_v2",
    {},
    {
      session_token: sessionTokenPda(a.sessionSigner, a.authority),
      fee_payer: a.authority,
      authority: a.authority,
    },
  );
  for (const key of instruction.keys) {
    if (key.pubkey.equals(a.authority)) key.isSigner = true;
  }
  return tagged("base", instruction);
}

interface RawSessionToken {
  authority: PublicKey;
  target_program: PublicKey;
  session_signer: PublicKey;
  fee_payer: PublicKey;
  valid_until: { toString(): string };
}

export function decodeSessionToken(data: Buffer): SessionToken {
  const raw = sessionCoder.accounts.decode<RawSessionToken>("SessionTokenV2", data);
  return {
    authority: raw.authority,
    targetProgram: raw.target_program,
    sessionSigner: raw.session_signer,
    feePayer: raw.fee_payer,
    validUntil: Number(raw.valid_until.toString()),
  };
}

/** The token as the base layer stores it, or `null` if it was never created or is revoked. */
export async function fetchSessionToken(
  connection: Connection,
  token: PublicKey,
): Promise<SessionToken | null> {
  const info = await connection.getAccountInfo(token);
  return info === null ? null : decodeSessionToken(info.data);
}
