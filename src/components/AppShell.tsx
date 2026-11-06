"use client";

import { Providers } from "./Providers";
import { WalletShell } from "./WalletShell";

/** @deprecated Prefer Providers + WalletShell. Kept for compatibility. */
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <Providers>
      <WalletShell>{children}</WalletShell>
    </Providers>
  );
}
