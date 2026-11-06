"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wallet, LogOut, Copy, KeyRound, Settings } from "lucide-react";
import { useNearPocketStore } from "@/lib/store";
import { NEAR_CONFIG, explorerAccountUrl } from "@/lib/near/config";
import { useT } from "@/lib/i18n";
import { Sheet } from "./Sheet";
import { loadLocalWalletRecord, requestTestnetFaucet, unlockSecretKey } from "@/lib/wallet/local";
import {
  accountInitials,
  avatarHue,
  shortAccountLabel,
  authMethodLabel,
} from "@/lib/account-label";
import { fullSignOut } from "@/lib/auth/sign-out";
import { usePrivy } from "@privy-io/react-auth";
import { PRIVY_APP_ID } from "./PrivyClientProvider";

function WalletButtonInner({ privyLogout }: { privyLogout?: () => Promise<void> }) {
  const t = useT();
  const pathname = usePathname();
  const accountId = useNearPocketStore((s) => s.accountId);
  const demoMode = useNearPocketStore((s) => s.demoMode);
  const authMethod = useNearPocketStore((s) => s.authMethod);
  const connectWallet = useNearPocketStore((s) => s.connectWallet);

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [passcode, setPasscode] = useState("");
  const [exportOpen, setExportOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [faucetMsg, setFaucetMsg] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  // Inside the app, any accountId (including demo) is a signed-in session
  const hasSession = Boolean(accountId);
  const isDemo = Boolean(accountId && (demoMode || authMethod === "demo"));
  const label = shortAccountLabel(accountId, authMethod);
  const initials = accountInitials(accountId, authMethod);
  const hue = accountId ? (isDemo ? 32 : avatarHue(accountId)) : 0;
  const methodLabel = authMethodLabel(authMethod, isDemo);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (sessionStorage.getItem("nearpocket-suppress-restore") === "1") return;
    } catch { /* */ }

    const params = new URLSearchParams(window.location.search);
    const acc = params.get("account_id");
    if (acc && (acc.endsWith(".testnet") || acc.endsWith(".near"))) {
      connectWallet(acc, "selector");
      const url = new URL(window.location.href);
      ["account_id", "public_key", "all_keys"].forEach((k) => url.searchParams.delete(k));
      window.history.replaceState({}, "", url.pathname + url.search);
      return;
    }
    const local = loadLocalWalletRecord();
    if (local && !accountId) {
      connectWallet(local.accountId, "local");
    }
  }, [connectWallet, accountId]);

  async function copyAddress() {
    if (!accountId) return;
    await navigator.clipboard?.writeText(accountId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function exportKey() {
    if (!passcode) return;
    setBusy(true);
    try {
      const sk = await unlockSecretKey(passcode);
      await navigator.clipboard?.writeText(sk);
      setCopied(true);
      setError(null);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setError("Wrong passcode.");
    } finally {
      setBusy(false);
    }
  }

  async function faucet() {
    if (!accountId) return;
    setBusy(true);
    const r = await requestTestnetFaucet(accountId);
    setFaucetMsg(r.ok ? `Faucet: ${r.detail}` : `Faucet unavailable: ${r.detail}`);
    setBusy(false);
  }

  async function onSignOut() {
    setSigningOut(true);
    try {
      sessionStorage.setItem("nearpocket-suppress-restore", "1");
    } catch { /* */ }
    await fullSignOut({ privyLogout });
    setOpen(false);
    window.location.assign("/");
  }

  // Outside a session (shouldn't happen inside AuthGate) — offer Sign in
  if (!hasSession) {
    return (
      <Link
        href={`/login?next=${encodeURIComponent(pathname || "/home")}`}
        className="flex h-10 items-center gap-1.5 rounded-full bg-ink px-3.5 text-sm font-semibold text-cream-100"
      >
        <Wallet className="h-4 w-4" />
        <span>{t("auth.signIn")}</span>
      </Link>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("auth.yourWallet")}
        className="flex h-10 max-w-[8.5rem] items-center gap-1.5 rounded-full bg-cream-100 pl-1 pr-2.5 ring-1 ring-cream-300"
      >
        <span
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-cream-100"
          style={{ background: `hsl(${hue} 42% 32%)` }}
        >
          {initials}
        </span>
        <span className="truncate text-xs font-medium">{label}</span>
      </button>

      <Sheet
        open={open}
        onClose={() => {
          if (signingOut) return;
          setOpen(false);
          setExportOpen(false);
          setPasscode("");
          setError(null);
        }}
        title={t("auth.yourWallet")}
      >
        <div className="space-y-4">
          <div className="rounded-2xl bg-cream-200 p-4">
            <div className="flex items-center gap-3">
              <span
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-bold text-cream-100"
                style={{ background: `hsl(${hue} 42% 32%)` }}
              >
                {initials}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{label}</p>
                <p className="text-xs text-warm-600">
                  {methodLabel} · {NEAR_CONFIG.networkId}
                </p>
              </div>
            </div>
            <p className="mt-3 break-all text-xs leading-snug text-warm-600">{accountId}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" className="btn-secondary !h-9 !px-3 !text-xs" onClick={copyAddress}>
                <Copy className="h-3.5 w-3.5" /> {copied ? t("auth.copiedKey") : "Copy"}
              </button>
              {!isDemo && (
                <a
                  className="btn-outline !h-9 !px-3 !text-xs"
                  href={explorerAccountUrl(accountId!)}
                  target="_blank"
                  rel="noreferrer"
                >
                  {t("auth.viewExplorer")}
                </a>
              )}
            </div>
          </div>

          {authMethod === "local" && (
            <>
              {!exportOpen ? (
                <button type="button" className="btn-secondary w-full" onClick={() => setExportOpen(true)}>
                  <KeyRound className="h-4 w-4" /> {t("auth.exportKey")}
                </button>
              ) : (
                <div className="space-y-2">
                  <input
                    className="input"
                    type="password"
                    placeholder="Passcode"
                    value={passcode}
                    onChange={(e) => setPasscode(e.target.value)}
                  />
                  {error && <p className="text-sm text-[#8a2d1c]">{error}</p>}
                  <button type="button" className="btn-primary w-full" disabled={busy || !passcode} onClick={exportKey}>
                    {t("auth.exportKey")}
                  </button>
                </div>
              )}
              <button type="button" className="btn-outline w-full" disabled={busy} onClick={faucet}>
                {t("auth.fundFaucet")}
              </button>
              {faucetMsg && <p className="text-xs text-warm-600">{faucetMsg}</p>}
            </>
          )}

          <Link
            href="/settings"
            onClick={() => setOpen(false)}
            className="btn-secondary w-full"
          >
            <Settings className="h-4 w-4" /> {t("settings.title")}
          </Link>

          <button
            type="button"
            className="btn-danger w-full"
            disabled={signingOut}
            onClick={onSignOut}
          >
            <LogOut className="h-4 w-4" /> {signingOut ? "Signing out…" : t("auth.signOut")}
          </button>
        </div>
      </Sheet>
    </>
  );
}

function WalletButtonWithPrivy() {
  const { logout } = usePrivy();
  return <WalletButtonInner privyLogout={async () => { await logout(); }} />;
}

export function WalletButton() {
  if (PRIVY_APP_ID) return <WalletButtonWithPrivy />;
  return <WalletButtonInner />;
}
