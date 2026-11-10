"use client";

/**
 * Shop and policy calls that should be gasless on testnet.
 *
 * NEP-366 sets predecessor to the account that signed the delegate, not the
 * relayer. approve_spend, queue_item, set_item_status, set_policy, and
 * upsert_plan still require that account to be the contract owner. A
 * different testnet account is not asked to sign those methods. request_spend
 * is open to any account, but it panics unless the owner has already queued
 * the item, so this client only sends it together with queue_item from the
 * owner. No contract change is required for that.
 *
 * Buy now sends queue_item and approve_spend, not request_spend. With
 * require_approval off, request_spend would already count the spend and
 * approve_spend would count it again.
 */
import { useNearPocketStore } from "@/lib/store";
import { numberToUsdc6 } from "./contract";
import { NEAR_CONFIG } from "./config";
import { submitContractCalls, type ChainResult, type ContractCall } from "./gasless";
import { DEFAULT_FUNCTION_GAS, isOwnerOnlyMethod } from "./relay-allowlist";
import type { SpendPolicy } from "@/lib/agent/policy";

export type { ChainResult };

async function fetchContractOwner(): Promise<string | null> {
  try {
    const res = await fetch("/api/contract");
    if (!res.ok) return null;
    const data = (await res.json()) as { policy?: { owner?: unknown } };
    return typeof data.policy?.owner === "string" ? data.policy.owner : null;
  } catch {
    return null;
  }
}

function policyCall(methodName: string, args: Record<string, unknown>): ContractCall {
  return {
    receiverId: NEAR_CONFIG.agentPolicyContract,
    methodName,
    args,
    gas: DEFAULT_FUNCTION_GAS,
    deposit: 0n,
  };
}

export async function submitPolicyCalls(calls: ContractCall[]): Promise<ChainResult> {
  const st = useNearPocketStore.getState();
  if (!calls.length || !NEAR_CONFIG.agentPolicyContract) {
    return { ok: false, mode: "skipped", detailCode: "unavailable" };
  }
  if (st.demoMode || !st.accountId || st.accountId === "demo.local" || NEAR_CONFIG.networkId !== "testnet" || st.accountId.endsWith(".near")) {
    return {
      ok: false,
      mode: "skipped",
      detailCode: NEAR_CONFIG.networkId !== "testnet" || st.accountId?.endsWith(".near") ? "not-testnet" : "demo",
    };
  }
  const needsOwner = calls.some((call) => isOwnerOnlyMethod(call.methodName));
  if (needsOwner) {
    const owner = await fetchContractOwner();
    if (!owner || !st.accountId || owner !== st.accountId) {
      return {
        ok: false,
        mode: "skipped",
        detailCode: owner && st.accountId && owner !== st.accountId ? "owner-only" : "unavailable",
      };
    }
  }
  return submitContractCalls(calls, { accountId: st.accountId, demoMode: st.demoMode });
}

export function shopRequestCalls(item: {
  id: string;
  title: string;
  category: string;
  amountUsdc: number;
  withinBudget: boolean;
}): ContractCall[] {
  const amount = numberToUsdc6(item.amountUsdc);
  const queue = policyCall("queue_item", {
    id: item.id,
    title: item.title.slice(0, 180),
    category: item.category.slice(0, 64) || "shopping",
    target_usdc_6: amount,
  });
  if (!item.withinBudget) return [queue];
  return [queue, policyCall("request_spend", { id: item.id, amount_usdc_6: amount })];
}

export function shopApproveCalls(item: { id: string; amountUsdc: number }): ContractCall[] {
  return [
    policyCall("approve_spend", {
      id: item.id,
      amount_usdc_6: numberToUsdc6(item.amountUsdc),
      plan_id: null,
    }),
  ];
}

/** Immediate purchase: queue the item, then approve it. Does not also request_spend. */
export function shopBuyCalls(item: {
  id: string;
  title: string;
  category: string;
  amountUsdc: number;
}): ContractCall[] {
  const amount = numberToUsdc6(item.amountUsdc);
  return [
    policyCall("queue_item", {
      id: item.id,
      title: item.title.slice(0, 180),
      category: item.category.slice(0, 64) || "shopping",
      target_usdc_6: amount,
    }),
    policyCall("approve_spend", { id: item.id, amount_usdc_6: amount, plan_id: null }),
  ];
}

export function setPolicyCall(policy: SpendPolicy): ContractCall {
  return policyCall("set_policy", {
    daily_limit_usdc_6: numberToUsdc6(policy.dailyLimitUsdc),
    per_item_max_usdc_6: numberToUsdc6(policy.perItemMaxUsdc),
    require_approval: policy.requireApproval,
    paused: policy.paused,
  });
}
