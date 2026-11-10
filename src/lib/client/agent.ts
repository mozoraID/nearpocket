"use client";

import { AddressRequiredError, defaultAddress } from "@/lib/address";
import { checkSpend, type WaitlistItem } from "@/lib/agent/policy";
import { buildCardSettlement } from "@/lib/settlement";
import type { FxQuote } from "@/lib/fx/quote";
import { useNearPocketStore } from "@/lib/store";
import { shopApproveCalls, submitPolicyCalls } from "@/lib/near/policy-chain";
import { settleAndRecord } from "./pay";
import { decorateShopCheckout } from "./shop-order";

/** User approves an agent-found item: policy check → settle → mark purchased. */
export async function approveWaitlistItem(item: WaitlistItem) {
  const st = useNearPocketStore.getState();
  const price = item.currentPriceUsdc;
  const check = checkSpend(st.policy, price, item.category);
  if (!check.ok) throw new Error(check.reason);
  if (item.maxBudgetUsdc && price > item.maxBudgetUsdc) throw new Error("Price is above your budget.");
  if (price > st.balanceUsdc) throw new Error("Not enough USDC. Top up first.");
  const address = defaultAddress(st.addresses);
  if (!address) throw new AddressRequiredError();
  const fx = (await (await fetch(`/api/fx?currency=USD&amount=${price}`)).json()) as FxQuote;
  const req = buildCardSettlement({
    merchantName: item.merchant,
    amountUsd: price,
    quote: fx,
    destination: item.url || `agent_waitlist:${item.id}`,
  });
  req.note = `Agent purchase after user approval. Policy: daily ${st.policy.dailyLimitUsdc}, per-item ${st.policy.perItemMaxUsdc} USDC.`;
  const checkout = await decorateShopCheckout(req, address);
  const chain = await submitPolicyCalls(shopApproveCalls({ id: item.id, amountUsdc: price })).catch(() => null);
  const receipt = await settleAndRecord(checkout, {
    kind: "purchase",
    title: item.title,
    countTowardAgentPolicy: true,
    txHash: chain?.txHash,
    gasCovered: chain?.mode === "gasless",
    chainNote: chain?.detailCode === "owner-only" ? "owner-only" : undefined,
  });
  st.updateWaitlist(item.id, {
    status: receipt.status === "failed" ? "awaiting_approval" : "purchased",
    agentReason:
      receipt.status === "failed" ? "Partner failed. Try again." : "Bought after your approval.",
  });
  st.logActivity({
    kind: "agent",
    title: `You approved: ${item.title}`,
    detail: `${price.toFixed(2)} USDC · ${item.marketplace || item.merchant}`,
    status: "approved",
  });
  return receipt;
}

export function rejectWaitlistItem(item: WaitlistItem) {
  const st = useNearPocketStore.getState();
  st.updateWaitlist(item.id, { status: "rejected", agentReason: "Rejected by you." });
  st.logActivity({ kind: "agent", title: `You rejected: ${item.title}`, status: "rejected" });
}

/** Ask the agent to re-check the price (demo price tick from /api/agent). */
export async function recheckWaitlistItem(item: WaitlistItem) {
  const st = useNearPocketStore.getState();
  const res = await fetch("/api/agent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "tick", item }),
  });
  const next = (await res.json()) as WaitlistItem;
  // Budget is the hard ceiling; target = budget for agent items
  st.updateWaitlist(item.id, {
    currentPriceUsdc: next.currentPriceUsdc,
    status: next.status,
    agentReason: next.agentReason,
  });
  if (next.status === "awaiting_approval") {
    st.logActivity({
      kind: "agent",
      title: `Agent found a deal: ${item.title}`,
      detail: `${next.currentPriceUsdc.toFixed(2)} USDC, within your budget`,
      status: "awaiting_approval",
    });
  }
}
