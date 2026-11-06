"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import clsx from "clsx";
import { Sheet } from "./Sheet";
import { useNearPocketStore } from "@/lib/store";
import { formatUsdc } from "@/lib/fx/quote";

const PRESETS = [10, 25, 50, 100];
const METHODS = [
  { id: "qris", label: "QRIS (IDR)", note: "Pay rupiah, get USDC" },
  { id: "near", label: "From NEAR", note: "Swap via NEAR Intents" },
  { id: "card", label: "Card", note: "Debit / credit" },
] as const;

export function TopUpSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const creditUsdc = useNearPocketStore((s) => s.creditUsdc);
  const logActivity = useNearPocketStore((s) => s.logActivity);
  const [amount, setAmount] = useState(25);
  const [method, setMethod] = useState<(typeof METHODS)[number]["id"]>("qris");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<number | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function topUp() {
    setBusy(true);
    try {
      let n = "Demo top-up. No real money moved.";
      if (method === "near") {
        const q = await (await fetch(`/api/quote?from=NEAR&amount=1`)).json();
        if (q?.toAmount) {
          const per = parseFloat(q.toAmount);
          n = `${(amount / per).toFixed(3)} NEAR ≈ ${amount} USDC (${q.real ? "live 1Click quote" : "estimate"}). Swap not executed on testnet.`;
        }
      }
      await new Promise((r) => setTimeout(r, 600));
      creditUsdc(amount);
      logActivity({
        kind: "topup",
        title: "Top up",
        detail: `${METHODS.find((m) => m.id === method)?.label} · demo`,
        status: "mocked",
        amountUsdc: amount,
        direction: "in",
      });
      setNote(n);
      setDone(amount);
    } finally {
      setBusy(false);
    }
  }

  function close() {
    setDone(null);
    setNote(null);
    onClose();
  }

  return (
    <Sheet open={open} onClose={close} title="Top up (beta)">
      {done ? (
        <div className="space-y-4 text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-ink text-cream-100">
            <Check className="h-7 w-7" />
          </span>
          <p className="text-2xl font-bold">+{formatUsdc(done)}</p>
          <p className="text-sm text-warm-600">{note}</p>
          <button type="button" className="btn-primary w-full" onClick={close}>
            Done
          </button>
        </div>
      ) : (
        <div className="space-y-5">
          <div>
            <p className="mb-2 text-sm text-warm-600">Amount (USDC)</p>
            <div className="grid grid-cols-4 gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setAmount(p)}
                  className={clsx(
                    "h-12 rounded-2xl text-base font-semibold",
                    amount === p ? "bg-ink text-cream-100" : "bg-cream-300",
                  )}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-sm text-warm-600">Method</p>
            {METHODS.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setMethod(m.id)}
                className={clsx(
                  "flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left ring-1.5",
                  method === m.id ? "bg-cream-200 ring-2 ring-ink" : "bg-cream-200 ring-1 ring-cream-300",
                )}
              >
                <span>
                  <span className="block font-semibold">{m.label}</span>
                  <span className="text-xs text-warm-600">{m.note}</span>
                </span>
                {method === m.id && <Check className="h-5 w-5" />}
              </button>
            ))}
          </div>
          <button type="button" className="btn-primary w-full" disabled={busy} onClick={topUp}>
            {busy ? "Adding…" : `Add ${amount} USDC`}
          </button>
          <p className="text-center text-xs text-warm-500">Beta: demo balance only, nothing is charged.</p>
        </div>
      )}
    </Sheet>
  );
}
