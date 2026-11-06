"use client";

import { useState } from "react";
import { LogOut } from "lucide-react";
import { usePrivy } from "@privy-io/react-auth";
import { useT } from "@/lib/i18n";
import { fullSignOut } from "@/lib/auth/sign-out";
import { PRIVY_APP_ID } from "./PrivyClientProvider";

function SignOutButtonInner({ privyLogout }: { privyLogout?: () => Promise<void> }) {
  const t = useT();
  const [busy, setBusy] = useState(false);

  async function onClick() {
    setBusy(true);
    try {
      sessionStorage.setItem("nearpocket-suppress-restore", "1");
    } catch { /* */ }
    try {
      await fullSignOut({ privyLogout });
    } finally {
      window.location.assign("/");
    }
  }

  return (
    <button type="button" className="btn-secondary w-full" disabled={busy} onClick={onClick}>
      <LogOut className="h-4 w-4" /> {busy ? "Signing out…" : t("auth.signOutSwitch")}
    </button>
  );
}

function SignOutWithPrivy() {
  const { logout } = usePrivy();
  return (
    <SignOutButtonInner
      privyLogout={async () => {
        await logout();
      }}
    />
  );
}

export function SignOutButton() {
  // usePrivy requires PrivyProvider — only mount the hook branch when App ID is set
  if (PRIVY_APP_ID) return <SignOutWithPrivy />;
  return <SignOutButtonInner />;
}
