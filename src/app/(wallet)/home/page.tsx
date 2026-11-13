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
import { useT } from "@/lib/i18n";
import { useDisplayFx } from "@/hooks/useDisplayFx";

export default function HomePage() {
  const t = useT();
  const balanceUsdc = useNearPocketStore((s) => s.balanceUsdc);
  const waitlist = useNearPocketStore((s) => s.waitlist);
  const ensureDemoWaitlist = useNearPocketStore((s) => s.ensureDemoWaitlist);
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
    ensureDemoWaitlist();
    if (new URLSearchParams(window.location.search).get("topup")) setTopUpOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pending = waitlist.filter((w) => w.status === "awaiting_approval");
  const bal = mounted ? balanceUsdc : 0;

  async function approve(id: string) {
    const item = waitlist.find((w) => w.id === id);
    if (!item) return;
    setBusyId(id);
    setMsg(null);
    try {
      const receipt = await approveWaitlistItem(item);
      setMsg(
        receipt.gasCovered
          ? t("receipt.gasCovered")
          : receipt.chainNote === "needs-escrow"
            ? t("shop.needsEscrow", { amount: receipt.chainDetail || "0.00" })
            : receipt.chainNote === "legacy-contract"
              ? t("shop.chainLegacy")
              : receipt.chainNote === "owner-only"
                ? t("shop.ownerOnlyChain")
                : t("home.bought", { title: item.title }),
      );
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
              <p className="mt-1 text-xs text-cream-300">
                {hasAddress ? t("shop.shipTo", { address: shipLine }) : t("shop.needAddress")}
                {!hasAddress && (
                  <>
                    {" "}
                    <Link href="/settings" className="underline">{t("address.title")}</Link>
                  </>
                )}
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  className="h-11 rounded-full bg-cream-100 font-semibold text-ink disabled:opacity-40"
                  disabled={busyId === w.id || !hasAddress}
                  onClick={() => {
                    if (!hasAddress) {
                      setMsg(t("shop.needAddress"));
                      return;
                    }
                    approve(w.id);
                  }}
                >
                  {busyId === w.id ? t("home.paying") : t("home.approve")}
                </button>
                <button
                  type="button"
                  className="h-11 rounded-full border border-cream-400/40 font-semibold"
                  onClick={() => rejectWaitlistItem(w)}
                >
                  {t("home.reject")}
                </button>
              </div>
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
        <p className="text-sm text-warm-600">{t("home.balance")}</p>
        <p className="mt-1 text-[40px] font-bold leading-none tracking-tight">
          {bal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          <span className="ml-2 text-lg font-semibold text-warm-500">USDC</span>
        </p>
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
