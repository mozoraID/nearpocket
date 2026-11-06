/**
 * Agent spend policy — mirrors what the on-chain contract enforces.
 * User stays in control: daily limit, per-item max, category allowlist, requireApproval.
 */

export type WaitlistStatus =
  | "queued"
  | "watching"
  | "ready"
  | "awaiting_approval"
  | "approved"
  | "rejected"
  | "purchased"
  | "expired"
  | "cancelled";

export interface SpendPolicy {
  /** Max USDC the agent may spend per calendar day (UTC) */
  dailyLimitUsdc: number;
  /** Max USDC per single item */
  perItemMaxUsdc: number;
  /** Always require explicit user approval before purchase */
  requireApproval: boolean;
  /** Optional category allowlist; empty = all */
  allowedCategories: string[];
  /** Pause the agent entirely */
  paused: boolean;
  /** Spent today (tracked client-side in demo; on-chain in contract) */
  spentTodayUsdc: number;
  spentDayKey: string; // YYYY-MM-DD UTC
}

export interface WaitlistItem {
  id: string;
  title: string;
  merchant: string;
  category: string;
  targetPriceUsdc: number;
  currentPriceUsdc: number;
  url?: string;
  notes?: string;
  status: WaitlistStatus;
  createdAt: string;
  updatedAt: string;
  /** Why the agent thinks it's ready */
  agentReason?: string;
  /** Max budget the user set for the agent (USDC) */
  maxBudgetUsdc?: number;
  /** ISO date the agent should stop watching */
  deadline?: string;
  /** Source marketplace of the offer the agent is tracking */
  marketplace?: string;
  /** True when the source offer is synthetic demo data */
  mocked?: boolean;
}

export const DEFAULT_POLICY: SpendPolicy = {
  dailyLimitUsdc: 50,
  perItemMaxUsdc: 25,
  requireApproval: true,
  allowedCategories: ["electronics", "groceries", "fashion", "digital", "food"],
  paused: false,
  spentTodayUsdc: 0,
  spentDayKey: new Date().toISOString().slice(0, 10),
};

export function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

export function refreshDaily(policy: SpendPolicy): SpendPolicy {
  const key = todayKey();
  if (policy.spentDayKey === key) return policy;
  return { ...policy, spentTodayUsdc: 0, spentDayKey: key };
}

export type PolicyCheck =
  | { ok: true }
  | { ok: false; reason: string };

export function checkSpend(
  policy: SpendPolicy,
  amountUsdc: number,
  category: string,
): PolicyCheck {
  const p = refreshDaily(policy);
  if (p.paused) return { ok: false, reason: "Agent is paused by user." };
  if (amountUsdc <= 0) return { ok: false, reason: "Invalid amount." };
  if (amountUsdc > p.perItemMaxUsdc)
    return {
      ok: false,
      reason: `Item ${amountUsdc} USDC exceeds per-item max ${p.perItemMaxUsdc} USDC.`,
    };
  if (p.spentTodayUsdc + amountUsdc > p.dailyLimitUsdc)
    return {
      ok: false,
      reason: `Would exceed daily limit (${p.spentTodayUsdc + amountUsdc} / ${p.dailyLimitUsdc} USDC).`,
    };
  if (
    p.allowedCategories.length > 0 &&
    !p.allowedCategories.includes(category.toLowerCase())
  )
    return { ok: false, reason: `Category "${category}" is not allowed.` };
  return { ok: true };
}
