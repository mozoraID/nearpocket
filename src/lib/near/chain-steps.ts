export interface TxStep {
  methodName: string;
  txHash: string;
  ok: boolean;
}

/** Every signed hash, not only the last one in a queue-then-request sequence. */
export function stepsFromChain(result: { txHash?: string; ok?: boolean; steps?: TxStep[] }): TxStep[] {
  if (result.steps?.length) return result.steps.filter((step) => step.txHash);
  if (result.txHash) return [{ methodName: "", txHash: result.txHash, ok: result.ok !== false }];
  return [];
}

/** Distinct activity copy for the two transactions in one approval request. */
export function stepTitleKey(methodName: string): "escrow.queued" | "escrow.requested" | null {
  if (methodName === "queue_item") return "escrow.queued";
  if (methodName === "request_spend") return "escrow.requested";
  return null;
}

/** The deposit banner is only for a fresh zero escrow read. A later balance clears it. */
export function showEscrowDepositBanner(opts: {
  real: boolean;
  legacy?: boolean;
  loaded: boolean;
  available?: number;
  locked?: number;
}): boolean {
  if (!opts.real || opts.legacy || !opts.loaded) return false;
  return (opts.available ?? 0) <= 0 && (opts.locked ?? 0) <= 0;
}
