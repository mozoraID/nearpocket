"use client";

import Link from "next/link";
import { Settings } from "lucide-react";
import { DemoPill } from "./DemoBanner";
import { WalletButton } from "./WalletButton";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { BRAND } from "@/config/brand";

export function TopBar({ title }: { title?: string }) {
  return (
    <header className="mb-5 flex min-h-14 items-start justify-between gap-2">
      <div className="min-w-0 flex-1">
        <Link href="/home" className="flex items-center gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-ink text-sm font-bold text-cream-100">
            N
          </span>
          <span className="truncate text-lg font-semibold tracking-tight">
            {title || BRAND.displayName}
          </span>
        </Link>
        <div className="mt-1.5">
          <DemoPill />
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5 pt-0.5">
        <LanguageSwitcher compact />
        <Link
          href="/settings"
          aria-label="Settings"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-cream-100 ring-1 ring-cream-300"
        >
          <Settings className="h-4 w-4" />
        </Link>
        <WalletButton />
      </div>
    </header>
  );
}
