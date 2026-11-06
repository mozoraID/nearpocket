import type { MarketplaceOffer } from "../marketplaces/types";

export type PlanStatus = "draft" | "active" | "paused" | "completed" | "expired";
export type PlanItemStatus =
  | "queued"
  | "searching"
  | "watching"
  | "ready"
  | "awaiting_approval"
  | "approved"
  | "rejected"
  | "purchased"
  | "cancelled";

export interface ShoppingPlanItem {
  id: string;
  name: string;
  category: string;
  targetPriceUsdc: number;
  maxPriceUsdc: number;
  qty: number;
  notes?: string;
  status: PlanItemStatus;
  bestOffer?: MarketplaceOffer;
  offers?: MarketplaceOffer[];
  agentReason?: string;
}

export interface ShoppingPlan {
  id: string;
  title: string;
  budgetUsdc: number;
  spentUsdc: number;
  deadline: string; // ISO date
  preferences: string;
  marketplaces: string[];
  status: PlanStatus;
  items: ShoppingPlanItem[];
  createdAt: string;
  updatedAt: string;
  onChainSynced?: boolean;
  lastTxHash?: string;
}

export function newPlanId() {
  return `plan_${Date.now().toString(36)}`;
}

export function newItemId() {
  return `item_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}
