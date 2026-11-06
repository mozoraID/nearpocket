"use client";

import { useEffect, useRef, useState } from "react";
import { Globe } from "lucide-react";
import { usePrivy, useLoginWithOAuth } from "@privy-io/react-auth";
import { useCreateWallet } from "@privy-io/react-auth/extended-chains";
import { useNearPocketStore } from "@/lib/store";
import { useT } from "@/lib/i18n";

function nearAddressFromUser(user: {
  linkedAccounts?: Array<{ type?: string; chainType?: string; address?: string }>;
  email?: { address?: string } | null;
  google?: { email?: string } | null;
  id?: string;
}): string | null {
  const near = user.linkedAccounts?.find(
    (a) => a.type === "wallet" && a.chainType === "near" && a.address,
  );
  if (near?.address) return near.address;
  return null;
}

/**
 * Google via Privy. Only writes into the NearPocket store / calls onDone after the
 * user explicitly clicks this button — never on mount from a leftover Privy cookie.
 */
export function GoogleLoginButton({ onDone }: { onDone?: () => void }) {
  const t = useT();
  const connectWallet = useNearPocketStore((s) => s.connectWallet);
  const { ready, authenticated, user } = usePrivy();
  const { createWallet } = useCreateWallet();
  const creating = useRef(false);
  const userClicked = useRef(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const { initOAuth, state } = useLoginWithOAuth({
    onComplete: () => {
      /* handled by authenticated effect after userClicked */
    },
    onError: (error) => {
      const msg = typeof error === "string" ? error : (error as Error)?.message || String(error);
      setErr(msg);
      setBusy(false);
      userClicked.current = false;
    },
  });

  useEffect(() => {
    if (!authenticated || !user) return;
    if (!userClicked.current) return; // critical: no silent re-login
    let cancelled = false;
    (async () => {
      try {
        let addr = nearAddressFromUser(user as never);
        if (!addr && !creating.current) {
          creating.current = true;
          try {
            const out = await createWallet({ chainType: "near" });
            addr =
              (out as { wallet?: { address?: string } })?.wallet?.address ||
              nearAddressFromUser((out as { user?: typeof user }).user || user);
          } catch (e) {
            const email =
              (user as { google?: { email?: string }; email?: { address?: string } }).google
                ?.email ||
              (user as { email?: { address?: string } }).email?.address;
            addr = email ? `privy:${email}` : `privy:${user.id}`;
            setErr(
              e instanceof Error
                ? `Google OK; NEAR wallet: ${e.message}`
                : "Google OK; NEAR wallet create skipped",
            );
          } finally {
            creating.current = false;
          }
        }
        if (!cancelled && addr) {
          try {
            sessionStorage.removeItem("nearpocket-suppress-restore");
          } catch { /* */ }
          connectWallet(addr, "privy");
          onDone?.();
          userClicked.current = false;
        }
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authenticated, user, createWallet, connectWallet, onDone]);

  async function onClick() {
    setErr(null);
    setBusy(true);
    userClicked.current = true;
    try {
      try {
        sessionStorage.removeItem("nearpocket-suppress-restore");
      } catch { /* */ }
      if (authenticated && user) {
        // Already in Privy — treat click as explicit continue
        let addr = nearAddressFromUser(user as never);
        if (!addr) {
          const email =
            (user as { google?: { email?: string }; email?: { address?: string } }).google?.email ||
            (user as { email?: { address?: string } }).email?.address;
          addr = email ? `privy:${email}` : `privy:${user.id}`;
        }
        connectWallet(addr, "privy");
        onDone?.();
        userClicked.current = false;
        setBusy(false);
        return;
      }
      await initOAuth({ provider: "google" });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Google login failed");
      setBusy(false);
      userClicked.current = false;
    }
  }

  const loading = busy || state.status === "loading" || !ready;

  return (
    <div className="space-y-2">
      <button type="button" className="btn-outline w-full" disabled={loading} onClick={onClick}>
        <Globe className="h-5 w-5" />
        {loading ? "…" : t("auth.google")}
      </button>
      <p className="text-center text-xs text-warm-500">{t("auth.googleHint")}</p>
      {err && <p className="text-xs text-[#8a2d1c]">{err}</p>}
    </div>
  );
}
