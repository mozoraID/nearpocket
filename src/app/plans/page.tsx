"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { DemoBanner } from "@/components/DemoBanner";
import { StatusBadge } from "@/components/StatusBadge";
import { useNearlyStore } from "@/lib/store";
import {
  newItemId,
  newPlanId,
  type ShoppingPlan,
  type ShoppingPlanItem,
} from "@/lib/agent/plans";
import { checkSpend } from "@/lib/agent/policy";
import { formatUsdc, type FxQuote } from "@/lib/fx/quote";
import { buildCardSettlement, type SettlementReceipt } from "@/lib/settlement";
import { explorerTxUrl, NEAR_CONFIG } from "@/lib/near/config";
import type { MarketplaceOffer } from "@/lib/marketplaces/types";
import { BRAND } from "@/config/brand";

export default function PlansPage() {
  const plans = useNearlyStore((s) => s.plans);
  const upsertPlan = useNearlyStore((s) => s.upsertPlan);
  const updatePlan = useNearlyStore((s) => s.updatePlan);
  const removePlan = useNearlyStore((s) => s.removePlan);
  const policy = useNearlyStore((s) => s.policy);
  const setPolicy = useNearlyStore((s) => s.setPolicy);
  const balanceUsdc = useNearlyStore((s) => s.balanceUsdc);
  const debitUsdc = useNearlyStore((s) => s.debitUsdc);
  const recordReceipt = useNearlyStore((s) => s.recordReceipt);

  const [title, setTitle] = useState("Weekend groceries + gadgets");
  const [budget, setBudget] = useState("40");
  const [deadline, setDeadline] = useState(
    new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10),
  );
  const [prefs, setPrefs] = useState("Prefer free shipping, Indonesian sellers first");
  const [itemLine, setItemLine] = useState("Kopi arabica under 10 USDC");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [chain, setChain] = useState<{
    contractId: string;
    policy: { dailyLimitUsdc: number; spentTodayUsdc: number; perItemMaxUsdc: number } | null;
    sampleTxs?: Record<string, { hash: string; url: string }>;
  } | null>(null);

  useEffect(() => {
    fetch("/api/contract")
      .then((r) => r.json())
      .then(setChain)
      .catch(() => null);
  }, []);

  function createPlan() {
    const items: ShoppingPlanItem[] = itemLine
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((line) => {
        const price = line.match(/(\d+(?:\.\d+)?)/);
        const target = price ? parseFloat(price[1]) : 15;
        return {
          id: newItemId(),
          name: line,
          category: /kopi|coffee|snack|grocery/i.test(line)
            ? "groceries"
            : /earbud|phone|keyboard|gadget/i.test(line)
              ? "electronics"
              : "digital",
          targetPriceUsdc: target,
          maxPriceUsdc: target * 1.15,
          qty: 1,
          status: "queued" as const,
        };
      });

    const plan: ShoppingPlan = {
      id: newPlanId(),
      title: title.trim() || "Untitled plan",
      budgetUsdc: parseFloat(budget) || 40,
      spentUsdc: 0,
      deadline,
      preferences: prefs,
      marketplaces: ["tokopedia", "shopee", "lazada", "amazon", "ebay", "demo-mart"],
      status: "active",
      items,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    upsertPlan(plan);
    setMsg(`Plan created with ${items.length} item(s). Agent will search marketplaces.`);
  }

  async function runSearch(plan: ShoppingPlan) {
    setBusy(true);
    setMsg(null);
    try {
      const nextItems: ShoppingPlanItem[] = [];
      for (const item of plan.items) {
        if (["purchased", "rejected", "cancelled"].includes(item.status)) {
          nextItems.push(item);
          continue;
        }
        const res = await fetch(
          `/api/marketplaces?q=${encodeURIComponent(item.name)}&max=${item.maxPriceUsdc}`,
        );
        const data = await res.json();
        const offers = (data.offers || []) as MarketplaceOffer[];
        const best = offers.find((o) => o.inStock) || offers[0];
        let status: ShoppingPlanItem["status"] = "searching";
        let agentReason = "No offers yet.";
        if (best) {
          if (best.priceUsdc <= item.targetPriceUsdc) {
            status = "awaiting_approval";
            agentReason = `Best offer ${best.priceUsdc} USDC on ${best.marketplace} ≤ target. Waiting for your approval.`;
          } else if (best.priceUsdc <= item.maxPriceUsdc) {
            status = "ready";
            agentReason = `Within max (${best.priceUsdc} / ${item.maxPriceUsdc} USDC) on ${best.marketplace}.`;
          } else {
            status = "watching";
            agentReason = `Cheapest ${best.priceUsdc} USDC on ${best.marketplace} still above max. Watching.`;
          }
        }
        nextItems.push({
          ...item,
          status,
          offers: offers.slice(0, 6),
          bestOffer: best,
          agentReason,
        });
      }
      updatePlan(plan.id, { items: nextItems, status: "active" });
      setMsg("Marketplace search finished (Tokopedia/Shopee/Lazada mocked; Amazon-like via DummyJSON when reachable).");
    } finally {
      setBusy(false);
    }
  }

  async function approveItem(plan: ShoppingPlan, item: ShoppingPlanItem) {
    if (!item.bestOffer) return;
    setBusy(true);
    setMsg(null);
    try {
      const price = item.bestOffer.priceUsdc;
      if (plan.spentUsdc + price > plan.budgetUsdc) {
        throw new Error("Would exceed plan budget.");
      }
      const check = checkSpend(policy, price, item.category);
      if (!check.ok) throw new Error(check.reason);
      if (price > balanceUsdc) throw new Error("Insufficient USDC balance");

      const fxRes = await fetch(`/api/fx?currency=USD&amount=${price}`);
      const quote = (await fxRes.json()) as FxQuote;
      const req = buildCardSettlement({
        merchantName: `${item.bestOffer.marketplace}:${item.bestOffer.merchant}`,
        amountUsd: price,
        quote,
        destination: item.bestOffer.url,
      });
      req.note = `Shopping plan ${plan.id} / item ${item.id}. User approved.`;
      const res = await fetch("/api/settle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
      });
      const receipt = (await res.json()) as SettlementReceipt;
      debitUsdc(price);
      recordReceipt(receipt);
      updatePlan(plan.id, {
        spentUsdc: plan.spentUsdc + price,
        items: plan.items.map((it) =>
          it.id === item.id
            ? {
                ...it,
                status: "purchased",
                agentReason: `Purchased after approval. Partner ${receipt.partnerRef || "mock"}.`,
              }
            : it,
        ),
        lastTxHash: receipt.nearTxHash,
      });
      setMsg(`Approved & settled ${item.name} for ${formatUsdc(price)}.`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "approve failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold">Shopping plans</h1>
        <p className="text-sm text-slate-400">
          {BRAND.displayName} planner — search many marketplaces, you approve every buy
        </p>
      </header>
      <DemoBanner />

      {chain && (
        <div className="card space-y-2 text-xs">
          <p className="font-semibold text-cyan-200">On-chain policy (testnet)</p>
          <p>
            Contract{" "}
            <a
              className="text-cyan-300 underline"
              href={`${NEAR_CONFIG.explorerUrl}/address/${chain.contractId}`}
              target="_blank"
              rel="noreferrer"
            >
              {chain.contractId}
            </a>
          </p>
          {chain.policy && (
            <p>
              Daily {chain.policy.spentTodayUsdc}/{chain.policy.dailyLimitUsdc} USDC · per-item max{" "}
              {chain.policy.perItemMaxUsdc} USDC
            </p>
          )}
          {chain.sampleTxs?.approve_spend && (
            <p>
              Sample approve tx:{" "}
              <a className="text-cyan-300 underline" href={chain.sampleTxs.approve_spend.url} target="_blank" rel="noreferrer">
                {chain.sampleTxs.approve_spend.hash.slice(0, 10)}…
              </a>
            </p>
          )}
        </div>
      )}

      <section className="card space-y-3">
        <h2 className="text-sm font-semibold">Create a plan</h2>
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Plan title" />
        <div className="grid grid-cols-2 gap-2">
          <input className="input" value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="Budget USDC" />
          <input className="input" type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
        </div>
        <textarea className="input min-h-16" value={prefs} onChange={(e) => setPrefs(e.target.value)} />
        <textarea
          className="input min-h-24"
          value={itemLine}
          onChange={(e) => setItemLine(e.target.value)}
          placeholder={"One item per line\nEarbuds under 25 USDC"}
        />
        <button type="button" className="btn-primary w-full" onClick={createPlan}>
          Create plan & set agent
        </button>
      </section>

      <section className="card space-y-2">
        <h2 className="text-sm font-semibold">Agent spend policy (local + on-chain mirror)</h2>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs">
            Daily limit
            <input
              className="input mt-1"
              type="number"
              value={policy.dailyLimitUsdc}
              onChange={(e) => setPolicy({ dailyLimitUsdc: Number(e.target.value) })}
            />
          </label>
          <label className="text-xs">
            Per-item max
            <input
              className="input mt-1"
              type="number"
              value={policy.perItemMaxUsdc}
              onChange={(e) => setPolicy({ perItemMaxUsdc: Number(e.target.value) })}
            />
          </label>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={policy.paused} onChange={(e) => setPolicy({ paused: e.target.checked })} />
          Pause agent
        </label>
      </section>

      {msg && (
        <p className="rounded-2xl border border-cyan-500/20 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-100">{msg}</p>
      )}

      <section className="space-y-3">
        {plans.length === 0 ? (
          <p className="card text-xs text-slate-400">No plans yet.</p>
        ) : (
          plans.map((plan) => (
            <div key={plan.id} className="card space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">{plan.title}</p>
                  <p className="text-xs text-slate-400">
                    Budget {formatUsdc(plan.spentUsdc)} / {formatUsdc(plan.budgetUsdc)} · due {plan.deadline}
                  </p>
                </div>
                <StatusBadge status={plan.status} />
              </div>
              <p className="text-xs text-slate-400">{plan.preferences}</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn-primary !py-2 !text-xs" disabled={busy} onClick={() => runSearch(plan)}>
                  Search marketplaces
                </button>
                <button
                  type="button"
                  className="btn-ghost !py-2 !text-xs"
                  onClick={() => updatePlan(plan.id, { status: plan.status === "paused" ? "active" : "paused" })}
                >
                  {plan.status === "paused" ? "Resume" : "Pause plan"}
                </button>
                <button type="button" className="btn-ghost !py-2 !text-xs text-rose-200" onClick={() => removePlan(plan.id)}>
                  Delete
                </button>
              </div>
              {plan.items.map((item) => (
                <div key={item.id} className="rounded-2xl bg-black/25 p-3 space-y-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium">{item.name}</p>
                    <StatusBadge status={item.status} />
                  </div>
                  {item.bestOffer && (
                    <p className="text-xs text-slate-300">
                      Best: {formatUsdc(item.bestOffer.priceUsdc)} · {item.bestOffer.marketplace}
                      {item.bestOffer.mocked ? " (mock)" : " (live source)"}
                    </p>
                  )}
                  {item.agentReason && <p className="text-[11px] text-slate-400">{item.agentReason}</p>}
                  {(item.status === "awaiting_approval" || item.status === "ready") && (
                    <div className="flex gap-2 pt-1">
                      <button
                        type="button"
                        className="btn-primary !py-1.5 !text-xs"
                        disabled={busy || policy.paused || plan.status === "paused"}
                        onClick={() => approveItem(plan, item)}
                      >
                        Approve buy
                      </button>
                      <button
                        type="button"
                        className="btn-ghost !py-1.5 !text-xs"
                        onClick={() =>
                          updatePlan(plan.id, {
                            items: plan.items.map((it) =>
                              it.id === item.id
                                ? { ...it, status: "rejected", agentReason: "Rejected by user." }
                                : it,
                            ),
                          })
                        }
                      >
                        Reject
                      </button>
                    </div>
                  )}
                </div>
              ))}
              {plan.lastTxHash && (
                <a className="text-[11px] text-cyan-300 underline" href={explorerTxUrl(plan.lastTxHash)} target="_blank" rel="noreferrer">
                  Last receipt tx {plan.lastTxHash.slice(0, 12)}…
                </a>
              )}
            </div>
          ))
        )}
      </section>

      <Link href="/agent" className="btn-ghost w-full text-xs">
        Legacy waitlist view →
      </Link>
    </main>
  );
}
