"use client";

import Link from "next/link";
import { DemoBanner } from "@/components/DemoBanner";
import { StatusBadge } from "@/components/StatusBadge";
import { useNearlyStore } from "@/lib/store";
import { formatUsdc } from "@/lib/fx/quote";
import { QrCode, Globe, Store, ClipboardList, Sparkles, Shield } from "lucide-react";
import { WalletButton } from "@/components/WalletButton";
import { BRAND } from "@/config/brand";

export default function HomePage() {
  const balanceUsdc = useNearlyStore((s) => s.balanceUsdc);
  const policy = useNearlyStore((s) => s.policy);
  const receipts = useNearlyStore((s) => s.receipts);
  const waitlist = useNearlyStore((s) => s.waitlist);

  return (
    <main className="space-y-4">
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-cyan-300/80">
            {BRAND.displayName}
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">
            {BRAND.tagline}
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            QRIS · world rails · shop · shopping plans
          </p>
        </div>
        <WalletButton />
      </header>

      <DemoBanner />

      <section className="card relative overflow-hidden">
        <div className="absolute -right-6 -top-6 h-28 w-28 rounded-full bg-cyan-400/20 blur-2xl" />
        <p className="text-xs text-slate-400">Spendable balance</p>
        <p className="mt-1 text-3xl font-bold tracking-tight">
          {formatUsdc(balanceUsdc)}
        </p>
        <p className="mt-2 text-xs text-slate-400">
          Settles via NEAR Intents → USDC → licensed PJP (mocked in demo).
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <div className="rounded-2xl bg-black/25 px-3 py-2">
            <p className="text-[10px] text-slate-400">Daily agent limit</p>
            <p className="text-sm font-semibold">
              {policy.spentTodayUsdc.toFixed(2)} / {policy.dailyLimitUsdc} USDC
            </p>
          </div>
          <div className="rounded-2xl bg-black/25 px-3 py-2">
            <p className="text-[10px] text-slate-400">Per-item max</p>
            <p className="text-sm font-semibold">{policy.perItemMaxUsdc} USDC</p>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3">
        {[
          { href: "/pay", label: "Scan QRIS", desc: "ID + ASEAN QR", icon: QrCode },
          { href: "/pay?tab=world", label: "Worldwide", desc: "Card / link", icon: Globe },
          { href: "/shop", label: "Shop & sell", desc: "Merchant mode", icon: Store },
          { href: "/plans", label: "Shop plans", desc: "Multi-marketplace agent", icon: ClipboardList },
        ].map(({ href, label, desc, icon: Icon }) => (
          <Link key={href} href={href} className="card space-y-2 hover:bg-white/[0.07]">
            <Icon className="h-5 w-5 text-cyan-300" />
            <div>
              <p className="text-sm font-semibold">{label}</p>
              <p className="text-xs text-slate-400">{desc}</p>
            </div>
          </Link>
        ))}
      </section>

      <section className="card space-y-3">
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-violet-300" />
          <h2 className="text-sm font-semibold">Why judges care</h2>
        </div>
        <ul className="space-y-2 text-xs text-slate-300">
          <li className="flex gap-2">
            <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan-300" />
            Real EMVCo QR parser with per-country rails (QRIS, PromptPay, DuitNow, NETS, JPQR, KR).
          </li>
          <li className="flex gap-2">
            <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan-300" />
            Compliance-first: stablecoin → licensed PJP → fiat QR/card. Never crypto-to-merchant.
          </li>
          <li className="flex gap-2">
            <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan-300" />
            Shopping planner searches Tokopedia/Shopee/Lazada/Amazon… with on-chain spend policy.
          </li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-200">Recent receipts</h2>
        {receipts.length === 0 ? (
          <p className="card text-xs text-slate-400">
            No payments yet — try Pay QR with a sample payload.
          </p>
        ) : (
          receipts.slice(0, 4).map((r) => (
            <div key={r.merchantReceiptId} className="card flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium">{r.request.merchantName}</p>
                <p className="text-xs text-slate-400">
                  {r.request.localAmount} {r.request.localCurrency} ·{" "}
                  {formatUsdc(r.request.quote.totalUsdc)}
                </p>
              </div>
              <StatusBadge status={r.status} />
            </div>
          ))
        )}
      </section>

      {waitlist.some((w) => w.status === "awaiting_approval") && (
        <Link href="/agent" className="btn-primary w-full">
          Agent needs your approval ({waitlist.filter((w) => w.status === "awaiting_approval").length})
        </Link>
      )}
    </main>
  );
}
