"use client";

import { PrivyProvider } from "@privy-io/react-auth";

const APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID || "";

/**
 * Wraps children with Privy when NEXT_PUBLIC_PRIVY_APP_ID is set at build time.
 * Without an App ID, children render unchanged (Google button stays disabled).
 */
export function PrivyClientProvider({ children }: { children: React.ReactNode }) {
  if (!APP_ID) return <>{children}</>;
  return (
    <PrivyProvider
      appId={APP_ID}
      config={{
        loginMethods: ["google"],
        appearance: {
          theme: "light",
          accentColor: "#111111",
          showWalletLoginFirst: false,
        },
      }}
    >
      {children}
    </PrivyProvider>
  );
}

export const PRIVY_APP_ID = APP_ID;
