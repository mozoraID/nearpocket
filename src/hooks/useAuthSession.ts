"use client";

import { useEffect, useState } from "react";
import { useNearPocketStore } from "@/lib/store";

export type AuthPhase = "loading" | "signed_out" | "signed_in";

/**
 * Single source of truth for marketing/wallet chrome.
 * `loading` until zustand persist has hydrated — UI must not flip CTAs before that.
 */
export function useAuthSession(): {
  phase: AuthPhase;
  ready: boolean;
  accountId: string | null;
  demoMode: boolean;
  authMethod: string;
  isSignedIn: boolean;
  isDemo: boolean;
} {
  const accountId = useNearPocketStore((s) => s.accountId);
  const demoMode = useNearPocketStore((s) => s.demoMode);
  const authMethod = useNearPocketStore((s) => s.authMethod);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      // Sign-out sets this flag before the persisted account is guaranteed gone.
      // Drop a stale account before the CTA leaves the placeholder, so the
      // header cannot paint "Open app" and then flip to "Sign in".
      try {
        const suppress =
          sessionStorage.getItem("nearpocket-suppress-restore") === "1" ||
          sessionStorage.getItem("nearpocket-signing-out") === "1";
        if (suppress && useNearPocketStore.getState().accountId) {
          useNearPocketStore.getState().disconnect();
        }
      } catch { /* */ }
      setReady(true);
    };
    const unsub = useNearPocketStore.persist.onFinishHydration(finish);
    if (useNearPocketStore.persist.hasHydrated()) finish();
    // Safety: never leave UI stuck loading if persist hangs
    const t = window.setTimeout(finish, 2500);
    return () => {
      unsub();
      window.clearTimeout(t);
    };
  }, []);

  const hasAccount = Boolean(accountId);
  const phase: AuthPhase = !ready ? "loading" : hasAccount ? "signed_in" : "signed_out";

  return {
    phase,
    ready,
    accountId,
    demoMode,
    authMethod,
    isSignedIn: ready && hasAccount && !demoMode,
    isDemo: ready && hasAccount && demoMode,
  };
}
