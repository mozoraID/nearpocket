"use client";

import { Suspense } from "react";
import { BottomNav } from "./BottomNav";
import { AuthGate } from "./AuthGate";

/** Chrome for the in-app wallet (tabs). Used under /app and legacy deep links. */
export function WalletShell({ children }: { children: React.ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center bg-cream-200 text-sm text-warm-600">
          Loading…
        </div>
      }
    >
      <AuthGate>
        <div className="min-h-dvh bg-cream-300/60 text-ink">
          <div className="relative mx-auto min-h-dvh w-full max-w-[440px] bg-cream-200 px-5 pb-28 pt-4 shadow-[0_0_0_1px_#ece4d6] sm:shadow-[0_0_60px_rgba(17,17,17,0.06)]">
            {children}
          </div>
          <BottomNav />
        </div>
      </AuthGate>
    </Suspense>
  );
}
