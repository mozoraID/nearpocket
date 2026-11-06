"use client";

import { formatUsdc } from "@/lib/fx/quote";

import { useState, type ReactNode } from "react";
import { ArrowLeft, CreditCard, Snowflake, WalletCards } from "lucide-react";
import { Sheet } from "./Sheet";
import { useNearPocketStore } from "@/lib/store";
import { useT } from "@/lib/i18n";

export function WorldCardView({
  reset,
  wMerchant,
  setWMerchant,
  wAmount,
  setWAmount,
  PayWithToggle,
  payWith,
  nearPerUsdc,
  error,
  payWorld,
  setError,
}: {
  reset: () => void;
  wMerchant: string;
  setWMerchant: (v: string) => void;
  wAmount: string;
  setWAmount: (v: string) => void;
  PayWithToggle: ReactNode;
  payWith: "USDC" | "NEAR";
  nearPerUsdc: { usdcPerNear: number; real: boolean } | null;
  error: string | null;
  payWorld: () => void;
  setError: (e: string | null) => void;
}) {
  const t = useT();
  const card = useNearPocketStore((s) => s.card);
  const setCard = useNearPocketStore((s) => s.setCard);
  const topUpCard = useNearPocketStore((s) => s.topUpCard);
  const balanceUsdc = useNearPocketStore((s) => s.balanceUsdc);
  const logActivity = useNearPocketStore((s) => s.logActivity);
  const [howto, setHowto] = useState(false);
  const [topUpAmt, setTopUpAmt] = useState("10");
  const [limitEdit, setLimitEdit] = useState(String(card.limitUsdc));

  function doTopUp() {
    const n = parseFloat(topUpAmt);
    if (!n || n <= 0) return;
    if (n > balanceUsdc) {
      setError("Not enough USDC in wallet.");
      return;
    }
    topUpCard(n);
    logActivity({
      kind: "card",
      title: "Card top-up",
      detail: `${n.toFixed(2)} USDC via NEAR Intents (demo)`,
      amountUsdc: n,
      direction: "out",
      status: "ok",
    });
  }

  return (
    <main className="space-y-5">
      <button type="button" onClick={reset} className="flex h-10 items-center gap-1 text-sm font-medium">
        <ArrowLeft className="h-4 w-4" /> {t("pay.backToScan")}
      </button>

      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("card.title")}</h1>
        <p className="mt-1 text-sm text-warm-600">{t("card.subtitle")}</p>
      </div>

      {/* Virtual card visual */}
      <div className="relative overflow-hidden rounded-[28px] bg-ink p-6 text-cream-100 shadow-lg">
        <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-cream-100/10" />
        <div className="absolute -bottom-10 -left-6 h-28 w-28 rounded-full bg-cream-100/5" />
        <div className="relative">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-sm font-medium text-cream-400">
              <CreditCard className="h-4 w-4" /> NearPocket
            </span>
            <span className="rounded-full bg-cream-100/15 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide">
              {t("card.partner")}
            </span>
          </div>
          <p className="mt-8 font-mono text-xl tracking-[0.2em]">
            •••• •••• •••• {card.last4}
          </p>
          <div className="mt-6 flex items-end justify-between">
            <div>
              <p className="text-[10px] uppercase text-cream-400">Cardholder</p>
              <p className="text-sm font-semibold">{card.holder}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] uppercase text-cream-400">Exp</p>
              <p className="text-sm font-semibold">
                {String(card.expMonth).padStart(2, "0")}/{card.expYear}
              </p>
            </div>
          </div>
          {card.frozen && (
            <p className="mt-4 flex items-center gap-1 text-sm text-[#f4dcd6]">
              <Snowflake className="h-4 w-4" /> Frozen
            </p>
          )}
        </div>
      </div>

      <p className="text-xs text-warm-600">{t("card.partnerNote")}</p>

      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          className="btn-secondary"
          onClick={() => setCard({ frozen: !card.frozen })}
        >
          <Snowflake className="h-4 w-4" />
          {card.frozen ? t("card.unfreeze") : t("card.freeze")}
        </button>
        <button type="button" className="btn-secondary" onClick={() => setHowto(true)}>
          <WalletCards className="h-4 w-4" />
          {t("card.howTo")}
        </button>
      </div>

      <div className="card space-y-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-warm-600">{t("card.limit")}</span>
          <span className="font-semibold">{formatUsdc(card.limitUsdc)}</span>
        </div>
        <div className="flex gap-2">
          <input
            className="input !min-h-11"
            inputMode="decimal"
            value={limitEdit}
            onChange={(e) => setLimitEdit(e.target.value)}
          />
          <button
            type="button"
            className="btn-outline !min-h-11 shrink-0 px-4"
            onClick={() => {
              const n = parseFloat(limitEdit);
              if (n > 0) setCard({ limitUsdc: n });
            }}
          >
            Set
          </button>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-warm-600">Card balance</span>
          <span className="font-semibold">{formatUsdc(card.balanceUsdc)}</span>
        </div>
        <div className="flex gap-2">
          <input
            className="input !min-h-11"
            inputMode="decimal"
            value={topUpAmt}
            onChange={(e) => setTopUpAmt(e.target.value)}
            placeholder={t("card.topUp")}
          />
          <button type="button" className="btn-secondary !min-h-11 shrink-0" onClick={doTopUp}>
            {t("card.topUp")}
          </button>
        </div>
      </div>

      <div className="card space-y-4">
        <p className="font-semibold">{t("card.payWithCard")}</p>
        <label className="block space-y-1.5">
          <span className="text-sm text-warm-600">{t("card.store")}</span>
          <input className="input" value={wMerchant} onChange={(e) => setWMerchant(e.target.value)} />
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm text-warm-600">{t("card.amountUsd")}</span>
          <input
            className="input text-2xl font-semibold"
            inputMode="decimal"
            value={wAmount}
            onChange={(e) => setWAmount(e.target.value)}
          />
        </label>
        {PayWithToggle}
        {payWith === "NEAR" && nearPerUsdc && parseFloat(wAmount) > 0 && (
          <p className="text-sm text-warm-600">
            ≈ {(parseFloat(wAmount) / nearPerUsdc.usdcPerNear).toFixed(3)} NEAR via NEAR Intents
            {nearPerUsdc.real ? " · live 1Click quote" : " · estimate"}
          </p>
        )}
      </div>

      {error && <p className="rounded-2xl bg-[#f4dcd6] px-4 py-3 text-sm text-[#8a2d1c]">{error}</p>}
      {card.frozen && (
        <p className="rounded-2xl bg-[#f4dcd6] px-4 py-3 text-sm text-[#8a2d1c]">{t("card.frozen")}</p>
      )}

      <button
        type="button"
        className="btn-primary w-full"
        disabled={card.frozen}
        onClick={() => {
          const amt = parseFloat(wAmount);
          if (amt > card.limitUsdc) {
            setError(`Amount exceeds card limit (${formatUsdc(card.limitUsdc)}).`);
            return;
          }
          payWorld();
        }}
      >
        Pay ${parseFloat(wAmount) > 0 ? parseFloat(wAmount).toFixed(2) : "0.00"}
      </button>
      <p className="text-center text-xs text-warm-500">{t("card.demoNote")}</p>

      <Sheet open={howto} onClose={() => setHowto(false)} title={t("card.howTo")}>
        <ol className="space-y-4">
          {[
            { title: t("card.step1Title"), body: t("card.step1Body") },
            { title: t("card.step2Title"), body: t("card.step2Body") },
            { title: t("card.step3Title"), body: t("card.step3Body") },
          ].map((s, i) => (
            <li key={i} className="flex gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink text-sm font-bold text-cream-100">
                {i + 1}
              </span>
              <div>
                <p className="font-semibold">{s.title}</p>
                <p className="mt-1 text-sm text-warm-600">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
        <p className="mt-4 rounded-2xl bg-cream-200 p-3 text-xs text-warm-600">{t("card.partnerNote")}</p>
        <button type="button" className="btn-primary mt-4 w-full" onClick={() => setHowto(false)}>
          {t("common.done")}
        </button>
      </Sheet>
    </main>
  );
}
