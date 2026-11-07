"use client";

import { Suspense } from "react";
import { BottomNav } from "./BottomNav";
import { AuthGate } from "./AuthGate";
import { BrandSplash } from "./BrandSplash";

/** Chrome for the in-app wallet (tabs). Used under /app and legacy deep links. */
export function WalletShell({ children }: { children: React.ReactNode }) {
  return (
    <Suspense
      fallback={<BrandSplash detail="Loading wallet…" />}
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
