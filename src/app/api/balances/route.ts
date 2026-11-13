import { NextRequest, NextResponse } from "next/server";
import { DEFAULT_USDC_CONTRACT_ID } from "@/lib/near/relay-allowlist";
import { NEAR_CONFIG } from "@/lib/near/config";
import { fetchOnChainEscrow, usdc6ToNumber, viewOnContract } from "@/lib/near/contract";
import { listChainSpendRequests } from "@/lib/near/spend-index";

export const dynamic = "force-dynamic";

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
  let requests: Awaited<ReturnType<typeof listChainSpendRequests>>["requests"] = [];
  let settlementAccount = "";
  let requestsLoaded = false;
  try {
    const listed = await listChainSpendRequests(account);
    requests = listed.requests;
    settlementAccount = listed.settlementAccount;
    requestsLoaded = true;
  } catch {
    requestsLoaded = false;
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
    requestsLoaded,
    settlementAccount,
  });
}
