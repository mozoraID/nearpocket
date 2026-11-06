import { NextResponse } from "next/server";
import { fetchOnChainPolicy, usdc6ToNumber } from "@/lib/near/contract";
import { NEAR_CONFIG, explorerTxUrl, explorerAccountUrl } from "@/lib/near/config";
import deployed from "@/config/deployed.json";

export async function GET() {
  const policy = await fetchOnChainPolicy();
  return NextResponse.json({
    network: NEAR_CONFIG.networkId,
    contractId: NEAR_CONFIG.agentPolicyContract,
    explorerAccount: explorerAccountUrl(NEAR_CONFIG.agentPolicyContract),
    sampleTxs: Object.fromEntries(
      Object.entries(deployed.sampleTxs || {}).map(([k, h]) => [
        k,
        { hash: h, url: explorerTxUrl(h) },
      ]),
    ),
    policy: policy
      ? {
          ...policy,
          dailyLimitUsdc: usdc6ToNumber(policy.daily_limit_usdc_6),
          perItemMaxUsdc: usdc6ToNumber(policy.per_item_max_usdc_6),
          spentTodayUsdc: usdc6ToNumber(policy.spent_today_usdc_6),
        }
      : null,
  });
}
