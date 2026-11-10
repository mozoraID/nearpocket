"use client";

import type { SpendPolicy } from "@/lib/agent/policy";
import { setPolicyCall, submitPolicyCalls } from "./policy-chain";

/**
 * Save spend limits. On testnet, try a gasless meta-transaction first.
 * If the relayer is not configured, the connected wallet sends set_policy
 * and the user pays gas. Demo mode stays on this device.
 *
 * set_policy is owner-only. The predecessor of a meta-transaction is the
 * signing account, so a wallet that is not the contract owner is not sent
 * on-chain.
 */
export async function trySetPolicyOnChain(
  policy: SpendPolicy,
  opts: { demoMode: boolean; accountId: string | null },
): Promise<{
  ok: boolean;
  mode: "on-chain" | "local";
  gasCovered?: boolean;
  detailCode?: "owner-only";
  detail?: string;
}> {
  if (opts.demoMode || !opts.accountId || opts.accountId === "demo.local") {
    return { ok: true, mode: "local", detail: "Demo mode — saved locally." };
  }
  try {
    const chain = await submitPolicyCalls([setPolicyCall(policy)]);
    if (chain.detailCode === "owner-only") {
      return { ok: true, mode: "local", detailCode: "owner-only" };
    }
    if (chain.ok && chain.txHash) {
      return { ok: true, mode: "on-chain", gasCovered: chain.mode === "gasless" };
    }
    return {
      ok: true,
      mode: "local",
      detail: chain.detail || "Saved locally.",
    };
  } catch (error) {
    return {
      ok: false,
      mode: "local",
      detail: error instanceof Error ? error.message : "set_policy failed — kept local",
    };
  }
}
