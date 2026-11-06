"use client";

import { DemoPill } from "./DemoBanner";
import { WalletButton } from "./WalletButton";
import { BRAND } from "@/config/brand";

export function TopBar({ title }: { title?: string }) {
  return (
    <header className="mb-5 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-ink text-sm font-bold text-cream-100">
            N
          </span>
          <span className="text-lg font-semibold tracking-tight">{title || BRAND.displayName}</span>
        </div>
        <div className="mt-1.5">
          <DemoPill />
        </div>
      </div>
      <WalletButton />
    </header>
  );
}
