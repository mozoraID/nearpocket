"use client";

import type { SpendPolicy } from "@/lib/agent/policy";
import { setPolicyCall, submitPolicyCalls } from "./policy-chain";

/**
 * Save spend limits for the connected account. On the per-account contract
 * any testnet wallet can call set_policy. Demo mode stays on this device.
 * A contract that does not escrow per account is not called.
 */
export async function trySetPolicyOnChain(
  policy: SpendPolicy,
  opts: { demoMode: boolean; accountId: string | null },
): Promise<{
  ok: boolean;
  mode: "on-chain" | "local";
  gasCovered?: boolean;
  detailCode?: "owner-only" | "legacy-contract" | "needs-escrow";
  detail?: string;
}> {
  if (opts.demoMode || !opts.accountId || opts.accountId === "demo.local") {
    return { ok: true, mode: "local", detail: "Demo mode — saved locally." };
  }
  try {
    const chain = await submitPolicyCalls([setPolicyCall(policy)]);
    if (chain.detailCode === "owner-only" || chain.detailCode === "legacy-contract" || chain.detailCode === "needs-escrow") {
      return { ok: true, mode: "local", detailCode: chain.detailCode, detail: chain.detail };
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
