import type { ChainSpendRequest } from "./chain-types";
import { NEAR_CONFIG } from "./config";
import { usdc6ToNumber, viewOnContract } from "./contract";
import { mapSpendRequestView } from "./request-view";
import { REQUEST_INDEX_PREFIX, requestIdFromIndexKey } from "./request-index";
import { rpcCall } from "./rpc";

function asString(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(Math.round(value));
  return "";
}

function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

export async function listAccountRequestIds(accountId: string, contractId: string): Promise<string[]> {
  const result = (await rpcCall({
    jsonrpc: "2.0",
    id: "nearpocket",
    method: "query",
    params: {
      request_type: "view_state",
      finality: "final",
      account_id: contractId,
      prefix_base64: toBase64(REQUEST_INDEX_PREFIX),
    },
  })) as { values?: { key: string }[] };
  const ids: string[] = [];
  for (const row of result.values || []) {
    const key = Uint8Array.from(Buffer.from(row.key, "base64"));
    const id = requestIdFromIndexKey(key, accountId);
    if (id) ids.push(id);
  }
  return ids;
}

export async function listChainSpendRequests(accountId: string): Promise<{
  requests: ChainSpendRequest[];
  settlementAccount: string;
}> {
  const contractId = NEAR_CONFIG.agentPolicyContract;
  if (!contractId || !accountId) return { requests: [], settlementAccount: "" };
  const config = (await viewOnContract(contractId, "get_config", {}).catch(() => null)) as {
    settlement_account?: string;
  } | null;
  const settlementAccount = config?.settlement_account || "";
  try {
    const page = await viewOnContract(contractId, "get_requests", {
      account_id: accountId,
      from_index: 0,
      limit: 50,
    });
    if (Array.isArray(page)) {
      const requests = page
        .map((row) => mapSpendRequestView(row as Record<string, unknown>, settlementAccount))
        .filter((row): row is ChainSpendRequest => Boolean(row));
      return { requests, settlementAccount };
    }
  } catch {
    /* The deployed v2 contract has no list method. Fall back to its storage index. */
  }
  const ids = await listAccountRequestIds(accountId, contractId);
  const requests = (
    await Promise.all(
      ids.slice(0, 40).map(async (id) => {
        try {
          const view = (await viewOnContract(contractId, "get_request", {
            account_id: accountId,
            id,
          })) as {
            status?: string;
            amount_usdc_6?: string | number;
            expires_at_ns?: string | number;
            settlement_account?: string;
          } | null;
          if (!view?.status) return null;
          let title = id;
          let category = "";
          try {
            const item = (await viewOnContract(contractId, "get_item", {
              account_id: accountId,
              id,
            })) as { title?: string; category?: string } | null;
            if (item?.title) title = item.title;
            if (item?.category) category = item.category;
          } catch {
            /* the request can still be approved without the item title */
          }
          const amountUsdc6 = asString(view.amount_usdc_6) || "0";
          return {
            id,
            title,
            category,
            amountUsdc6,
            amountUsdc: usdc6ToNumber(amountUsdc6),
            status: view.status,
            expiresAtNs: asString(view.expires_at_ns),
            settlementAccount: view.settlement_account || settlementAccount,
          } satisfies ChainSpendRequest;
        } catch {
          return null;
        }
      }),
    )
  ).filter((row): row is ChainSpendRequest => Boolean(row));
  return { requests, settlementAccount };
}
