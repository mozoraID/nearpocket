import { NEAR_CONFIG } from "./config";

export interface OnChainPolicy {
  daily_limit_usdc_6: string;
  per_item_max_usdc_6: string;
  require_approval: boolean;
  paused: boolean;
  spent_today_usdc_6: string;
  owner: string;
}

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

export async function fetchOnChainPolicy(): Promise<OnChainPolicy | null> {
  if (!NEAR_CONFIG.agentPolicyContract) return null;
  try {
    return (await viewMethod("get_policy")) as OnChainPolicy;
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
