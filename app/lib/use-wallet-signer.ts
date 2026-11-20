import { useWallet } from "@solana/wallet-adapter-react";
import type { WalletSigner } from "@sirenrun/sdk";
import { useMemo } from "react";

/** The connected wallet as the SDK's signer, or null when it cannot sign transactions. */
export function useWalletSigner(): WalletSigner | null {
  const { publicKey, signTransaction } = useWallet();
  return useMemo(
    () =>
      publicKey === null || signTransaction === undefined ? null : { publicKey, signTransaction },
    [publicKey, signTransaction],
  );
}
