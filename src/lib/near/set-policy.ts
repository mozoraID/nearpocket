"use client";

import { NEAR_CONFIG } from "./config";
import { numberToUsdc6 } from "./contract";
import type { SpendPolicy } from "@/lib/agent/policy";

/**
 * When a real wallet-selector session is active, sign set_policy on the
 * agent-policy contract. Demo / local / privy-without-signer → local only.
 */
export async function trySetPolicyOnChain(
  policy: SpendPolicy,
  opts: { demoMode: boolean; accountId: string | null },
): Promise<{ ok: boolean; mode: "on-chain" | "local"; detail?: string }> {
  if (opts.demoMode || !opts.accountId || opts.accountId === "demo.local") {
    return { ok: true, mode: "local", detail: "Demo mode — saved locally." };
  }
  try {
    const { setupWalletSelector } = await import("@near-wallet-selector/core");
    const { setupMeteorWallet } = await import("@near-wallet-selector/meteor-wallet");
    const { actions } = await import("near-api-js");
    const modules = [setupMeteorWallet()];
    try {
      const { setupHotWallet } = await import("@near-wallet-selector/hot-wallet");
      modules.push(setupHotWallet());
    } catch { /* optional */ }
    const selector = await setupWalletSelector({
      network: NEAR_CONFIG.networkId,
      modules,
    });
    if (!selector.isSignedIn()) {
      return { ok: true, mode: "local", detail: "Wallet not signed in — saved locally." };
    }
    const wallet = await selector.wallet();
    const action = actions.functionCall(
      "set_policy",
      {
        daily_limit_usdc_6: numberToUsdc6(policy.dailyLimitUsdc),
        per_item_max_usdc_6: numberToUsdc6(policy.perItemMaxUsdc),
        require_approval: policy.requireApproval,
        paused: policy.paused,
      },
      BigInt("30000000000000"),
      BigInt(0),
    );
    await wallet.signAndSendTransaction({
      receiverId: NEAR_CONFIG.agentPolicyContract,
      actions: [action as never],
    });
    return { ok: true, mode: "on-chain" };
  } catch (e) {
    return {
      ok: false,
      mode: "local",
      detail: e instanceof Error ? e.message : "set_policy failed — kept local",
    };
  }
}
