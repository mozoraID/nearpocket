"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useNearPocketStore } from "@/lib/store";
import { BRAND } from "@/config/brand";

function Splash({ detail }: { detail: string }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-cream-200 text-ink">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-ink text-sm font-bold text-cream-100">
        NP
      </span>
      <p className="text-sm font-medium">{BRAND.displayName}</p>
      <p className="text-xs text-warm-500">{detail}</p>
    </div>
  );
}

/**
 * Hold wallet routes until zustand persist (and a short settle) is ready.
 * Unauthenticated → /login?next= only — never marketing /.
 * During / just-after sign-out (suppress-restore), hold splash so we do not
 * race the hard navigation to landing.
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const accountId = useNearPocketStore((s) => s.accountId);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [suppress, setSuppress] = useState(false);

  useEffect(() => {
    const finish = () => setReady(true);
    const unsub = useNearPocketStore.persist.onFinishHydration(finish);
    if (useNearPocketStore.persist.hasHydrated()) finish();
    // Safety net if persist hangs
    const t = window.setTimeout(finish, 2500);
    return () => {
      unsub();
      window.clearTimeout(t);
    };
  }, []);

  useEffect(() => {
    try {
      setSuppress(sessionStorage.getItem("nearpocket-suppress-restore") === "1");
    } catch {
      setSuppress(false);
    }
  }, [accountId, ready]);

  useEffect(() => {
    if (!ready) return;
    if (accountId) return;
    // Sign-out in flight: do not bounce to /login — SignOut hard-navs to /
    if (suppress) return;
    const qs = searchParams?.toString();
    const next = pathname + (qs ? `?${qs}` : "");
    router.replace(`/login?next=${encodeURIComponent(next || "/home")}`);
  }, [ready, accountId, pathname, searchParams, router, suppress]);

  if (!ready) return <Splash detail="Loading wallet…" />;
  if (!accountId && suppress) return <Splash detail="Signing out…" />;
  if (!accountId) return <Splash detail="Redirecting to sign in…" />;
  return <>{children}</>;
}
