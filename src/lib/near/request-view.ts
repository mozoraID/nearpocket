import type { ChainSpendRequest } from "./chain-types";

function asString(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(Math.round(value));
  return "";
}

function units(value: unknown): string {
  const text = asString(value);
  return text || "0";
}

/** Map a get_request / get_requests JSON row into the approval card model. */
export function mapSpendRequestView(
  row: Record<string, unknown>,
  fallbackSettlement = "",
): ChainSpendRequest | null {
  const id = asString(row.id);
  const status = asString(row.status);
  if (!id || !status) return null;
  const amountUsdc6 = units(row.amount_usdc_6);
  return {
    id,
    title: asString(row.title) || id,
    category: asString(row.category),
    amountUsdc6,
    amountUsdc: Number(amountUsdc6) / 1_000_000,
    status,
    expiresAtNs: asString(row.expires_at_ns),
    settlementAccount: asString(row.settlement_account) || fallbackSettlement,
  };
}
