"use client";

import { useCallback, useEffect, useState } from "react";
import { useNearPocketStore } from "@/lib/store";
import { itemFromChainRequest } from "@/lib/near/approval-state";
import { loadWalletBalances, readCachedBalances, type WalletBalances } from "@/lib/near/escrow-actions";

export function useChainBalances() {
  const accountId = useNearPocketStore((s) => s.accountId);
  const demoMode = useNearPocketStore((s) => s.demoMode);
  const [balances, setBalances] = useState<WalletBalances | null>(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [tick, setTick] = useState(0);
  const real = Boolean(accountId && accountId !== "demo.local" && !demoMode);

  const refresh = useCallback(async () => {
    if (!real || !accountId) {
      setBalances(null);
      setLoaded(false);
      return null;
    }
    setLoading(true);
    const next = await loadWalletBalances(accountId, { fresh: true });
    if (next) setBalances(next);
    setLoaded(true);
    setLoading(false);
    return next;
  }, [accountId, real]);

  useEffect(() => {
    if (!real || !accountId) {
      setBalances(null);
      setLoaded(false);
      return;
    }
    const cached = readCachedBalances(accountId);
    if (cached) {
      setBalances(cached);
      setLoaded(true);
    }
    let cancel = false;
    setLoading(true);
    void loadWalletBalances(accountId, { fresh: tick > 0 }).then((next) => {
      if (cancel) return;
      if (next) setBalances(next);
      setLoaded(true);
      setLoading(false);
    });
    return () => {
      cancel = true;
    };
  }, [accountId, real, tick]);

  useEffect(() => {
    const onRefresh = () => setTick((n) => n + 1);
    window.addEventListener("nearpocket-balances-refresh", onRefresh);
    return () => window.removeEventListener("nearpocket-balances-refresh", onRefresh);
  }, []);

  useEffect(() => {
    if (!real || !balances?.requestsLoaded || !balances.requests) return;
    const st = useNearPocketStore.getState();
    for (const req of balances.requests) {
      const local = st.waitlist.find((item) => item.id === req.id);
      if (req.status === "awaiting_approval") {
        if (!local) {
          st.addWaitlist(itemFromChainRequest(req));
        } else if (
          local.status !== "awaiting_approval" ||
          Math.abs(local.currentPriceUsdc - req.amountUsdc) > 1e-6 ||
          (req.title && local.title !== req.title)
        ) {
          st.updateWaitlist(req.id, {
            status: "awaiting_approval",
            currentPriceUsdc: req.amountUsdc,
            title: req.title || local.title,
            category: req.category || local.category,
          });
        }
        continue;
      }
      if (!local) continue;
      const nextStatus =
        req.status === "purchased" || req.status === "rejected" || req.status === "expired"
          ? req.status
          : req.status === "failed"
            ? "ready"
            : null;
      if (nextStatus && local.status !== nextStatus) st.updateWaitlist(req.id, { status: nextStatus });
    }
  }, [real, balances]);

  return { balances, loading, loaded, real, refresh, stale: Boolean(balances?.stale) };
}
