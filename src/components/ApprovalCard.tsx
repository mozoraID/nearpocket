"use client";

import { Bot } from "lucide-react";
import { SpendDecision } from "./SpendDecision";
import { formatRequestExpiry } from "@/lib/near/approval-state";
import type { ChainSpendRequest } from "@/lib/near/chain-types";
import type { WaitlistItem } from "@/lib/agent/policy";
import { useT } from "@/lib/i18n";

/** One on-chain awaiting_approval request. Approve and reject sign a single action each. */
export function ApprovalCard({
  request,
  item,
  busy,
  variant = "ink",
  shipLine,
  onApprove,
  onReject,
}: {
  request: ChainSpendRequest;
  item: WaitlistItem;
  busy: boolean;
  variant?: "ink" | "cream";
  shipLine?: string;
  onApprove: () => Promise<void>;
  onReject: () => Promise<void>;
}) {
  const t = useT();
  const dark = variant === "cream";
  const merchant = item.marketplace || item.merchant;
  const expiry = formatRequestExpiry(request.expiresAtNs);
  return (
    <div className={dark ? "rounded-3xl bg-ink p-4 text-cream-100" : "card !p-4 ring-2 ring-ink"}>
      <div className={`flex items-center gap-2 text-xs ${dark ? "text-cream-400" : "text-warm-600"}`}>
        {dark ? <Bot className="h-4 w-4" /> : null}
        <span className={dark ? "" : "font-semibold text-ink"}>{t("home.agentNeedsOk")}</span>
      </div>
      <p className="mt-1 font-semibold">{item.title}</p>
      <p className={`text-sm ${dark ? "text-cream-400" : "text-warm-600"}`}>
        {t("escrow.locked")} {request.amountUsdc.toFixed(2)} USDC · {merchant}
      </p>
      {request.settlementAccount ? (
        <p className={`mt-1 text-xs ${dark ? "text-cream-300" : "text-warm-600"}`}>
          {t("shop.paysTo", { amount: request.amountUsdc.toFixed(2), account: request.settlementAccount })}
        </p>
      ) : null}
      {expiry ? (
        <p className={`mt-1 text-xs ${dark ? "text-cream-300" : "text-warm-600"}`}>
          {t("shop.expiresAt", { when: expiry })}
        </p>
      ) : null}
      <p className={`mt-1 text-xs ${dark ? "text-cream-300" : "text-warm-600"}`}>
        {shipLine ? t("shop.shipTo", { address: shipLine }) : t("shop.addressAtCheckout")}
      </p>
      <SpendDecision item={item} busy={busy} variant={variant} onApprove={onApprove} onReject={onReject} />
    </div>
  );
}
