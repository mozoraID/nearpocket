"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { DemoBanner } from "@/components/DemoBanner";
import { StatusBadge } from "@/components/StatusBadge";
import { parseEmvQr } from "@/lib/qris/parser";
import { SAMPLE_QRS, type SampleKey } from "@/lib/qris/samples";
import { formatFiat, formatUsdc, type FxQuote } from "@/lib/fx/quote";
import {
  buildCardSettlement,
  buildQrisSettlement,
  type SettlementReceipt,
} from "@/lib/settlement";
import { useNearlyStore } from "@/lib/store";
import { dryQuoteAnyToUsdc } from "@/lib/near/intents";

function PayInner() {
  const params = useSearchParams();
  const tab = params.get("tab") === "world" ? "world" : "qris";
  const [active, setActive] = useState<"qris" | "world">(tab);
  const [raw, setRaw] = useState(SAMPLE_QRS.indonesia);
  const [quote, setQuote] = useState<FxQuote | null>(null);
  const [receipt, setReceipt] = useState<SettlementReceipt | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cardMerchant, setCardMerchant] = useState("Apple Store Online");
  const [cardAmount, setCardAmount] = useState("49.00");
  const [fromToken, setFromToken] = useState("NEAR");

  useEffect(() => {
    const scanned = sessionStorage.getItem("nearpocket_scanned_qr");
    if (scanned) {
      setRaw(scanned);
      sessionStorage.removeItem("nearpocket_scanned_qr");
      setActive("qris");
    }
  }, []);

  const recordReceipt = useNearlyStore((s) => s.recordReceipt);
  const debitUsdc = useNearlyStore((s) => s.debitUsdc);
  const balanceUsdc = useNearlyStore((s) => s.balanceUsdc);

  const parsed = useMemo(() => {
    try {
      return parseEmvQr(raw);
    } catch {
      return null;
    }
  }, [raw]);

  async function loadQuote() {
    if (!parsed?.transactionAmount && !parsed) return;
    setBusy(true);
    setError(null);
    setReceipt(null);
    try {
      const amount = parseFloat(parsed!.transactionAmount || "0");
      const res = await fetch(
        `/api/fx?currency=${encodeURIComponent(parsed!.rail.currency)}&amount=${amount || 1}`,
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "quote failed");
      setQuote(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "quote failed");
    } finally {
      setBusy(false);
    }
  }

  async function payQris() {
    if (!parsed || !quote) return;
    setBusy(true);
    setError(null);
    try {
      if (quote.totalUsdc > balanceUsdc) throw new Error("Insufficient USDC balance");
      const req = buildQrisSettlement(parsed, quote);
      const res = await fetch("/api/settle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
      });
      const data = (await res.json()) as SettlementReceipt;
      if (!res.ok) throw new Error((data as unknown as { error: string }).error || "settle failed");
      debitUsdc(quote.totalUsdc);
      recordReceipt(data);
      setReceipt(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "pay failed");
    } finally {
      setBusy(false);
    }
  }

  async function payWorld() {
    setBusy(true);
    setError(null);
    setReceipt(null);
    try {
      const amount = parseFloat(cardAmount);
      if (!amount || amount <= 0) throw new Error("Enter a valid USD amount");
      const fxRes = await fetch(`/api/fx?currency=USD&amount=${amount}`);
      const fx = (await fxRes.json()) as FxQuote;
      const intent = await dryQuoteAnyToUsdc(fromToken, String(amount / (fromToken === "NEAR" ? 5.2 : 1)));
      if (fx.totalUsdc > balanceUsdc) throw new Error("Insufficient USDC balance");
      const req = buildCardSettlement({
        merchantName: cardMerchant,
        amountUsd: amount,
        quote: fx,
        destination: `card_link:${cardMerchant.toLowerCase().replace(/\s+/g, "_")}`,
      });
      req.note = `${intent.note} From ${intent.fromToken}.`;
      const res = await fetch("/api/settle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
      });
      const data = (await res.json()) as SettlementReceipt;
      if (!res.ok) throw new Error((data as unknown as { error: string }).error || "settle failed");
      debitUsdc(fx.totalUsdc);
      recordReceipt(data);
      setReceipt(data);
      setQuote(fx);
    } catch (e) {
      setError(e instanceof Error ? e.message : "pay failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold">Pay</h1>
        <p className="text-sm text-slate-400">
          Local QR rails + worldwide card/link via Intents
        </p>
      </header>
      <DemoBanner />

      <div className="flex gap-2 rounded-2xl bg-black/30 p-1">
        {(["qris", "world"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => {
              setActive(t);
              setReceipt(null);
              setQuote(null);
            }}
            className={`flex-1 rounded-xl py-2 text-sm font-semibold ${
              active === t ? "bg-white/10 text-cyan-200" : "text-slate-400"
            }`}
          >
            {t === "qris" ? "QR / QRIS" : "Worldwide"}
          </button>
        ))}
      </div>

      {active === "qris" ? (
        <section className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {(Object.keys(SAMPLE_QRS) as SampleKey[]).map((k) => (
              <button
                key={k}
                type="button"
                className="btn-ghost !px-3 !py-1.5 !text-xs capitalize"
                onClick={() => {
                  setRaw(SAMPLE_QRS[k]);
                  setQuote(null);
                  setReceipt(null);
                }}
              >
                {k}
              </button>
            ))}
          </div>
          <label className="block space-y-1">
            <span className="text-xs text-slate-400">EMVCo QR payload</span>
            <textarea
              className="input min-h-28 font-mono text-[11px]"
              value={raw}
              onChange={(e) => {
                setRaw(e.target.value);
                setQuote(null);
                setReceipt(null);
              }}
            />
          </label>

          {parsed && (
            <div className="card space-y-2 text-sm">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">{parsed.merchantName || "Merchant"}</p>
                  <p className="text-xs text-slate-400">
                    {parsed.merchantCity} · {parsed.rail.name} · {parsed.rail.country}
                  </p>
                </div>
                <StatusBadge status={parsed.crcValid ? "paid" : "failed"} />
              </div>
              <p className="text-xs text-slate-400">
                CRC {parsed.crcValid ? "valid" : "invalid"} · MCC {parsed.merchantCategoryCode} ·
                POI {parsed.pointOfInitiation === "12" ? "dynamic" : "static"}
              </p>
              <p className="text-lg font-bold">
                {parsed.transactionAmount
                  ? formatFiat(
                      parseFloat(parsed.transactionAmount),
                      parsed.rail.currency,
                      parsed.rail.currencySymbol,
                    )
                  : "Open amount"}
              </p>
              <p className="text-[11px] text-slate-500">{parsed.rail.tip}</p>
            </div>
          )}

          <div className="flex gap-2">
            <button type="button" className="btn-ghost flex-1" disabled={busy || !parsed} onClick={loadQuote}>
              Get USDC quote
            </button>
            <button
              type="button"
              className="btn-primary flex-1"
              disabled={busy || !quote}
              onClick={payQris}
            >
              Sign & pay
            </button>
          </div>
        </section>
      ) : (
        <section className="space-y-3">
          <div className="card space-y-3">
            <label className="block space-y-1">
              <span className="text-xs text-slate-400">Merchant / link</span>
              <input className="input" value={cardMerchant} onChange={(e) => setCardMerchant(e.target.value)} />
            </label>
            <label className="block space-y-1">
              <span className="text-xs text-slate-400">Amount (USD)</span>
              <input className="input" value={cardAmount} onChange={(e) => setCardAmount(e.target.value)} />
            </label>
            <label className="block space-y-1">
              <span className="text-xs text-slate-400">Pay from token (Intents dry-run)</span>
              <select className="input" value={fromToken} onChange={(e) => setFromToken(e.target.value)}>
                <option value="NEAR">NEAR</option>
                <option value="USDT">USDT</option>
                <option value="ETH">ETH (via Intents)</option>
              </select>
            </label>
            <p className="text-[11px] text-slate-500">
              Non-QR countries: any token → USDC via NEAR Intents, then virtual card / payment
              link through a card partner (mocked).
            </p>
            <button type="button" className="btn-primary w-full" disabled={busy} onClick={payWorld}>
              Pay worldwide (mock card)
            </button>
          </div>
        </section>
      )}

      {quote && (
        <div className="card space-y-1 text-sm">
          <p className="text-xs uppercase tracking-wide text-slate-400">Quote</p>
          <p>
            Rate 1 USDC = {quote.rate.toLocaleString()} {quote.quote}{" "}
            <span className="text-xs text-slate-500">({quote.source})</span>
          </p>
          <p>You pay {formatUsdc(quote.totalUsdc)} incl. {quote.feeBps / 100}% fee</p>
        </div>
      )}

      {error && (
        <p className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
          {error}
        </p>
      )}

      {receipt && (
        <div className="card space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Receipt</h2>
            <StatusBadge status={receipt.status} />
          </div>
          <p className="text-xs text-slate-400">{receipt.complianceNote}</p>
          <ol className="space-y-2 text-xs">
            {receipt.timeline.map((t, i) => (
              <li key={i} className="rounded-xl bg-black/25 px-3 py-2">
                <StatusBadge status={t.status} />
                <p className="mt-1 text-slate-300">{t.detail}</p>
              </li>
            ))}
          </ol>
          <p className="font-mono text-[10px] text-slate-500">
            partner {receipt.partnerRef} · intent {receipt.intentsQuoteId} · tx {receipt.nearTxHash}
          </p>
        </div>
      )}
    </main>
  );
}

export default function PayPage() {
  return (
    <Suspense fallback={<p className="text-sm text-slate-400">Loading pay…</p>}>
      <PayInner />
    </Suspense>
  );
}
