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
import { ApprovalCard } from "@/components/ApprovalCard";
import { SpendDecision } from "@/components/SpendDecision";
import { approvalCards } from "@/lib/near/approval-state";
import type { WaitlistItem } from "@/lib/agent/policy";
import { useT } from "@/lib/i18n";
import { useDisplayFx } from "@/hooks/useDisplayFx";
import { useChainBalances } from "@/hooks/useChainBalances";

export default function HomePage() {
  const t = useT();
  const balanceUsdc = useNearPocketStore((s) => s.balanceUsdc);
  const demoMode = useNearPocketStore((s) => s.demoMode);
  const waitlist = useNearPocketStore((s) => s.waitlist);
  const ensureDemoWaitlist = useNearPocketStore((s) => s.ensureDemoWaitlist);
  const { balances, loaded: balancesLoaded, real, stale } = useChainBalances();
  const activity = useNearPocketStore((s) => s.activity);
  const addresses = useNearPocketStore((s) => s.addresses);
  const { localFromUsdc, rateLine, meta } = useDisplayFx();
  const [topUpOpen, setTopUpOpen] = useState(false);
  const [pendingIds, setPendingIds] = useState<Record<string, true>>({});
  const isPending = (id: string) => Boolean(pendingIds[id]);
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

  const chainCards = approvalCards({
    real,
    requestsLoaded: Boolean(balances?.requestsLoaded),
    requests: balances?.requests,
    waitlist,
  });
  const demoPending = waitlist.filter((w) => {
    if (!demoMode || w.status !== "awaiting_approval") return false;
    return true;
  });
  const chainTotal = balances
    ? balances.walletUsdc + balances.escrowAvailableUsdc + balances.escrowLockedUsdc
    : null;
  const bal = !mounted ? 0 : real ? chainTotal ?? 0 : balanceUsdc;

  async function approve(item: WaitlistItem, amountUsdc6?: string, fromChain?: boolean) {
    if (!useNearPocketStore.getState().waitlist.some((row) => row.id === item.id)) {
      useNearPocketStore.getState().addWaitlist(item);
    }
    setPendingIds((cur) => ({ ...cur, [item.id]: true }));
    setMsg(null);
    try {
      const label = item.mocked ? t("shop.purchasedDemo") : t("escrow.approved", { title: item.title });
      const result = await approveWaitlistItem(item, label, t("shop.purchasedDemo"), {
        amountUsdc6,
        fromChain,
      });
      if (result.kind === "chain") {
        setMsg(
          result.ok
            ? t("pay.onchain")
            : result.detail || t("tx.failed"),
        );
      } else {
        setMsg(result.gasCovered ? t("receipt.gasCovered") : t("home.bought", { title: item.title }));
      }
    } catch (e) {
      setMsg(e instanceof AddressRequiredError ? t("shop.needAddress") : e instanceof Error ? e.message : t("home.approveFailed"));
    } finally {
      setPendingIds((cur) => {
        const next = { ...cur };
        delete next[item.id];
        return next;
      });
    }
  }

  return (
    <main>
      <TopBar />

      {mounted && demoMode && demoPending.length > 0 && (
        <section className="mb-4 space-y-2">
          {demoPending.slice(0, 2).map((w) => (
            <div key={w.id} className="rounded-3xl bg-ink p-4 text-cream-100">
              <div className="flex items-center gap-2 text-xs text-cream-400">
                <Bot className="h-4 w-4" /> {t("home.agentNeedsOk")}
                <span className="rounded-full bg-cream-100/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-cream-300">
                  {t("common.demo")}
                </span>
              </div>
              <p className="mt-1 font-semibold">{w.title}</p>
              <p className="text-sm text-cream-400">
                {w.currentPriceUsdc.toFixed(2)} USDC · {w.marketplace || w.merchant}
              </p>
              <SpendDecision
                item={w}
                busy={isPending(w.id)}
                variant="cream"
                onApprove={() => approve(w)}
                onReject={async () => {
                  setPendingIds((cur) => ({ ...cur, [w.id]: true }));
                  try {
                    await rejectWaitlistItem(w, t("escrow.rejected", { title: w.title }));
                  } finally {
                    setPendingIds((cur) => {
                      const next = { ...cur };
                      delete next[w.id];
                      return next;
                    });
                  }
                }}
              />
            </div>
          ))}
        </section>
      )}

      {mounted && real && chainCards.length > 0 && (
        <section className="mb-4 space-y-2">
          {chainCards.map((card) => (
            <ApprovalCard
              key={card.request.id}
              request={card.request}
              item={card.item}
              busy={isPending(card.request.id)}
              variant="cream"
              shipLine={hasAddress ? shipLine : ""}
              onApprove={() => approve(card.item, card.request.amountUsdc6, true)}
              onReject={async () => {
                setPendingIds((cur) => ({ ...cur, [card.request.id]: true }));
                try {
                  const result = await rejectWaitlistItem(card.item, t("escrow.rejected", { title: card.item.title }));
                  if (result.kind === "chain" && !result.ok) setMsg(result.detail || t("tx.failed"));
                } finally {
                  setPendingIds((cur) => {
                    const next = { ...cur };
                    delete next[card.request.id];
                    return next;
                  });
                }
              }}
            />
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
          {(real && !balancesLoaded && !balances ? "…" : bal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }))}
          <span className="ml-2 text-lg font-semibold text-warm-500">USDC</span>
        </p>
        {real && stale && <p className="mt-2 text-sm text-warm-600">{t("shop.balanceStale")}</p>}
        {real && balancesLoaded && !balances && (
          <p className="mt-2 text-sm text-warm-600">{t("home.balanceUnavailable")}</p>
        )}
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
