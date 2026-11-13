export type SpendBlock =
  | { code: "request-open" }
  | { code: "needs-escrow"; available: string }
  | { code: "unknown" };

const OPEN = new Set(["awaiting_approval", "transferring"]);

export function isOpenSpendStatus(status: string | undefined): boolean {
  return Boolean(status && OPEN.has(status));
}

/**
 * Decide whether a new request_spend may be signed.
 * An open request wins over a low escrow balance so the message matches the chain.
 * When the request list has not loaded, refuse to sign instead of guessing.
 */
export function spendBlock(opts: {
  id?: string;
  amountUsdc: number;
  requests?: { id: string; status: string }[] | null;
  requestsLoaded?: boolean;
  escrowAvailableUsdc?: number | null;
}): SpendBlock | null {
  if (opts.requestsLoaded && opts.id && opts.requests?.some((row) => row.id === opts.id && isOpenSpendStatus(row.status))) {
    return { code: "request-open" };
  }
  if (
    typeof opts.escrowAvailableUsdc === "number" &&
    Number.isFinite(opts.escrowAvailableUsdc) &&
    opts.amountUsdc > opts.escrowAvailableUsdc + 1e-8
  ) {
    return { code: "needs-escrow", available: opts.escrowAvailableUsdc.toFixed(2) };
  }
  if (!opts.requestsLoaded) return { code: "unknown" };
  return null;
}

export function budgetDecision(priceUsdc: number, budgetUsdc: number): "within" | "over_budget" {
  if (!(budgetUsdc > 0) || !(priceUsdc > 0)) return "over_budget";
  return priceUsdc <= budgetUsdc + 1e-9 ? "within" : "over_budget";
}
