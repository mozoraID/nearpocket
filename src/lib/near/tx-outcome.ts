/**
 * Decide whether a NEAR final execution outcome really succeeded.
 * The outer transaction can be SuccessValue while a later receipt panicked.
 */

export interface TxVerdict {
  ok: boolean;
  hash?: string;
  error?: string;
}

interface StatusRecord {
  SuccessValue?: string;
  SuccessReceiptId?: string;
  Failure?: unknown;
}

function isStatus(value: unknown): value is StatusRecord {
  return Boolean(value) && typeof value === "object";
}

function statusSucceeded(status: unknown): boolean {
  if (!isStatus(status)) return false;
  if ("Failure" in status && status.Failure != null) return false;
  return "SuccessValue" in status || "SuccessReceiptId" in status;
}

function failureText(failure: unknown): string {
  const raw = typeof failure === "string" ? failure : JSON.stringify(failure);
  const panicked = raw.match(/Smart contract panicked: ([^"\\]+)/);
  if (panicked) return panicked[1];
  const execution = raw.match(/ExecutionError":"([^"]+)"/);
  if (execution) return execution[1];
  const access = raw.match(/DelegateActionAccessKeyError":\{?"?([A-Za-z]+)/);
  if (access) return `DelegateActionAccessKeyError: ${access[1]}`;
  if (raw.includes("RequiresFullAccess")) return "DelegateActionAccessKeyError: RequiresFullAccess";
  return raw.slice(0, 400);
}

function collectStatuses(outcome: Record<string, unknown>): unknown[] {
  const found: unknown[] = [];
  if (outcome.status) found.push(outcome.status);
  const txOutcome = outcome.transaction_outcome as { outcome?: { status?: unknown } } | undefined;
  if (txOutcome?.outcome?.status) found.push(txOutcome.outcome.status);
  const receipts = outcome.receipts_outcome;
  if (Array.isArray(receipts)) {
    for (const receipt of receipts) {
      const status = (receipt as { outcome?: { status?: unknown } })?.outcome?.status;
      if (status) found.push(status);
    }
  }
  return found;
}

/** Success only when the transaction and every receipt succeeded. */
export function verdictFromExecutionOutcome(outcome: unknown): TxVerdict {
  if (!outcome || typeof outcome !== "object") {
    return { ok: false, error: "missing execution outcome" };
  }
  const record = outcome as Record<string, unknown>;
  const transaction = record.transaction as { hash?: string } | undefined;
  const txOutcome = record.transaction_outcome as { id?: string } | undefined;
  const hash = transaction?.hash || txOutcome?.id;
  const statuses = collectStatuses(record);
  if (!statuses.length) {
    return { ok: false, hash, error: "no execution status" };
  }
  for (const status of statuses) {
    if (!statusSucceeded(status)) {
      const failure = isStatus(status) ? status.Failure : status;
      return { ok: false, hash, error: failureText(failure ?? status) };
    }
  }
  // A SuccessValue with no receipt list is only a partial wallet response.
  if (!Array.isArray(record.receipts_outcome)) {
    return { ok: false, hash, error: "no execution status" };
  }
  return { ok: true, hash };
}
