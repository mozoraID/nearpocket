"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  DEFAULT_POLICY,
  SpendPolicy,
  WaitlistItem,
  refreshDaily,
} from "./agent/policy";
import type { ShoppingPlan } from "./agent/plans";
import type { SettlementReceipt } from "./settlement/types";
import { DEMO_ACCOUNT } from "./near/config";

export type ActivityKind = "payment" | "agent" | "topup" | "purchase";

export interface ActivityEntry {
  id: string;
  at: string;
  kind: ActivityKind;
  title: string;
  detail?: string;
  status?: string;
  amountUsdc?: number;
  /** positive = money in */
  direction?: "in" | "out";
  link?: { label: string; href: string };
  receiptId?: string;
}

interface NearPocketState {
  activity: ActivityEntry[];
  logActivity: (e: Omit<ActivityEntry, "id" | "at"> & { at?: string }) => void;
  accountId: string | null;
  demoMode: boolean;
  balanceUsdc: number;
  policy: SpendPolicy;
  waitlist: WaitlistItem[];
  plans: ShoppingPlan[];
  receipts: SettlementReceipt[];
  connectDemo: () => void;
  connectWallet: (accountId: string) => void;
  disconnect: () => void;
  setPolicy: (p: Partial<SpendPolicy>) => void;
  addWaitlist: (item: WaitlistItem) => void;
  updateWaitlist: (id: string, patch: Partial<WaitlistItem>) => void;
  removeWaitlist: (id: string) => void;
  upsertPlan: (plan: ShoppingPlan) => void;
  updatePlan: (id: string, patch: Partial<ShoppingPlan>) => void;
  removePlan: (id: string) => void;
  recordReceipt: (r: SettlementReceipt) => void;
  debitUsdc: (amount: number) => void;
  creditUsdc: (amount: number) => void;
}

export const useNearPocketStore = create<NearPocketState>()(
  persist(
    (set, get) => ({
      accountId: null,
      demoMode: true,
      balanceUsdc: DEMO_ACCOUNT.displayBalanceUsdc,
      policy: DEFAULT_POLICY,
      waitlist: [],
      plans: [],
      receipts: [],
      activity: [],
      logActivity: (e) =>
        set({
          activity: [
            {
              ...e,
              id: `act_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
              at: e.at || new Date().toISOString(),
            },
            ...get().activity,
          ].slice(0, 80),
        }),
      connectDemo: () =>
        set({
          accountId: DEMO_ACCOUNT.accountId,
          demoMode: true,
          balanceUsdc: get().balanceUsdc || DEMO_ACCOUNT.displayBalanceUsdc,
        }),
      connectWallet: (accountId) =>
        set({ accountId, demoMode: false }),
      disconnect: () => set({ accountId: null, demoMode: true }),
      setPolicy: (p) =>
        set({ policy: refreshDaily({ ...get().policy, ...p }) }),
      addWaitlist: (item) =>
        set({ waitlist: [item, ...get().waitlist].slice(0, 50) }),
      updateWaitlist: (id, patch) =>
        set({
          waitlist: get().waitlist.map((w) =>
            w.id === id ? { ...w, ...patch, updatedAt: new Date().toISOString() } : w,
          ),
        }),
      removeWaitlist: (id) =>
        set({ waitlist: get().waitlist.filter((w) => w.id !== id) }),
      upsertPlan: (plan) => {
        const others = get().plans.filter((p) => p.id !== plan.id);
        set({ plans: [plan, ...others].slice(0, 30) });
      },
      updatePlan: (id, patch) =>
        set({
          plans: get().plans.map((p) =>
            p.id === id ? { ...p, ...patch, updatedAt: new Date().toISOString() } : p,
          ),
        }),
      removePlan: (id) =>
        set({ plans: get().plans.filter((p) => p.id !== id) }),
      recordReceipt: (r) =>
        set({ receipts: [r, ...get().receipts].slice(0, 40) }),
      debitUsdc: (amount) =>
        set({
          balanceUsdc: Math.max(0, get().balanceUsdc - amount),
          policy: (() => {
            const p = refreshDaily(get().policy);
            return { ...p, spentTodayUsdc: p.spentTodayUsdc + amount };
          })(),
        }),
      creditUsdc: (amount) =>
        set({ balanceUsdc: get().balanceUsdc + amount }),
    }),
    { name: "nearpocket-v2" },
  ),
);

/** @deprecated alias — prefer useNearPocketStore */
export const useNearlyStore = useNearPocketStore;
