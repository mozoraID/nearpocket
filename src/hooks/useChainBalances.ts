"use client";

import { useCallback, useEffect, useState } from "react";
import { useNearPocketStore } from "@/lib/store";
import { fetchWalletBalances, type WalletBalances } from "@/lib/near/escrow-actions";

export function useChainBalances() {
  const accountId = useNearPocketStore((s) => s.accountId);
  const demoMode = useNearPocketStore((s) => s.demoMode);
  const [balances, setBalances] = useState<WalletBalances | null>(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const real = Boolean(accountId && accountId !== "demo.local" && !demoMode);

  const refresh = useCallback(async () => {
    if (!real || !accountId) {
      setBalances(null);
      setLoaded(false);
      return;
    }
    setLoading(true);
    const next = await fetchWalletBalances(accountId);
    setBalances(next);
    setLoaded(true);
    setLoading(false);
  }, [accountId, real]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const onRefresh = () => {
      void refresh();
    };
    window.addEventListener("nearpocket-balances-refresh", onRefresh);
    return () => window.removeEventListener("nearpocket-balances-refresh", onRefresh);
  }, [refresh]);

  return { balances, loading, loaded, real, refresh };
}
