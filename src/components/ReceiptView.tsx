"use client";

import { Check, ExternalLink } from "lucide-react";
import type { SettlementReceipt } from "@/lib/settlement/types";
import { formatFiat, formatUsdc } from "@/lib/fx/quote";
import { NEAR_CONFIG, explorerAccountUrl, explorerTxUrl } from "@/lib/near/config";
import { StatusBadge } from "./StatusBadge";
import { useT } from "@/lib/i18n";

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 text-sm">
      <span className="text-warm-600">{k}</span>
      <span className="min-w-0 break-all text-right font-medium">{v}</span>
    </div>
  );
}

export function ReceiptView({ receipt }: { receipt: SettlementReceipt }) {
  const t = useT();
  const r = receipt.request;
  const ok = receipt.status === "paid" || receipt.status === "mocked";
  const realTx = receipt.nearTxHash && !receipt.nearTxHash.startsWith("demo.");
  return (
    <div className="card space-y-4">
      <div className="flex flex-col items-center text-center">
        <span
          className={`flex h-14 w-14 items-center justify-center rounded-full ${ok ? "bg-ink text-cream-100" : "bg-[#f4dcd6] text-[#8a2d1c]"}`}
        >
          <Check className="h-7 w-7" strokeWidth={2.5} />
        </span>
        <p className="mt-3 text-sm text-warm-600">{ok ? t("receipt.paidTo") : t("pay.failed")}</p>
        <p className="text-lg font-semibold">{r.merchantName}</p>
        <p className="mt-1 text-3xl font-bold tracking-tight">
          {formatFiat(r.localAmount, r.localCurrency, r.rail.currencySymbol)}
        </p>
        <p className="text-sm text-warm-600">{formatUsdc(r.quote.totalUsdc)}</p>
        <div className="mt-2">
          <StatusBadge status={receipt.status} />
        </div>
      </div>
      <div className="divide-y divide-cream-300 border-t border-cream-300">
        <Row k={t("receipt.rail")} v={`${r.rail.name} · ${r.rail.country}`} />
        <Row k={t("receipt.rate")} v={t("receipt.rateValue", { rate: r.quote.rate.toLocaleString(), currency: r.quote.quote })} />
        <Row k={t("receipt.fee")} v={formatUsdc(r.quote.feeUsdc)} />
        <Row
          k={t("receipt.partner")}
          v={receipt.mocked ? t("receipt.mockPartner") : t("receipt.xendit")}
        />
        {receipt.partnerRef && <Row k={t("receipt.partnerRef")} v={<span className="font-mono text-xs">{receipt.partnerRef}</span>} />}
        {r.shopOrder?.orderId && (
          <Row k={t("receipt.orderId")} v={<span className="font-mono text-xs">{r.shopOrder.orderId}</span>} />
        )}
        {r.shopOrder?.shipTo && <Row k={t("receipt.shipTo")} v={r.shopOrder.shipTo} />}
        {receipt.intentsQuoteId && (
          <Row k={t("receipt.quoteId")} v={<span className="font-mono text-xs">{receipt.intentsQuoteId}</span>} />
        )}
        {receipt.nearTxHash && (
          <Row
            k={t("receipt.nearTx")}
            v={
              realTx ? (
                <a className="underline" href={explorerTxUrl(receipt.nearTxHash)} target="_blank" rel="noreferrer">
                  {receipt.nearTxHash.slice(0, 10)}…
                </a>
              ) : (
                <span className="font-mono text-xs">{receipt.nearTxHash} {t("receipt.demoTag")}</span>
              )
            }
          />
        )}
        <Row
          k={t("receipt.policy")}
          v={
            <a
              className="inline-flex items-center gap-1 underline"
              href={explorerAccountUrl(NEAR_CONFIG.agentPolicyContract)}
              target="_blank"
              rel="noreferrer"
            >
              {NEAR_CONFIG.agentPolicyContract} <ExternalLink className="h-3 w-3" />
            </a>
          }
        />
      </div>
      {r.mode === "merchant_checkout" && receipt.timeline.length > 0 && (
        <ol className="space-y-3 border-t border-cream-300 pt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-warm-500">
            {t("receipt.orderFlow")} · {t("common.demo")}
          </p>
          {receipt.timeline.map((ev, i) => (
            <li key={`${ev.at}-${i}`} className="flex gap-3 text-sm">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink text-[11px] font-semibold text-cream-100">
                {i + 1}
              </span>
              <span className="min-w-0">
                <time className="block text-[11px] text-warm-500" dateTime={ev.at}>
                  {formatStepTime(ev.at)}
                </time>
                <span className="block leading-snug">
                  {ev.stepKey ? t(ev.stepKey, ev.stepVars) : ev.detail}
                </span>
              </span>
            </li>
          ))}
        </ol>
      )}
      <p className="text-xs leading-relaxed text-warm-500">
        {r.mode === "merchant_checkout" ? t("receipt.intentsNote") : receipt.complianceNote}
      </p>
    </div>
  );
}

function formatStepTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
