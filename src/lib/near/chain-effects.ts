import type { WaitlistStatus } from "../agent/policy";

export interface ChainEffect {
  /** Omitted when local waitlist status must stay as it was. */
  waitlistStatus?: WaitlistStatus;
  purchased: boolean;
  /** Local demo balance is not moved by a chain receipt. */
  debitUsdc: number;
}

/**
 * Map a confirmed-or-not chain step onto local state.
 * A receipt failure never marks the item purchased and never debits the local balance.
 */
export function chainEffects(input: {
  action: "request" | "approve" | "reject";
  ok: boolean;
  completedMethods?: string[];
}): ChainEffect {
  if (!input.ok) {
    if (input.action === "request" && input.completedMethods?.includes("queue_item")) {
      return { waitlistStatus: "queued", purchased: false, debitUsdc: 0 };
    }
    return { purchased: false, debitUsdc: 0 };
  }
  if (input.action === "approve") return { waitlistStatus: "purchased", purchased: true, debitUsdc: 0 };
  if (input.action === "reject") return { waitlistStatus: "rejected", purchased: false, debitUsdc: 0 };
  return { waitlistStatus: "awaiting_approval", purchased: false, debitUsdc: 0 };
}

/** Agent activity that is only a watch is not an approval item. */
export function displayActivityStatus(entry: {
  kind: string;
  status?: string;
  txHash?: string;
}): string | undefined {
  if (
    entry.kind === "agent" &&
    !entry.txHash &&
    (entry.status === "awaiting_approval" || entry.status === "ready" || entry.status === "queued")
  ) {
    return "watching";
  }
  return entry.status;
}
