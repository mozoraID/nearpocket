"use client";

import { useEffect, useState } from "react";
import { useNearlyStore } from "@/lib/store";
import { NEAR_CONFIG } from "@/lib/near/config";

/**
 * Wallet connect:
 * - Demo mode always works (zero secrets)
 * - MyNearWallet via wallet-selector when possible, else redirect login URL
 */
export function WalletButton() {
  const accountId = useNearlyStore((s) => s.accountId);
  const demoMode = useNearlyStore((s) => s.demoMode);
  const connectDemo = useNearlyStore((s) => s.connectDemo);
  const connectWallet = useNearlyStore((s) => s.connectWallet);
  const disconnect = useNearlyStore((s) => s.disconnect);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const acc = params.get("account_id");
    if (acc && (acc.endsWith(".testnet") || acc.endsWith(".near"))) {
      connectWallet(acc);
      const url = new URL(window.location.href);
      ["account_id", "public_key", "all_keys"].forEach((k) =>
        url.searchParams.delete(k),
      );
      window.history.replaceState({}, "", url.pathname + url.search);
    }
  }, [connectWallet]);

  function connectMyNearRedirect() {
    const success = encodeURIComponent(window.location.href.split("?")[0]);
    window.location.href = `${NEAR_CONFIG.walletUrl}/login/?success_url=${success}&failure_url=${success}`;
  }

  async function connectMyNear() {
    setBusy(true);
    try {
      const { setupWalletSelector } = await import("@near-wallet-selector/core");
      const { setupMyNearWallet } = await import(
        "@near-wallet-selector/my-near-wallet"
      );
      const selector = await setupWalletSelector({
        network: NEAR_CONFIG.networkId,
        modules: [
          setupMyNearWallet({
            walletUrl: NEAR_CONFIG.walletUrl,
          }),
        ],
      });
      const wallet = await selector.wallet("my-near-wallet");
      // Cast: browser wallet signIn only needs contractId
      const accounts = await (
        wallet.signIn as (params: {
          contractId?: string;
          methodNames?: string[];
        }) => Promise<Array<{ accountId: string }>>
      )({
        contractId: NEAR_CONFIG.agentPolicyContract || undefined,
      });
      const id = accounts?.[0]?.accountId;
      if (id) connectWallet(id);
      else connectMyNearRedirect();
    } catch {
      connectMyNearRedirect();
    } finally {
      setBusy(false);
    }
  }

  if (accountId) {
    return (
      <div className="flex items-center gap-2">
        <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-right">
          <p className="text-[10px] uppercase text-slate-400">
            NEAR {NEAR_CONFIG.networkId}
            {demoMode ? " · demo" : ""}
          </p>
          <p className="max-w-[9rem] truncate text-xs font-medium text-cyan-200">
            {accountId}
          </p>
        </div>
        <button
          type="button"
          className="btn-ghost !px-2 !py-2 !text-xs"
          onClick={disconnect}
        >
          Out
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        className="btn-primary !py-2 !text-xs"
        disabled={busy}
        onClick={connectMyNear}
      >
        MyNearWallet
      </button>
      <button
        type="button"
        className="btn-ghost !py-1.5 !text-[10px]"
        onClick={connectDemo}
      >
        Demo account
      </button>
    </div>
  );
}
