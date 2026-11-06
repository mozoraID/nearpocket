"use client";

import { useState } from "react";
import { DemoBanner } from "@/components/DemoBanner";
import { StatusBadge } from "@/components/StatusBadge";
import { useNearlyStore } from "@/lib/store";
import { checkSpend, type WaitlistItem } from "@/lib/agent/policy";
import { formatUsdc, type FxQuote } from "@/lib/fx/quote";
import { buildCardSettlement, type SettlementReceipt } from "@/lib/settlement";

export default function AgentPage() {
  const [prompt, setPrompt] = useState(
    "Buy Sony WH-1000XM5 when under 280 USDC at official store",
  );
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const policy = useNearlyStore((s) => s.policy);
  const setPolicy = useNearlyStore((s) => s.setPolicy);
  const waitlist = useNearlyStore((s) => s.waitlist);
  const addWaitlist = useNearlyStore((s) => s.addWaitlist);
  const updateWaitlist = useNearlyStore((s) => s.updateWaitlist);
  const removeWaitlist = useNearlyStore((s) => s.removeWaitlist);
  const debitUsdc = useNearlyStore((s) => s.debitUsdc);
  const recordReceipt = useNearlyStore((s) => s.recordReceipt);
  const balanceUsdc = useNearlyStore((s) => s.balanceUsdc);

  async function queue() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "parse", text: prompt }),
      });
      const item = (await res.json()) as WaitlistItem;
      if (!res.ok) throw new Error((item as unknown as { error: string }).error);
      addWaitlist(item);
      setMsg("Queued. Agent is watching — it cannot spend until you approve.");
      setPrompt("");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "failed");
    } finally {
      setBusy(false);
    }
  }

  async function tick(item: WaitlistItem) {
    setBusy(true);
    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "tick", item }),
      });
      const next = (await res.json()) as WaitlistItem;
      updateWaitlist(item.id, next);
    } finally {
      setBusy(false);
    }
  }

  async function approve(item: WaitlistItem) {
    setBusy(true);
    setMsg(null);
    try {
      const check = checkSpend(policy, item.currentPriceUsdc, item.category);
      if (!check.ok) throw new Error(check.reason);
      if (item.currentPriceUsdc > balanceUsdc) throw new Error("Insufficient USDC");

      const fxRes = await fetch(`/api/fx?currency=USD&amount=${item.currentPriceUsdc}`);
      const quote = (await fxRes.json()) as FxQuote;
      const req = buildCardSettlement({
        merchantName: item.merchant,
        amountUsd: item.currentPriceUsdc,
        quote,
        destination: `agent_waitlist:${item.id}`,
      });
      req.note = `Agent purchase after user approval. Policy: daily ${policy.dailyLimitUsdc}, per-item ${policy.perItemMaxUsdc}.`;
      const res = await fetch("/api/settle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
      });
      const receipt = (await res.json()) as SettlementReceipt;
      debitUsdc(item.currentPriceUsdc);
      recordReceipt(receipt);
      updateWaitlist(item.id, {
        status: "purchased",
        agentReason: "Purchased after your explicit approval. Receipt saved.",
      });
      setMsg(`Purchased ${item.title} for ${formatUsdc(item.currentPriceUsdc)}.`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "approve failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold">Agent</h1>
        <p className="text-sm text-slate-400">
          Autonomous shopping with waitlist — you keep the keys
        </p>
      </header>
      <DemoBanner />

      <section className="card space-y-3">
        <h2 className="text-sm font-semibold">Spend policy</h2>
        <p className="text-[11px] text-slate-400">
          Mirrors the on-chain agent-policy contract (see <code>contracts/agent-policy</code>).
          Function-call style limits: daily cap, per-item max, approval required.
        </p>
        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-1 text-xs">
            <span className="text-slate-400">Daily limit (USDC)</span>
            <input
              className="input"
              type="number"
              value={policy.dailyLimitUsdc}
              onChange={(e) => setPolicy({ dailyLimitUsdc: Number(e.target.value) })}
            />
          </label>
          <label className="space-y-1 text-xs">
            <span className="text-slate-400">Per-item max</span>
            <input
              className="input"
              type="number"
              value={policy.perItemMaxUsdc}
              onChange={(e) => setPolicy({ perItemMaxUsdc: Number(e.target.value) })}
            />
          </label>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={policy.requireApproval}
            onChange={(e) => setPolicy({ requireApproval: e.target.checked })}
          />
          Require my approval before every purchase
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={policy.paused}
            onChange={(e) => setPolicy({ paused: e.target.checked })}
          />
          Pause agent
        </label>
        <p className="text-xs text-slate-400">
          Spent today: {policy.spentTodayUsdc.toFixed(2)} / {policy.dailyLimitUsdc} USDC
        </p>
      </section>

      <section className="card space-y-3">
        <h2 className="text-sm font-semibold">Tell the agent what to buy</h2>
        <textarea
          className="input min-h-24"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Wait for MacBook Air M3 under 900 USDC…"
        />
        <button type="button" className="btn-primary w-full" disabled={busy || !prompt.trim()} onClick={queue}>
          Add to waitlist
        </button>
      </section>

      {msg && (
        <p className="rounded-2xl border border-cyan-500/20 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-100">
          {msg}
        </p>
      )}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Waitlist</h2>
        {waitlist.length === 0 ? (
          <p className="card text-xs text-slate-400">Empty — queue a wish above.</p>
        ) : (
          waitlist.map((item) => (
            <div key={item.id} className="card space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">{item.title}</p>
                  <p className="text-xs text-slate-400">
                    {item.merchant} · {item.category}
                  </p>
                </div>
                <StatusBadge status={item.status} />
              </div>
              <p className="text-sm">
                Now {formatUsdc(item.currentPriceUsdc)} · target{" "}
                {formatUsdc(item.targetPriceUsdc)}
              </p>
              {item.agentReason && (
                <p className="text-xs text-slate-400">{item.agentReason}</p>
              )}
              <div className="flex flex-wrap gap-2">
                {item.status !== "purchased" && item.status !== "rejected" && (
                  <button type="button" className="btn-ghost !py-2 !text-xs" disabled={busy} onClick={() => tick(item)}>
                    Price tick
                  </button>
                )}
                {(item.status === "awaiting_approval" || item.status === "ready") && (
                  <>
                    <button
                      type="button"
                      className="btn-primary !py-2 !text-xs"
                      disabled={busy || policy.paused}
                      onClick={() => approve(item)}
                    >
                      Approve buy
                    </button>
                    <button
                      type="button"
                      className="btn-ghost !py-2 !text-xs"
                      onClick={() =>
                        updateWaitlist(item.id, {
                          status: "rejected",
                          agentReason: "Rejected by user.",
                        })
                      }
                    >
                      Reject
                    </button>
                  </>
                )}
                <button
                  type="button"
                  className="btn-ghost !py-2 !text-xs text-rose-200"
                  onClick={() => removeWaitlist(item.id)}
                >
                  Remove
                </button>
              </div>
            </div>
          ))
        )}
      </section>
    </main>
  );
}
