"use client";

import { clearLocalWallet } from "@/lib/wallet/local";
import { useNearPocketStore } from "@/lib/store";

const LAST_METHOD_KEY = "nearpocket-last-auth";

function scrubStorage() {
  if (typeof window === "undefined") return;
  const keys: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      // Wallet-selector + near connection caches
      if (
        k.startsWith("near-wallet-selector") ||
        k.startsWith("near_app") ||
        k.includes("meteor") ||
        k === LAST_METHOD_KEY
      ) {
        keys.push(k);
      }
    }
  } catch { /* */ }
  for (const k of keys) {
    try { localStorage.removeItem(k); } catch { /* */ }
  }
  try { localStorage.removeItem(LAST_METHOD_KEY); } catch { /* */ }
}

/**
 * Fully clear NearPocket + provider sessions so the user cannot be auto-restored.
 * Call from UI after awaiting this; then hard-navigate to /.
 */
export async function fullSignOut(opts?: {
  privyLogout?: () => Promise<void> | void;
}): Promise<void> {
  // Mark suppress + short-lived signing-out BEFORE mutating store
  try {
    sessionStorage.setItem("nearpocket-suppress-restore", "1");
    sessionStorage.setItem("nearpocket-signing-out", "1");
    sessionStorage.setItem("nearpocket-signing-out-at", String(Date.now()));
  } catch { /* */ }

  // 1) Local encrypted wallet
  try {
    clearLocalWallet();
  } catch { /* ignore */ }

  // 2) Wallet selector sessions (Meteor / HOT / …)
  try {
    const { setupWalletSelector } = await import("@near-wallet-selector/core");
    const { setupMeteorWallet } = await import("@near-wallet-selector/meteor-wallet");
    const modules = [setupMeteorWallet()];
    try {
      const { setupHotWallet } = await import("@near-wallet-selector/hot-wallet");
      modules.push(setupHotWallet());
    } catch { /* */ }
    try {
      const { setupIntearWallet } = await import("@near-wallet-selector/intear-wallet");
      modules.push(setupIntearWallet());
    } catch { /* */ }
    try {
      const { setupNearMobileWallet } = await import("@near-wallet-selector/near-mobile-wallet");
      modules.push(setupNearMobileWallet());
    } catch { /* */ }
    const { NEAR_CONFIG } = await import("@/lib/near/config");
    const selector = await setupWalletSelector({ network: NEAR_CONFIG.networkId, modules });
    if (selector.isSignedIn()) {
      const wallet = await selector.wallet();
      await wallet.signOut();
    }
  } catch { /* selector may be unavailable */ }

  // 3) Privy — must await so cookie/session is gone before next page load
  try {
    await opts?.privyLogout?.();
  } catch { /* ignore */ }

  // 4) Scrub selector / last-method caches
  scrubStorage();

  // 5) App store — signed-out defaults
  useNearPocketStore.getState().disconnect();
  useNearPocketStore.setState({
    accountId: null,
    demoMode: true,
    authMethod: "demo",
  });
}
