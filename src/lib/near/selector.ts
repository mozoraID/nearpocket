"use client";

import { NEAR_CONFIG } from "./config";

export interface SelectorWallet {
  id?: string;
  metadata?: { name?: string };
  signDelegateActions?: (params: {
    transactions: { signerId?: string; receiverId: string; actions: unknown[] }[];
  }) => Promise<unknown>;
  signDelegateAction?: (delegateAction: unknown) => Promise<unknown>;
  signAndSendTransaction?: (params: {
    signerId?: string;
    receiverId: string;
    actions: unknown[];
  }) => Promise<unknown>;
  getAccounts?: () => Promise<{ accountId: string; publicKey?: string }[]>;
  getPublicKey?: () => Promise<{ toString?: () => string } | string>;
}

/** Meteor, HOT, Intear, and NEAR Mobile — the same set as the login screen. */
export async function getSignedInWallet(): Promise<SelectorWallet | null> {
  const { setupWalletSelector } = await import("@near-wallet-selector/core");
  const { setupMeteorWallet } = await import("@near-wallet-selector/meteor-wallet");
  const modules = [setupMeteorWallet()];
  try {
    const { setupHotWallet } = await import("@near-wallet-selector/hot-wallet");
    modules.push(setupHotWallet());
  } catch {
    /* optional wallet */
  }
  try {
    const { setupIntearWallet } = await import("@near-wallet-selector/intear-wallet");
    modules.push(setupIntearWallet());
  } catch {
    /* optional wallet */
  }
  try {
    const { setupNearMobileWallet } = await import("@near-wallet-selector/near-mobile-wallet");
    modules.push(setupNearMobileWallet());
  } catch {
    /* optional wallet */
  }
  const selector = await setupWalletSelector({
    network: NEAR_CONFIG.networkId,
    modules,
  });
  if (!selector.isSignedIn()) return null;
  return (await selector.wallet()) as SelectorWallet;
}
