"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  DEFAULT_POLICY,
  SpendPolicy,
  WaitlistItem,
  refreshDaily,
} from "./agent/policy";
import type { SettlementReceipt } from "./settlement/types";
import { DEMO_ACCOUNT } from "./near/config";

interface NearlyState {
  accountId: string | null;
  demoMode: boolean;
  balanceUsdc: number;
  policy: SpendPolicy;
  waitlist: WaitlistItem[];
  receipts: SettlementReceipt[];
  connectDemo: () => void;
  disconnect: () => void;
  setPolicy: (p: Partial<SpendPolicy>) => void;
  addWaitlist: (item: WaitlistItem) => void;
  updateWaitlist: (id: string, patch: Partial<WaitlistItem>) => void;
  removeWaitlist: (id: string) => void;
  recordReceipt: (r: SettlementReceipt) => void;
  debitUsdc: (amount: number) => void;
}

export const useNearlyStore = create<NearlyState>()(
  persist(
    (set, get) => ({
      accountId: null,
      demoMode: true,
      balanceUsdc: DEMO_ACCOUNT.displayBalanceUsdc,
      policy: DEFAULT_POLICY,
      waitlist: [],
      receipts: [],
      connectDemo: () =>
        set({
          accountId: DEMO_ACCOUNT.accountId,
          demoMode: true,
          balanceUsdc: DEMO_ACCOUNT.displayBalanceUsdc,
        }),
      disconnect: () => set({ accountId: null }),
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
      recordReceipt: (r) =>
        set({ receipts: [r, ...get().receipts].slice(0, 40) }),
      debitUsdc: (amount) =>
        set({
          balanceUsdc: Math.max(0, get().balanceUsdc - amount),
          policy: (() => {
            const p = refreshDaily(get().policy);
            return {
              ...p,
              spentTodayUsdc: p.spentTodayUsdc + amount,
            };
          })(),
        }),
    }),
    { name: "nearly-v1" },
  ),
);
