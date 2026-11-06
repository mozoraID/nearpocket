"use client";

import { useEffect, useState } from "react";
import { Wallet, LogOut, Sparkles } from "lucide-react";
import { useNearPocketStore } from "@/lib/store";
import { NEAR_CONFIG, explorerAccountUrl } from "@/lib/near/config";
import { Sheet } from "./Sheet";

/**
 * Wallet sign-in via NEAR wallet-selector (Meteor primary; HOT, Intear, NEAR Mobile).
 * "Try demo" keeps a zero-secret demo account. MyNearWallet removed (limited mode).
 */
export function WalletButton() {
  const accountId = useNearPocketStore((s) => s.accountId);
  const demoMode = useNearPocketStore((s) => s.demoMode);
  const connectDemo = useNearPocketStore((s) => s.connectDemo);
  const connectWallet = useNearPocketStore((s) => s.connectWallet);
  const disconnect = useNearPocketStore((s) => s.disconnect);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const acc = params.get("account_id");
    if (acc && (acc.endsWith(".testnet") || acc.endsWith(".near"))) {
      connectWallet(acc);
      const url = new URL(window.location.href);
      ["account_id", "public_key", "all_keys"].forEach((k) => url.searchParams.delete(k));
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
      const { setupMeteorWallet } = await import("@near-wallet-selector/meteor-wallet");
      const modules = [setupMeteorWallet()];
      try {
        const { setupHotWallet } = await import("@near-wallet-selector/hot-wallet");
        modules.push(setupHotWallet());
      } catch {}
      try {
        const { setupIntearWallet } = await import("@near-wallet-selector/intear-wallet");
        modules.push(setupIntearWallet());
      } catch {}
      try {
        const { setupNearMobileWallet } = await import("@near-wallet-selector/near-mobile-wallet");
        modules.push(setupNearMobileWallet());
      } catch {}

      const selector = await setupWalletSelector({ network: NEAR_CONFIG.networkId, modules });
      const modal = setupModal(selector, {
        contractId: NEAR_CONFIG.agentPolicyContract || "near",
        methodNames: ["set_policy", "queue_item", "request_spend", "approve_spend", "reject_spend", "upsert_plan"],
        theme: "light",
        description: "NearPocket — NEAR pocket for real-world money",
      });
      setOpen(false);
      modal.show();
      const sub = selector.on("signedIn", ({ accounts }) => {
        const id = accounts?.[0]?.accountId;
        if (id) connectWallet(id);
        modal.hide();
        sub.remove();
      });
      if (selector.isSignedIn()) {
        const wallet = await selector.wallet();
        const accounts = await wallet.getAccounts();
        const id = accounts?.[0]?.accountId;
        if (id) connectWallet(id);
        modal.hide();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Wallet connect failed");
    } finally {
      setBusy(false);
    }
  }

  const signedIn = accountId && !demoMode;

  return (
    <>
      {signedIn ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex h-10 max-w-[11rem] items-center gap-2 rounded-full bg-cream-100 pl-1.5 pr-3 text-sm font-medium ring-1 ring-cream-300"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-ink text-[11px] font-bold text-cream-100">
            {accountId!.slice(0, 1).toUpperCase()}
          </span>
          <span className="truncate">{accountId}</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex h-10 items-center gap-2 rounded-full bg-ink px-4 text-sm font-semibold text-cream-100"
        >
          <Wallet className="h-4 w-4" />
          Sign in
        </button>
      )}

      <Sheet open={open} onClose={() => setOpen(false)} title={signedIn ? "Your wallet" : "Sign in"}>
        {signedIn ? (
          <div className="space-y-4">
            <div className="rounded-2xl bg-cream-200 p-4">
              <p className="text-xs text-warm-600">Connected · NEAR {NEAR_CONFIG.networkId}</p>
              <p className="mt-1 break-all font-semibold">{accountId}</p>
              <a
                className="mt-2 inline-block text-sm underline"
                href={explorerAccountUrl(accountId!)}
                target="_blank"
                rel="noreferrer"
              >
                View on explorer
              </a>
            </div>
            <button
              type="button"
              className="btn-secondary w-full"
              onClick={() => {
                disconnect();
                connectDemo();
                setOpen(false);
              }}
            >
              <LogOut className="h-4 w-4" /> Sign out
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-warm-600">
              Use your NEAR wallet. NearPocket never sees your seed phrase.
            </p>
            <button type="button" className="btn-primary w-full" disabled={busy} onClick={connectWithSelector}>
              <Wallet className="h-5 w-5" />
              {busy ? "Opening…" : "Connect NEAR wallet"}
            </button>
            <p className="text-center text-xs text-warm-500">Meteor · HOT · Intear · NEAR Mobile</p>
            <button
              type="button"
              className="btn-secondary w-full"
              onClick={() => {
                connectDemo();
                setOpen(false);
              }}
            >
              <Sparkles className="h-4 w-4" /> Try demo
            </button>
            {accountId && demoMode ? (
              <p className="text-center text-xs text-warm-500">You are using the demo account.</p>
            ) : null}
            {error ? <p className="text-sm text-[#8a2d1c]">{error}</p> : null}
          </div>
        )}
      </Sheet>
    </>
  );
}
