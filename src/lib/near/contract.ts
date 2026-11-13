import { NEAR_CONFIG } from "./config";

export interface OnChainPolicy {
  daily_limit_usdc_6: string;
  per_item_max_usdc_6: string;
  require_approval: boolean;
  paused: boolean;
  spent_today_usdc_6: string;
  /** Present on the previous single-owner contract. */
  owner?: string;
  /** Present on the per-account escrow contract. */
  account_id?: string;
  registered?: boolean;
  global_paused?: boolean;
}

export interface OnChainConfig {
  version: number;
  owner: string;
  usdc_contract: string;
  settlement_account: string;
  global_paused: boolean;
}

export interface OnChainEscrow {
  account_id: string;
  available_usdc_6: string;
  locked_usdc_6: string;
  pending_withdraw_usdc_6: string;
}

export const ESCROW_CONTRACT_VERSION = 2;

function toBase64(str: string) {
  return Buffer.from(str).toString("base64");
}

async function viewMethod(method: string, args: object = {}) {
  const res = await fetch(NEAR_CONFIG.nodeUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "nearpocket",
      method: "query",
      params: {
        request_type: "call_function",
        finality: "final",
        account_id: NEAR_CONFIG.agentPolicyContract,
        method_name: method,
        args_base64: toBase64(JSON.stringify(args)),
      },
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || "view failed");
  const raw = data.result?.result;
  if (!raw) throw new Error("empty view result");
  const bytes = Uint8Array.from(raw);
  return JSON.parse(new TextDecoder().decode(bytes));
}

export async function fetchContractVersion(): Promise<number | null> {
  if (!NEAR_CONFIG.agentPolicyContract) return null;
  try {
    const version = await viewMethod("contract_version");
    return typeof version === "number" ? version : null;
  } catch {
    return null;
  }
}

export async function fetchOnChainConfig(): Promise<OnChainConfig | null> {
  if (!NEAR_CONFIG.agentPolicyContract) return null;
  try {
    return (await viewMethod("get_config")) as OnChainConfig;
  } catch {
    return null;
  }
}

export async function fetchOnChainPolicy(accountId?: string | null): Promise<OnChainPolicy | null> {
  if (!NEAR_CONFIG.agentPolicyContract) return null;
  try {
    if (accountId) {
      return (await viewMethod("get_policy", { account_id: accountId })) as OnChainPolicy;
    }
    return (await viewMethod("get_policy")) as OnChainPolicy;
  } catch {
    if (accountId) {
      try {
        return (await viewMethod("get_policy")) as OnChainPolicy;
      } catch {
        return null;
      }
    }
    return null;
  }
}

export async function fetchOnChainEscrow(accountId: string): Promise<OnChainEscrow | null> {
  if (!NEAR_CONFIG.agentPolicyContract) return null;
  try {
    return (await viewMethod("get_escrow", { account_id: accountId })) as OnChainEscrow;
  } catch {
    return null;
  }
}

export function usdc6ToNumber(v: string | number) {
  return Number(v) / 1_000_000;
}

export function numberToUsdc6(n: number) {
  return String(Math.round(n * 1_000_000));
}
