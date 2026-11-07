"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useNearPocketStore } from "@/lib/store";
import { BrandSplash } from "./BrandSplash";

function isSigningOutNow(): boolean {
  try {
    if (sessionStorage.getItem("nearpocket-signing-out") !== "1") return false;
    const started = Number(sessionStorage.getItem("nearpocket-signing-out-at") || "0");
    // Only hold the gate for a few seconds while hard-nav to / completes
    if (started && Date.now() - started > 4000) {
      sessionStorage.removeItem("nearpocket-signing-out");
      sessionStorage.removeItem("nearpocket-signing-out-at");
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Hold wallet routes until zustand persist is ready.
 * Unauthenticated → /login?next= only — never marketing /.
 * During the brief sign-out hard-nav window, hold splash (do not bounce to /login).
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const accountId = useNearPocketStore((s) => s.accountId);
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    const finish = () => setReady(true);
    const unsub = useNearPocketStore.persist.onFinishHydration(finish);
    if (useNearPocketStore.persist.hasHydrated()) finish();
    const t = window.setTimeout(finish, 2500);
    return () => {
      unsub();
      window.clearTimeout(t);
    };
  }, []);

  useEffect(() => {
    setSigningOut(isSigningOutNow());
  }, [accountId, ready]);

  useEffect(() => {
    if (!ready) return;
    if (accountId) return;
    if (signingOut) return;
    const qs = window.location.search.replace(/^\?/, "");
    const next = pathname + (qs ? `?${qs}` : "");
    router.replace(`/login?next=${encodeURIComponent(next || "/home")}`);
  }, [ready, accountId, pathname, router, signingOut]);

  if (!ready) return <BrandSplash detail="Loading wallet…" />;
  if (!accountId && signingOut) return <BrandSplash detail="Signing out…" />;
  if (!accountId) return <BrandSplash detail="Redirecting to sign in…" />;
  return <>{children}</>;
}
