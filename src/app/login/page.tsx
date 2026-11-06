import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginPanel } from "@/components/LoginPanel";
import { BRAND } from "@/config/brand";

export const metadata: Metadata = {
  title: `Sign in · ${BRAND.displayName}`,
  description: `Sign in to ${BRAND.displayName} — create a wallet, connect NEAR, Google, or try the demo.`,
};

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center bg-cream-200 text-sm text-warm-600">
          Loading…
        </div>
      }
    >
      <LoginPanel />
    </Suspense>
  );
}
