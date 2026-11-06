"use client";

import { BottomNav } from "./BottomNav";
import { useNearPocketStore } from "@/lib/store";
import { useEffect } from "react";

/** Chrome for the in-app wallet (tabs). Used under /app and legacy deep links. */
export function WalletShell({ children }: { children: React.ReactNode }) {
  const connectDemo = useNearPocketStore((s) => s.connectDemo);
  const accountId = useNearPocketStore((s) => s.accountId);

  useEffect(() => {
    if (!accountId) connectDemo();
  }, [accountId, connectDemo]);

  return (
    <div className="min-h-dvh bg-cream-300/60 text-ink">
      <div className="relative mx-auto min-h-dvh w-full max-w-[440px] bg-cream-200 px-5 pb-28 pt-4 shadow-[0_0_0_1px_#ece4d6] sm:shadow-[0_0_60px_rgba(17,17,17,0.06)]">
        {children}
      </div>
      <BottomNav />
    </div>
  );
}
