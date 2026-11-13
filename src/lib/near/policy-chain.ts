"use client";

/**
 * Shop and policy calls for the connected wallet.
 *
 * On the per-account contract, set_policy, queue_item, request_spend, and
 * approve_spend all run as predecessor_account_id. A new wallet does not
 * need the contract admin. request_spend locks that wallet's escrow, and
 * approve_spend is what releases USDC to the settlement account.
 *
 * The previous single-owner contract has no escrow. Those calls are not
 * sent; the UI shows a limitation note instead.
 */
import { useNearPocketStore } from "@/lib/store";
import { numberToUsdc6 } from "./contract";
import { NEAR_CONFIG } from "./config";
import { submitContractCalls, type ChainResult, type ContractCall } from "./gasless";
import { DEFAULT_FUNCTION_GAS, SPEND_FUNCTION_GAS } from "./relay-allowlist";
import type { SpendPolicy } from "@/lib/agent/policy";

export type { ChainResult, ContractCall };

const SPEND_GAS_METHODS = new Set(["request_spend", "approve_spend", "withdraw", "reject_spend"]);

interface ChainAccount {
  version: number | null;
  legacy: boolean;
  escrow: { available_usdc_6?: string; locked_usdc_6?: string } | null;
}

async function fetchChainAccount(accountId: string): Promise<ChainAccount | null> {
  try {
    const res = await fetch(`/api/contract?account=${encodeURIComponent(accountId)}`);
    if (!res.ok) return null;
    return (await res.json()) as ChainAccount;
  } catch {
    return null;
  }
}

function asUnits(value: unknown): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number" && Number.isFinite(value)) return BigInt(Math.round(value));
  if (typeof value === "string" && value.trim()) {
    try {
      return BigInt(value);
    } catch {
      return 0n;
    }
  }
  return 0n;
}

function policyCall(methodName: string, args: Record<string, unknown>): ContractCall {
  return {
    receiverId: NEAR_CONFIG.agentPolicyContract,
    methodName,
    args,
    gas: SPEND_GAS_METHODS.has(methodName) ? SPEND_FUNCTION_GAS : DEFAULT_FUNCTION_GAS,
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
  const info = await fetchChainAccount(st.accountId);
  if (!info || info.legacy || info.version == null || info.version < 2) {
    return { ok: false, mode: "skipped", detailCode: "legacy-contract" };
  }
  const requests = calls.filter((call) => call.methodName === "request_spend");
  const approves = calls.filter((call) => call.methodName === "approve_spend");
  if (requests.length || approves.length) {
    const available = asUnits(info.escrow?.available_usdc_6);
    const locked = asUnits(info.escrow?.locked_usdc_6);
    const requestAmount = requests.reduce((sum, call) => sum + asUnits(call.args.amount_usdc_6), 0n);
    const approveAmount = approves.reduce((sum, call) => sum + asUnits(call.args.amount_usdc_6), 0n);
    if (requests.length && available < requestAmount) {
      return {
        ok: false,
        mode: "skipped",
        detailCode: "needs-escrow",
        detail: (Number(available) / 1_000_000).toFixed(2),
      };
    }
    if (!requests.length && approves.length && locked < approveAmount && available < approveAmount) {
      return {
        ok: false,
        mode: "skipped",
        detailCode: "needs-escrow",
        detail: (Number(available) / 1_000_000).toFixed(2),
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

export function shopRejectCalls(item: { id: string }): ContractCall[] {
  return [policyCall("reject_spend", { id: item.id })];
}

/** Immediate purchase: queue, lock escrow, then release it. Does not count the spend twice. */
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
    policyCall("request_spend", { id: item.id, amount_usdc_6: amount }),
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
