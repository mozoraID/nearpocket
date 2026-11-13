import { NextRequest, NextResponse } from "next/server";
import { DEFAULT_USDC_CONTRACT_ID } from "@/lib/near/relay-allowlist";
import { NEAR_CONFIG } from "@/lib/near/config";
import { fetchOnChainEscrow, usdc6ToNumber, viewOnContract } from "@/lib/near/contract";

function asUnits(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") return String(value);
  return "0";
}

export async function GET(req: NextRequest) {
  const account = req.nextUrl.searchParams.get("account")?.trim() || "";
  if (!account) {
    return NextResponse.json({ error: "account is required" }, { status: 400 });
  }
  const usdc = process.env.NEAR_USDC_CONTRACT_ID || DEFAULT_USDC_CONTRACT_ID;
  let walletRaw = "0";
  let registered = false;
  let minStorageYocto = "1250000000000000000000";
  try {
    const balance = await viewOnContract(usdc, "ft_balance_of", { account_id: account });
    walletRaw = asUnits(balance);
  } catch {
    walletRaw = "0";
  }
  try {
    const bounds = (await viewOnContract(usdc, "storage_balance_bounds", {})) as { min?: string };
    if (bounds?.min) minStorageYocto = String(bounds.min);
  } catch {
    /* keep the usual NEP-145 minimum */
  }
  try {
    const storage = await viewOnContract(usdc, "storage_balance_of", { account_id: account });
    registered = Boolean(storage);
  } catch {
    registered = false;
  }
  const requestIds = req.nextUrl.searchParams.getAll("request").slice(0, 20);
  const requests: { id: string; status: string; amountUsdc: number }[] = [];
  for (const id of requestIds) {
    try {
      const view = (await viewOnContract(NEAR_CONFIG.agentPolicyContract, "get_request", {
        account_id: account,
        id,
      })) as { status?: string; amount_usdc_6?: string } | null;
      if (view?.status) {
        requests.push({
          id,
          status: view.status,
          amountUsdc: usdc6ToNumber(view.amount_usdc_6 || 0),
        });
      }
    } catch {
      /* this id was never locked on chain */
    }
  }
  const escrow = await fetchOnChainEscrow(account);
  const availableRaw = escrow?.available_usdc_6 ?? "0";
  const lockedRaw = escrow?.locked_usdc_6 ?? "0";
  return NextResponse.json({
    accountId: account,
    usdcContract: usdc,
    policyContract: NEAR_CONFIG.agentPolicyContract,
    walletUsdc6: walletRaw,
    walletUsdc: usdc6ToNumber(walletRaw),
    escrowAvailableUsdc6: String(availableRaw),
    escrowLockedUsdc6: String(lockedRaw),
    escrowAvailableUsdc: usdc6ToNumber(availableRaw),
    escrowLockedUsdc: usdc6ToNumber(lockedRaw),
    registered,
    minStorageYocto,
    requests,
  });
}
