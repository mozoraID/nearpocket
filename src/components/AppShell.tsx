"use client";

import { BottomNav } from "./BottomNav";
import { useNearlyStore } from "@/lib/store";
import { useEffect } from "react";

export function AppShell({ children }: { children: React.ReactNode }) {
  const connectDemo = useNearlyStore((s) => s.connectDemo);
  const accountId = useNearlyStore((s) => s.accountId);

  useEffect(() => {
    if (!accountId) connectDemo();
  }, [accountId, connectDemo]);

  return (
    <div className="min-h-dvh bg-[#070b14] text-slate-100">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_top,_#123047_0%,_transparent_55%),radial-gradient(ellipse_at_bottom_right,_#1a1040_0%,_transparent_40%)]" />
      <div className="relative mx-auto min-h-dvh max-w-md px-4 pb-24 pt-4">
        {children}
      </div>
      <BottomNav />
    </div>
  );
}
