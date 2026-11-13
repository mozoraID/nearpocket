import type { WaitlistItem } from "../agent/policy";
import type { ChainSpendRequest } from "./chain-types";

export function formatRequestExpiry(expiresAtNs: string): string {
  try {
    const ms = Number(BigInt(expiresAtNs) / 1_000_000n);
    if (!Number.isFinite(ms) || ms <= 0) return "";
    return new Date(ms).toISOString().slice(0, 16).replace("T", " ");
  } catch {
    return "";
  }
}

export function itemFromChainRequest(req: ChainSpendRequest, local?: WaitlistItem | null): WaitlistItem {
  return {
    id: req.id,
    title: req.title || local?.title || req.id,
    merchant: local?.merchant || req.category || "Shop",
    category: req.category || local?.category || "shopping",
    targetPriceUsdc: req.amountUsdc,
    currentPriceUsdc: req.amountUsdc,
    marketplace: local?.marketplace,
    mocked: local?.mocked,
    url: local?.url,
    maxBudgetUsdc: local?.maxBudgetUsdc,
    deadline: local?.deadline,
    status: "awaiting_approval",
    createdAt: local?.createdAt || new Date(0).toISOString(),
    updatedAt: local?.updatedAt || new Date(0).toISOString(),
    agentReason: local?.agentReason,
    shipTo: local?.shipTo,
    deliveryAddressId: local?.deliveryAddressId,
  };
}

export interface ApprovalCardModel {
  request: ChainSpendRequest;
  item: WaitlistItem;
}

/** Needs-you cards are chain requests in awaiting_approval. Local rows do not invent one. */
export function approvalCards(opts: {
  real: boolean;
  requestsLoaded: boolean;
  requests: ChainSpendRequest[] | undefined;
  waitlist: WaitlistItem[];
}): ApprovalCardModel[] {
  if (!opts.real || !opts.requestsLoaded) return [];
  return (opts.requests || [])
    .filter((req) => req.status === "awaiting_approval")
    .map((req) => ({
      request: req,
      item: itemFromChainRequest(
        req,
        opts.waitlist.find((row) => row.id === req.id),
      ),
    }));
}

export function openRequestIds(requests: ChainSpendRequest[] | undefined): Set<string> {
  return new Set(
    (requests || []).filter((req) => req.status === "awaiting_approval" || req.status === "transferring").map((req) => req.id),
  );
}
