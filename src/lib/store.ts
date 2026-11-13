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
import type { DisplayCurrencyCode } from "./region/display-currency";
import { demoWaitlistFor } from "./region/demo-seed";
import {
  validateDeliveryAddress,
  type AddressDraft,
  type AddressIssue,
  type DeliveryAddress,
} from "./address";

/** Sample pending agent approval so Home matches the landing carousel (demo-labeled). */
export const DEMO_WAITLIST_ITEM: WaitlistItem = {
  id: "demo_earbuds_ok",
  title: "Wireless earbuds",
  merchant: "Tokopedia",
  category: "electronics",
  targetPriceUsdc: 20,
  currentPriceUsdc: 18.5,
  maxBudgetUsdc: 20,
  status: "awaiting_approval",
  marketplace: "Tokopedia",
  mocked: true,
  agentReason: "Demo sample — approve or reject. Labeled demo.",
  notes: "demo",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

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
  /** Set only when this activity row is a transaction this action sent. */
  txHash?: string;
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
  /** ISO display fiat for ≈ lines + Settings (USDC remains ledger) */
  displayCurrency: DisplayCurrencyCode;
  /** Delivery profiles. One default is reused across marketplaces. */
  addresses: DeliveryAddress[];
  setDisplayCurrency: (c: DisplayCurrencyCode) => void;
  saveAddress: (
    draft: AddressDraft & { id?: string; isDefault?: boolean },
  ) => { ok: true; address: DeliveryAddress } | { ok: false; issues: AddressIssue[] };
  removeAddress: (id: string) => void;
  setDefaultAddress: (id: string) => void;
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
  /** Seed one demo pending approval when waitlist is empty (fresh/demo accounts). */
  ensureDemoWaitlist: () => void;
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
      displayCurrency: "USD",
      addresses: [],
      setDisplayCurrency: (c) => {
        set({ displayCurrency: c });
        // Refresh demo approval flavor when switching region (demo-only seed)
        const wl = get().waitlist;
        const demoIdx = wl.findIndex((w) => w.notes === "demo" || w.id.startsWith("demo_"));
        if (demoIdx >= 0) {
          const seeded = demoWaitlistFor(c);
          const next = [...wl];
          next[demoIdx] = { ...seeded, id: wl[demoIdx].id, createdAt: wl[demoIdx].createdAt };
          set({ waitlist: next });
        }
      },
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
      connectDemo: () => {
        const ccy = get().displayCurrency || "USD";
        const seed = demoWaitlistFor(ccy);
        set({
          accountId: DEMO_ACCOUNT.accountId,
          demoMode: true,
          authMethod: "demo",
          balanceUsdc: get().balanceUsdc || DEMO_ACCOUNT.displayBalanceUsdc,
          waitlist:
            get().waitlist.length > 0
              ? get().waitlist
              : [seed],
        });
      },
      connectWallet: (accountId, method = "selector") =>
        set({
          accountId,
          demoMode: false,
          authMethod: method,
          waitlist: get().waitlist.filter((w) => w.notes !== "demo" && !w.id.startsWith("demo_")),
        }),
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
      ensureDemoWaitlist: () => {
        if (!get().demoMode) return;
        if (get().waitlist.some((w) => w.status === "awaiting_approval")) return;
        if (get().waitlist.some((w) => w.notes === "demo" || w.id.startsWith("demo_"))) return;
        const seed = demoWaitlistFor(get().displayCurrency || "USD");
        set({
          waitlist: [seed, ...get().waitlist].slice(0, 50),
        });
      },
      saveAddress: (draft) => {
        const parsed = validateDeliveryAddress(draft);
        if (!parsed.ok) return parsed;
        const list = get().addresses;
        const id =
          draft.id ||
          `addr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
        const others = list.filter((a) => a.id !== id);
        const previous = list.find((a) => a.id === id);
        let isDefault: boolean;
        if (others.length === 0) isDefault = true;
        else if (draft.isDefault === true) isDefault = true;
        else if (draft.isDefault === false) isDefault = false;
        else if (previous) isDefault = previous.isDefault;
        else isDefault = !others.some((a) => a.isDefault);
        const address: DeliveryAddress = { ...parsed.value, id, isDefault };
        const next = isDefault
          ? [address, ...others.map((a) => ({ ...a, isDefault: false }))]
          : [...others, address];
        if (!next.some((a) => a.isDefault) && next[0]) next[0] = { ...next[0], isDefault: true };
        set({ addresses: next });
        return { ok: true, address };
      },
      removeAddress: (id) => {
        const next = get().addresses.filter((a) => a.id !== id);
        if (next.length && !next.some((a) => a.isDefault)) next[0] = { ...next[0], isDefault: true };
        set({ addresses: next });
      },
      setDefaultAddress: (id) => {
        if (!get().addresses.some((a) => a.id === id)) return;
        set({
          addresses: get().addresses.map((a) => ({ ...a, isDefault: a.id === id })),
        });
      },
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
        displayCurrency: s.displayCurrency,
        addresses: s.addresses,
      }),
    },
  ),
);

/** @deprecated alias — prefer useNearPocketStore */
export const useNearlyStore = useNearPocketStore;

export { randomLast4 };
