"use client";

import { useState } from "react";
import { DemoBanner } from "@/components/DemoBanner";
import { useNearlyStore } from "@/lib/store";
import { formatUsdc } from "@/lib/fx/quote";
import { dryQuoteAnyToUsdc } from "@/lib/near/intents";
import { BRAND } from "@/config/brand";
import { StatusBadge } from "@/components/StatusBadge";

const PRESETS = [10, 25, 50, 100];

export default function TopUpPage() {
  const balanceUsdc = useNearlyStore((s) => s.balanceUsdc);
  const creditUsdc = useNearlyStore((s) => s.creditUsdc);
  const [amount, setAmount] = useState("25");
  const [method, setMethod] = useState<"qris" | "card" | "near">("qris");
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<{
    amount: number;
    method: string;
    ref: string;
    note: string;
  } | null>(null);

  async function topUp() {
    setBusy(true);
    setReceipt(null);
    try {
      const amt = parseFloat(amount);
      if (!amt || amt <= 0) throw new Error("Enter a valid amount");
      let note = "";
      if (method === "near") {
        const q = await dryQuoteAnyToUsdc("NEAR", String(amt / 5.2));
        note = q.note;
      } else if (method === "qris") {
        note =
          "Beta/demo top-up via QRIS on-ramp (mocked). Production: licensed PJP credits USDC after IDR payment.";
      } else {
        note = "Beta/demo card top-up (mocked). No real card charged.";
      }
      // Simulate delay
      await new Promise((r) => setTimeout(r, 600));
      creditUsdc(amt);
      setReceipt({
        amount: amt,
        method,
        ref: `topup_${Date.now().toString(36)}`,
        note,
      });
    } catch (e) {
      alert(e instanceof Error ? e.message : "top-up failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold">Top up (beta)</h1>
        <p className="text-sm text-slate-400">
          Add demo USDC to {BRAND.displayName} — sandbox only
        </p>
      </header>
      <DemoBanner />

      <section className="card space-y-1">
        <p className="text-xs text-slate-400">Current balance</p>
        <p className="text-2xl font-bold">{formatUsdc(balanceUsdc)}</p>
      </section>

      <section className="card space-y-3">
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p}
              type="button"
              className="btn-ghost !px-3 !py-2 !text-xs"
              onClick={() => setAmount(String(p))}
            >
              {p} USDC
            </button>
          ))}
        </div>
        <input className="input" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <div className="flex gap-2">
          {(["qris", "card", "near"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMethod(m)}
              className={`flex-1 rounded-xl py-2 text-xs font-semibold uppercase ${
                method === m ? "bg-white/10 text-cyan-200" : "text-slate-400"
              }`}
            >
              {m}
            </button>
          ))}
        </div>
        <button type="button" className="btn-primary w-full" disabled={busy} onClick={topUp}>
          Top up (demo)
        </button>
      </section>

      {receipt && (
        <div className="card space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Top-up receipt</h2>
            <StatusBadge status="mocked" />
          </div>
          <p className="text-sm">+{formatUsdc(receipt.amount)} via {receipt.method}</p>
          <p className="text-xs text-slate-400">{receipt.note}</p>
          <p className="font-mono text-[10px] text-slate-500">{receipt.ref}</p>
        </div>
      )}
    </main>
  );
}
