import { NextRequest, NextResponse } from "next/server";
import {
  ESCROW_CONTRACT_VERSION,
  fetchContractVersion,
  fetchOnChainConfig,
  fetchOnChainEscrow,
  fetchOnChainPolicy,
  usdc6ToNumber,
} from "@/lib/near/contract";
import { NEAR_CONFIG, explorerTxUrl, explorerAccountUrl } from "@/lib/near/config";
import deployed from "@/config/deployed.json";

export async function GET(req: NextRequest) {
  const account = req.nextUrl.searchParams.get("account")?.trim() || "";
  const version = await fetchContractVersion();
  const escrowReady = version != null && version >= ESCROW_CONTRACT_VERSION;
  const [config, policy, escrow] = await Promise.all([
    escrowReady ? fetchOnChainConfig() : Promise.resolve(null),
    fetchOnChainPolicy(escrowReady && account ? account : null),
    escrowReady && account ? fetchOnChainEscrow(account) : Promise.resolve(null),
  ]);
  return NextResponse.json({
    network: NEAR_CONFIG.networkId,
    contractId: NEAR_CONFIG.agentPolicyContract,
    explorerAccount: explorerAccountUrl(NEAR_CONFIG.agentPolicyContract),
    version,
    legacy: !escrowReady,
    config,
    escrow: escrow
      ? {
          ...escrow,
          availableUsdc: usdc6ToNumber(escrow.available_usdc_6),
          lockedUsdc: usdc6ToNumber(escrow.locked_usdc_6),
        }
      : null,
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
