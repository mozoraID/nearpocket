"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useNearPocketStore } from "@/lib/store";

/** Redirect to /login when there is no wallet/demo session yet. */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const accountId = useNearPocketStore((s) => s.accountId);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const unsub = useNearPocketStore.persist.onFinishHydration(() => setHydrated(true));
    if (useNearPocketStore.persist.hasHydrated()) setHydrated(true);
    return unsub;
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (accountId) return;
    const qs = searchParams?.toString();
    const next = pathname + (qs ? `?${qs}` : "");
    router.replace(`/login?next=${encodeURIComponent(next || "/home")}`);
  }, [hydrated, accountId, pathname, searchParams, router]);

  if (!hydrated) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-cream-200 text-sm text-warm-600">
        Loading…
      </div>
    );
  }
  if (!accountId) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-cream-200 text-sm text-warm-600">
        Redirecting to sign in…
      </div>
    );
  }
  return <>{children}</>;
}
