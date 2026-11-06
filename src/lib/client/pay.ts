"use client";

import type { SettlementReceipt, SettlementRequest } from "@/lib/settlement/types";
import { useNearPocketStore } from "@/lib/store";

/** POST /api/settle, then debit the demo balance, store the receipt and log activity. */
export async function settleAndRecord(
  req: SettlementRequest,
  opts: { kind?: "payment" | "purchase"; title?: string } = {},
): Promise<SettlementReceipt> {
  const res = await fetch("/api/settle", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  const data = (await res.json()) as SettlementReceipt & { error?: string };
  if (!res.ok) throw new Error(data.error || "Payment failed");
  const st = useNearPocketStore.getState();
  if (data.status !== "failed") st.debitUsdc(req.quote.totalUsdc);
  st.recordReceipt(data);
  st.logActivity({
    kind: opts.kind || "payment",
    title: opts.title || req.merchantName,
    detail: `${req.localAmount.toLocaleString("en-US")} ${req.localCurrency} · ${req.rail.name}`,
    status: data.status,
    amountUsdc: req.quote.totalUsdc,
    direction: "out",
    receiptId: data.merchantReceiptId || data.request.id,
  });
  return data;
}

export const COUNTRY_FLAG: Record<string, string> = {
  ID: "🇮🇩",
  TH: "🇹🇭",
  MY: "🇲🇾",
  SG: "🇸🇬",
  JP: "🇯🇵",
  KR: "🇰🇷",
  US: "🌍",
};
