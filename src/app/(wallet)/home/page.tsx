"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ScanLine, Plus, ShoppingBag, ChevronRight, Bot } from "lucide-react";
import { TopBar } from "@/components/TopBar";
import { TopUpSheet } from "@/components/TopUpSheet";
import { ActivityRow } from "@/components/ActivityList";
import { useNearPocketStore } from "@/lib/store";
import { AddressRequiredError, defaultAddress, formatShipTo } from "@/lib/address";
import { approveWaitlistItem, rejectWaitlistItem } from "@/lib/client/agent";
import { SpendDecision } from "@/components/SpendDecision";
import { useT } from "@/lib/i18n";
import { useDisplayFx } from "@/hooks/useDisplayFx";
import { useChainBalances } from "@/hooks/useChainBalances";

export default function HomePage() {
  const t = useT();
  const balanceUsdc = useNearPocketStore((s) => s.balanceUsdc);
  const demoMode = useNearPocketStore((s) => s.demoMode);
  const waitlist = useNearPocketStore((s) => s.waitlist);
  const ensureDemoWaitlist = useNearPocketStore((s) => s.ensureDemoWaitlist);
  const { balances, loaded: balancesLoaded, real } = useChainBalances();
  const activity = useNearPocketStore((s) => s.activity);
  const addresses = useNearPocketStore((s) => s.addresses);
  const { localFromUsdc, rateLine, meta } = useDisplayFx();
  const [topUpOpen, setTopUpOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const savedAddress = mounted ? defaultAddress(addresses) : null;
  const shipLine = savedAddress ? formatShipTo(savedAddress) : "";
  const hasAddress = Boolean(savedAddress);

  useEffect(() => {
    setMounted(true);
    if (new URLSearchParams(window.location.search).get("topup")) setTopUpOpen(true);
  }, []);

  useEffect(() => {
    if (mounted && demoMode) ensureDemoWaitlist();
  }, [mounted, demoMode, ensureDemoWaitlist]);

  const pending = waitlist.filter((w) => {
    if (w.status !== "awaiting_approval") return false;
    if (!demoMode && (w.notes === "demo" || w.id.startsWith("demo_"))) return false;
    return true;
  });
  const chainTotal = balances
    ? balances.walletUsdc + balances.escrowAvailableUsdc + balances.escrowLockedUsdc
    : null;
  const bal = !mounted ? 0 : real ? chainTotal ?? 0 : balanceUsdc;

  async function approve(id: string) {
    const item = waitlist.find((w) => w.id === id);
    if (!item) return;
    setBusyId(id);
    setMsg(null);
    try {
      const result = await approveWaitlistItem(item, t("escrow.approved", { title: item.title }));
      if (result.kind === "chain") {
        setMsg(
          result.txHash
            ? t("pay.onchain")
            : result.detailCode === "needs-escrow"
              ? t("shop.needsEscrow", { amount: result.detail || "0.00" })
              : result.detailCode === "legacy-contract"
                ? t("shop.chainLegacy")
                : result.detail || t("home.approveFailed"),
        );
      } else {
        setMsg(result.gasCovered ? t("receipt.gasCovered") : t("home.bought", { title: item.title }));
      }
    } catch (e) {
      setMsg(e instanceof AddressRequiredError ? t("shop.needAddress") : e instanceof Error ? e.message : t("home.approveFailed"));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main>
      <TopBar />

      {mounted && pending.length > 0 && (
        <section className="mb-4 space-y-2">
          {pending.slice(0, 2).map((w) => (
            <div key={w.id} className="rounded-3xl bg-ink p-4 text-cream-100">
              <div className="flex items-center gap-2 text-xs text-cream-400">
                <Bot className="h-4 w-4" /> {t("home.agentNeedsOk")}
                {w.mocked || w.notes === "demo" ? (
                  <span className="rounded-full bg-cream-100/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-cream-300">
                    {t("common.demo")}
                  </span>
                ) : null}
              </div>
              <p className="mt-1 font-semibold">{w.title}</p>
              <p className="text-sm text-cream-400">
                {w.currentPriceUsdc.toFixed(2)} USDC · {w.marketplace || w.merchant}
                {w.maxBudgetUsdc ? ` · ${t("home.budgetPart", { amount: w.maxBudgetUsdc })}` : ""}
              </p>
              {hasAddress ? (
                <p className="mt-1 text-xs text-cream-300">{t("shop.shipTo", { address: shipLine })}</p>
              ) : (
                <p className="mt-1 text-xs text-cream-300">{t("shop.addressAtCheckout")}</p>
              )}
              <SpendDecision
                item={w}
                busy={busyId === w.id}
                variant="cream"
                onApprove={() => approve(w.id)}
                onReject={async () => {
                  setBusyId(w.id);
                  try {
                    await rejectWaitlistItem(w, t("escrow.rejected", { title: w.title }));
                  } finally {
                    setBusyId(null);
                  }
                }}
              />
            </div>
          ))}
          {msg && (
            <p className="px-1 text-sm text-warm-600">
              {msg}{" "}
              {!hasAddress && (
                <Link href="/settings" className="underline">
                  {t("address.title")}
                </Link>
              )}
            </p>
          )}
        </section>
      )}

      <section className="rounded-[28px] bg-cream-100 p-6 ring-1 ring-cream-300">
        <p className="text-sm text-warm-600">{real ? t("home.balanceOnChain") : t("home.balanceDemo")}</p>
        <p className="mt-1 text-[40px] font-bold leading-none tracking-tight">
          {(real && !balancesLoaded ? "…" : bal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }))}
          <span className="ml-2 text-lg font-semibold text-warm-500">USDC</span>
        </p>
        {real && balances && (
          <p className="mt-2 text-sm text-warm-600">
            {t("home.balanceSplit", {
              wallet: balances.walletUsdc.toFixed(2),
              available: balances.escrowAvailableUsdc.toFixed(2),
              locked: balances.escrowLockedUsdc.toFixed(2),
            })}
          </p>
        )}
        <p className="mt-2 text-sm text-warm-600">{localFromUsdc(bal)}</p>
        {rateLine && meta.code !== "USD" && (
          <p className="mt-1 text-[11px] text-warm-500">{rateLine}</p>
        )}
      </section>

      <section className="mt-4 grid grid-cols-3 gap-3">
        <Link href="/pay" className="flex flex-col items-center gap-2 rounded-3xl bg-ink px-2 py-4 text-cream-100">
          <ScanLine className="h-6 w-6" />
          <span className="text-sm font-semibold">{t("home.scanPay")}</span>
        </Link>
        <button
          type="button"
          onClick={() => setTopUpOpen(true)}
          className="flex flex-col items-center gap-2 rounded-3xl bg-cream-100 px-2 py-4 ring-1 ring-cream-300"
        >
          <Plus className="h-6 w-6" />
          <span className="text-sm font-semibold">{t("home.topUp")}</span>
        </button>
        <Link
          href="/shop"
          className="flex flex-col items-center gap-2 rounded-3xl bg-cream-100 px-2 py-4 ring-1 ring-cream-300"
        >
          <ShoppingBag className="h-6 w-6" />
          <span className="text-sm font-semibold">{t("home.shop")}</span>
        </Link>
      </section>

      <section className="mt-7">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-base font-semibold">{t("home.recent")}</h2>
          <Link href="/activity" className="flex items-center text-sm text-warm-600">
            {t("home.seeAll")} <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
        {!mounted || activity.length === 0 ? (
          <div className="card text-center">
            <p className="font-medium">{t("home.noActivity")}</p>
            <p className="mt-1 text-sm text-warm-600">{t("home.noActivityHint")}</p>
            <Link href="/pay" className="btn-outline mt-4">
              {t("home.trySample")}
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-cream-300 rounded-3xl bg-cream-100 px-4 ring-1 ring-cream-300">
            {activity.slice(0, 5).map((a) => (
              <ActivityRow key={a.id} a={a} />
            ))}
          </div>
        )}
      </section>

      <TopUpSheet open={topUpOpen} onClose={() => setTopUpOpen(false)} />
    </main>
  );
}
