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

export function GoogleLoginButton({ onDone }: { onDone?: () => void }) {
  const t = useT();
  const connectWallet = useNearPocketStore((s) => s.connectWallet);
  const { ready, authenticated, user, logout } = usePrivy();
  const { createWallet } = useCreateWallet();
  const creating = useRef(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const { initOAuth, state } = useLoginWithOAuth({
    onComplete: () => {
      /* handled by authenticated effect */
    },
    onError: (error) => {
      const msg = typeof error === "string" ? error : (error as Error)?.message || String(error);
      setErr(msg);
      setBusy(false);
    },
  });

  useEffect(() => {
    if (!authenticated || !user) return;
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
            // Fall back to a display id from Google email — still signed in via Privy
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
          connectWallet(addr, "privy");
          onDone?.();
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
    try {
      if (authenticated) {
        // Already in Privy session — sync account into NearPocket
        return;
      }
      await initOAuth({ provider: "google" });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Google login failed");
      setBusy(false);
    }
  }

  const loading = busy || state.status === "loading" || !ready;

  return (
    <div className="space-y-2">
      <button
        type="button"
        className="btn-outline w-full"
        disabled={loading}
        onClick={onClick}
      >
        <Globe className="h-5 w-5" />
        {loading ? "…" : t("auth.google")}
      </button>
      <p className="text-center text-xs text-warm-500">{t("auth.googleHint")}</p>
      {err && <p className="text-xs text-[#8a2d1c]">{err}</p>}
      {authenticated && (
        <button
          type="button"
          className="text-xs text-warm-600 underline"
          onClick={() => logout()}
        >
          Privy sign out
        </button>
      )}
    </div>
  );
}
