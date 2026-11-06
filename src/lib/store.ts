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
import { defaultConnectedIds, type MarketplaceId } from "./marketplaces";

export type ActivityKind = "payment" | "agent" | "topup" | "purchase" | "card";

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

export interface VirtualCard {
  last4: string;
  holder: string;
  frozen: boolean;
  limitUsdc: number;
  balanceUsdc: number;
  expMonth: number;
  expYear: number;
}

export type AuthMethod = "demo" | "selector" | "local" | "privy";

interface NearPocketState {
  activity: ActivityEntry[];
  logActivity: (e: Omit<ActivityEntry, "id" | "at"> & { at?: string }) => void;
  accountId: string | null;
  demoMode: boolean;
  authMethod: AuthMethod;
  balanceUsdc: number;
  policy: SpendPolicy;
  waitlist: WaitlistItem[];
  plans: ShoppingPlan[];
  receipts: SettlementReceipt[];
  connectedMarketplaces: MarketplaceId[];
  card: VirtualCard;
  connectDemo: () => void;
  connectWallet: (accountId: string, method?: AuthMethod) => void;
  disconnect: () => void;
  setPolicy: (p: Partial<SpendPolicy>) => void;
  addWaitlist: (item: WaitlistItem) => void;
  updateWaitlist: (id: string, patch: Partial<WaitlistItem>) => void;
  removeWaitlist: (id: string) => void;
  upsertPlan: (plan: ShoppingPlan) => void;
  updatePlan: (id: string, patch: Partial<ShoppingPlan>) => void;
  removePlan: (id: string) => void;
  recordReceipt: (r: SettlementReceipt) => void;
  /** Debit wallet balance. countTowardAgentPolicy only for agent/shop policy spend. */
  debitUsdc: (amount: number, opts?: { countTowardAgentPolicy?: boolean }) => void;
  creditUsdc: (amount: number) => void;
  setConnectedMarketplaces: (ids: MarketplaceId[]) => void;
  toggleMarketplace: (id: MarketplaceId) => void;
  setCard: (patch: Partial<VirtualCard>) => void;
  topUpCard: (amountUsdc: number) => void;
}

function randomLast4() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

export const useNearPocketStore = create<NearPocketState>()(
  persist(
    (set, get) => ({
      accountId: null,
      demoMode: true,
      authMethod: "demo",
      balanceUsdc: DEMO_ACCOUNT.displayBalanceUsdc,
      policy: DEFAULT_POLICY,
      waitlist: [],
      plans: [],
      receipts: [],
      activity: [],
      connectedMarketplaces: defaultConnectedIds(),
      card: {
        last4: "4242",
        holder: "NEARPOCKET DEMO",
        frozen: false,
        limitUsdc: 200,
        balanceUsdc: 40,
        expMonth: 11,
        expYear: 29,
      },
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
          authMethod: "demo",
          balanceUsdc: get().balanceUsdc || DEMO_ACCOUNT.displayBalanceUsdc,
        }),
      connectWallet: (accountId, method = "selector") =>
        set({ accountId, demoMode: false, authMethod: method }),
      disconnect: () => set({ accountId: null, demoMode: true, authMethod: "demo" }),
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
      debitUsdc: (amount, opts) =>
        set({
          balanceUsdc: Math.max(0, get().balanceUsdc - amount),
          policy: opts?.countTowardAgentPolicy
            ? (() => {
                const p = refreshDaily(get().policy);
                return { ...p, spentTodayUsdc: p.spentTodayUsdc + amount };
              })()
            : get().policy,
        }),
      creditUsdc: (amount) =>
        set({ balanceUsdc: get().balanceUsdc + amount }),
      setConnectedMarketplaces: (ids) => set({ connectedMarketplaces: ids }),
      toggleMarketplace: (id) => {
        const cur = get().connectedMarketplaces;
        set({
          connectedMarketplaces: cur.includes(id)
            ? cur.filter((x) => x !== id)
            : [...cur, id],
        });
      },
      setCard: (patch) => set({ card: { ...get().card, ...patch } }),
      topUpCard: (amountUsdc) => {
        const st = get();
        if (amountUsdc <= 0 || amountUsdc > st.balanceUsdc) return;
        set({
          balanceUsdc: st.balanceUsdc - amountUsdc,
          card: { ...st.card, balanceUsdc: st.card.balanceUsdc + amountUsdc },
        });
      },
    }),
    {
      name: "nearpocket-v3",
      partialize: (s) => ({
        accountId: s.accountId,
        demoMode: s.demoMode,
        authMethod: s.authMethod,
        balanceUsdc: s.balanceUsdc,
        policy: s.policy,
        waitlist: s.waitlist,
        plans: s.plans,
        receipts: s.receipts,
        activity: s.activity,
        connectedMarketplaces: s.connectedMarketplaces,
        card: s.card,
      }),
    },
  ),
);

/** @deprecated alias — prefer useNearPocketStore */
export const useNearlyStore = useNearPocketStore;

export { randomLast4 };
