"use client";

import { useEffect, useState } from "react";
import { useNearlyStore } from "@/lib/store";
import { NEAR_CONFIG } from "@/lib/near/config";

/**
 * Wallet connect via NEAR wallet-selector.
 * Primary: Meteor Wallet. Also HOT / Intear / NEAR Mobile when modules load.
 * Demo account always available (zero secrets).
 * MyNearWallet removed (limited mode).
 */
export function WalletButton() {
  const accountId = useNearlyStore((s) => s.accountId);
  const demoMode = useNearlyStore((s) => s.demoMode);
  const connectDemo = useNearlyStore((s) => s.connectDemo);
  const connectWallet = useNearlyStore((s) => s.connectWallet);
  const disconnect = useNearlyStore((s) => s.disconnect);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  async function connectWithSelector() {
    setBusy(true);
    setError(null);
    try {
      const { setupWalletSelector } = await import("@near-wallet-selector/core");
      const { setupModal } = await import("@near-wallet-selector/modal-ui");
      await import("@near-wallet-selector/modal-ui/styles.css");

      const { setupMeteorWallet } = await import(
        "@near-wallet-selector/meteor-wallet"
      );

      const modules = [setupMeteorWallet()];

      try {
        const { setupHotWallet } = await import(
          "@near-wallet-selector/hot-wallet"
        );
        modules.push(setupHotWallet());
      } catch {
        /* optional */
      }
      try {
        const { setupIntearWallet } = await import(
          "@near-wallet-selector/intear-wallet"
        );
        modules.push(setupIntearWallet());
      } catch {
        /* optional */
      }
      try {
        const { setupNearMobileWallet } = await import(
          "@near-wallet-selector/near-mobile-wallet"
        );
        modules.push(setupNearMobileWallet());
      } catch {
        /* optional */
      }

      const selector = await setupWalletSelector({
        network: NEAR_CONFIG.networkId,
        modules,
      });

      const modal = setupModal(selector, {
        contractId: NEAR_CONFIG.agentPolicyContract || "near",
        methodNames: [
          "set_policy",
          "queue_item",
          "request_spend",
          "approve_spend",
          "reject_spend",
          "upsert_plan",
        ],
        theme: "dark",
        description: "NearPocket — NEAR pocket for real-world money",
      });

      modal.show();

      const sub = selector.on("signedIn", ({ accounts }) => {
        const id = accounts?.[0]?.accountId;
        if (id) connectWallet(id);
        modal.hide();
        sub.remove();
      });

      // If already signed in (cached)
      if (selector.isSignedIn()) {
        const wallet = await selector.wallet();
        const accounts = await wallet.getAccounts();
        const id = accounts?.[0]?.accountId;
        if (id) connectWallet(id);
        modal.hide();
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Wallet connect failed";
      setError(msg);
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
        onClick={connectWithSelector}
      >
        {busy ? "Opening…" : "Meteor Wallet"}
      </button>
      <button
        type="button"
        className="btn-ghost !py-1.5 !text-[10px]"
        onClick={connectDemo}
      >
        Demo account
      </button>
      {error ? (
        <p className="max-w-[11rem] text-[10px] text-rose-300">{error}</p>
      ) : null}
    </div>
  );
}
