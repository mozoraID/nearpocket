"use client";

import { AddressRequiredError, defaultAddress } from "@/lib/address";
import { checkSpend, type WaitlistItem } from "@/lib/agent/policy";
import { buildCardSettlement } from "@/lib/settlement";
import type { FxQuote } from "@/lib/fx/quote";
import { useNearPocketStore } from "@/lib/store";
import { shopApproveCalls, shopRejectCalls, shopRequestCalls, submitPolicyCalls } from "@/lib/near/policy-chain";
import { clearPending, finishPending, rememberPending } from "@/lib/near/chain-tx";
import type { ChainResult } from "@/lib/near/gasless";
import { settleAndRecord } from "./pay";
import { decorateShopCheckout } from "./shop-order";

export type AgentChainOutcome =
  | { kind: "chain"; txHash?: string; detailCode?: ChainResult["detailCode"]; detail?: string }
  | { kind: "demo"; gasCovered?: boolean; chainNote?: string; chainDetail?: string };

/** Queue the item and lock escrow when this wallet can spend. */
export async function requestWaitlistOnChain(item: WaitlistItem, title: string): Promise<AgentChainOutcome> {
  const st = useNearPocketStore.getState();
  if (st.demoMode || !st.accountId || st.accountId === "demo.local") {
    st.updateWaitlist(item.id, { status: "awaiting_approval" });
    return { kind: "demo" };
  }
  rememberPending({
    kind: "request",
    title,
    amountUsdc: item.currentPriceUsdc,
    direction: "out",
  });
  try {
    const chain = await submitPolicyCalls(
      shopRequestCalls({
        id: item.id,
        title: item.title,
        category: item.category || "shopping",
        amountUsdc: item.currentPriceUsdc,
        withinBudget: true,
      }),
    );
    if (chain.txHash) {
      finishPending(chain.txHash);
      st.updateWaitlist(item.id, { status: "awaiting_approval", currentPriceUsdc: item.currentPriceUsdc });
    } else {
      clearPending();
    }
    return { kind: "chain", txHash: chain.txHash, detailCode: chain.detailCode, detail: chain.detail };
  } catch (error) {
    clearPending();
    throw error;
  }
}

/** User approves an agent-found item: policy check → settle → mark purchased. */
export async function approveWaitlistItem(item: WaitlistItem, chainTitle?: string): Promise<AgentChainOutcome> {
  const st = useNearPocketStore.getState();
  const price = item.currentPriceUsdc;
  const check = checkSpend(st.policy, price, item.category);
  if (!check.ok) throw new Error(check.reason);
  if (item.maxBudgetUsdc && price > item.maxBudgetUsdc) throw new Error("Price is above your budget.");
  const realWallet = !st.demoMode && Boolean(st.accountId) && st.accountId !== "demo.local";
  if (!realWallet && price > st.balanceUsdc) throw new Error("Not enough USDC. Top up first.");
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
  if (realWallet) {
    rememberPending({
      kind: "approve",
      title: chainTitle || `Approved ${item.title}`,
      amountUsdc: price,
      direction: "out",
    });
    try {
      const chain = await submitPolicyCalls(shopApproveCalls({ id: item.id, amountUsdc: price }));
      if (chain.txHash) {
        finishPending(chain.txHash);
        st.updateWaitlist(item.id, { status: "purchased", agentReason: "Bought after your approval." });
      } else {
        clearPending();
      }
      return { kind: "chain", txHash: chain.txHash, detailCode: chain.detailCode, detail: chain.detail };
    } catch (error) {
      clearPending();
      throw error;
    }
  }
  const chain = await submitPolicyCalls(shopApproveCalls({ id: item.id, amountUsdc: price })).catch(() => null);
  const receipt = await settleAndRecord(checkout, {
    kind: "purchase",
    title: item.title,
    countTowardAgentPolicy: true,
    txHash: chain?.ok ? chain.txHash : undefined,
    gasCovered: chain?.mode === "gasless",
    chainNote:
      chain?.detailCode === "owner-only" ||
      chain?.detailCode === "legacy-contract" ||
      chain?.detailCode === "needs-escrow"
        ? chain.detailCode
        : undefined,
    chainDetail: chain?.detail,
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
  return {
    kind: "demo",
    gasCovered: receipt.gasCovered,
    chainNote: receipt.chainNote,
    chainDetail: receipt.chainDetail,
  };
}

export async function rejectWaitlistItem(item: WaitlistItem, chainTitle?: string): Promise<AgentChainOutcome> {
  const st = useNearPocketStore.getState();
  const realWallet = !st.demoMode && Boolean(st.accountId) && st.accountId !== "demo.local";
  if (realWallet) {
    rememberPending({
      kind: "reject",
      title: chainTitle || `Rejected ${item.title}`,
    });
    try {
      const chain = await submitPolicyCalls(shopRejectCalls({ id: item.id }));
      if (chain.txHash) finishPending(chain.txHash);
      else clearPending();
      st.updateWaitlist(item.id, { status: "rejected", agentReason: "Rejected by you." });
      return { kind: "chain", txHash: chain.txHash, detailCode: chain.detailCode, detail: chain.detail };
    } catch (error) {
      clearPending();
      throw error;
    }
  }
  const chain = await submitPolicyCalls(shopRejectCalls({ id: item.id })).catch(() => null);
  st.updateWaitlist(item.id, { status: "rejected", agentReason: "Rejected by you." });
  st.logActivity({ kind: "agent", title: `You rejected: ${item.title}`, status: "rejected" });
  return { kind: "demo", chainNote: chain?.detailCode === "owner-only" ? "owner-only" : undefined };
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
