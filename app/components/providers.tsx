"use client";

import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import "@solana/wallet-adapter-react-ui/styles.css";
import type { ReactNode } from "react";
import { chain } from "../lib/chain";

/**
 * Wallets come from Wallet Standard (Phantom, Solflare, Backpack register themselves), so no
 * adapter list is bundled. The adapter's connection is only used to detect the network; all
 * transactions go through the SDK's `sendBase` / `sendEr`.
 */
const wallets: never[] = [];

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ConnectionProvider endpoint={chain().endpoints.baseRpc}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
