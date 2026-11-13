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
  const ok = receipt.status === "paid" || receipt.status === "mocked" || receipt.status === "sandbox" || receipt.status === "sandbox_partner";
  const realTx = Boolean(receipt.nearTxHash && /^[1-9A-HJ-NP-Za-km-z]{32,64}$/.test(receipt.nearTxHash));
  const headline =
    receipt.status === "mocked" || receipt.mocked
      ? t("pay.demoCompleted")
      : receipt.status === "sandbox"
        ? t("pay.sandboxXendit")
        : receipt.status === "sandbox_partner"
          ? t("pay.sandboxPartner")
          : realTx
            ? t("pay.onchain")
            : ok
              ? t("receipt.paidTo")
              : t("pay.failed");
  return (
    <div className="card space-y-4">
      <div className="flex flex-col items-center text-center">
        <span
          className={`flex h-14 w-14 items-center justify-center rounded-full ${ok ? "bg-ink text-cream-100" : "bg-[#f4dcd6] text-[#8a2d1c]"}`}
        >
          <Check className="h-7 w-7" strokeWidth={2.5} />
        </span>
        <p className="mt-3 text-sm text-warm-600">{headline}</p>
        <p className="text-lg font-semibold">{r.merchantName}</p>
        <p className="mt-1 text-3xl font-bold tracking-tight">
          {formatFiat(r.localAmount, r.localCurrency, r.rail.currencySymbol)}
        </p>
        <p className="text-sm text-warm-600">{formatUsdc(r.quote.totalUsdc)}</p>
        <div className="mt-2">
          <StatusBadge status={receipt.status} />
        </div>
        {receipt.gasCovered && (
          <p className="mt-2 text-xs text-warm-600">{t("receipt.gasCovered")}</p>
        )}
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
        {realTx && receipt.nearTxHash && (
          <Row
            k={t("pay.onchain")}
            v={
              <a className="underline" href={explorerTxUrl(receipt.nearTxHash)} target="_blank" rel="noreferrer">
                {receipt.nearTxHash.slice(0, 10)}…
              </a>
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
      {receipt.chainNote === "owner-only" && (
        <p className="text-xs leading-relaxed text-warm-600">{t("shop.ownerOnlyChain")}</p>
      )}
      {receipt.chainNote === "legacy-contract" && (
        <p className="text-xs leading-relaxed text-warm-600">{t("shop.chainLegacy")}</p>
      )}
      {receipt.chainNote === "needs-escrow" && (
        <p className="text-xs leading-relaxed text-warm-600">
          {t("shop.needsEscrow", { amount: receipt.chainDetail || "0.00" })}
        </p>
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
