"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import {
  KeyRound,
  Copy,
  Eye,
  EyeOff,
  Shield,
  ArrowLeft,
  Sparkles,
  ArrowRight,
} from "lucide-react";
import { useNearPocketStore } from "@/lib/store";
import { NEAR_CONFIG } from "@/lib/near/config";
import { useT } from "@/lib/i18n";
import { GoogleLoginButton } from "./GoogleLoginButton";
import { PRIVY_APP_ID } from "./PrivyClientProvider";
import { SignOutButton } from "./SignOutButton";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { BRAND } from "@/config/brand";
import { shortAccountLabel, accountInitials, avatarHue } from "@/lib/account-label";
import {
  generateLocalWallet,
  pickConfirmIndices,
  saveEncryptedWallet,
  type GeneratedWallet,
} from "@/lib/wallet/local";

type Stage = "menu" | "create-backup" | "create-confirm" | "create-passcode";

const LAST_METHOD_KEY = "nearpocket-last-auth";

function safeNext(raw: string | null): string {
  if (!raw) return "/home";
  try {
    const d = decodeURIComponent(raw);
    if (d.startsWith("/") && !d.startsWith("//")) {
      if (d === "/app" || d.startsWith("/app?")) return d.replace(/^\/app/, "/home");
      return d;
    }
  } catch { /* ignore */ }
  return "/home";
}

function rememberMethod(m: string) {
  try { localStorage.setItem(LAST_METHOD_KEY, m); } catch { /* */ }
}
function lastMethod(): string | null {
  try { return localStorage.getItem(LAST_METHOD_KEY); } catch { return null; }
}

const WALLETS = [
  { id: "meteor", name: "Meteor Wallet", icon: "/wallets/meteor.png", recent: false },
  { id: "hot", name: "HOT Wallet", icon: "/wallets/hot.png", recent: false },
  { id: "intear", name: "Intear", icon: "/wallets/intear.svg", recent: false },
  { id: "near-mobile", name: "NEAR Mobile", icon: "/wallets/near-mobile.png", recent: false },
] as const;

export function LoginPanel() {
  const t = useT();
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = safeNext(searchParams.get("next"));

  const accountId = useNearPocketStore((s) => s.accountId);
  const authMethod = useNearPocketStore((s) => s.authMethod);
  const connectDemo = useNearPocketStore((s) => s.connectDemo);
  const connectWallet = useNearPocketStore((s) => s.connectWallet);

  const [stage, setStage] = useState<Stage>("menu");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gen, setGen] = useState<GeneratedWallet | null>(null);
  const [confirmIdx, setConfirmIdx] = useState<number[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [passcode, setPasscode] = useState("");
  const [pass2, setPass2] = useState("");
  const [showPhrase, setShowPhrase] = useState(true);
  const [hydrated, setHydrated] = useState(false);
  const [recent, setRecent] = useState<string | null>(null);

  const words = useMemo(() => (gen?.seedPhrase || "").split(/\s+/).filter(Boolean), [gen]);
  const shuffleOptions = useMemo(() => {
    if (!words.length || !confirmIdx.length) return [];
    const needed = confirmIdx.map((i) => words[i]);
    const decoys = words.filter((w) => !needed.includes(w)).slice(0, 3);
    return [...needed, ...decoys].sort(() => Math.random() - 0.5);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [words.join(" "), confirmIdx.join(",")]);

  useEffect(() => {
    const unsub = useNearPocketStore.persist.onFinishHydration(() => setHydrated(true));
    if (useNearPocketStore.persist.hasHydrated()) setHydrated(true);
    setRecent(lastMethod());
    return unsub;
  }, []);

  // Wallet-selector return URL: accept account into store, stay on /login (Continue panel).
  // Never auto-navigate to /home. Respect suppress-restore after sign-out.
  useEffect(() => {
    if (typeof window === "undefined" || !hydrated) return;
    try {
      if (sessionStorage.getItem("nearpocket-suppress-restore") === "1") return;
    } catch { /* */ }
    const params = new URLSearchParams(window.location.search);
    const acc = params.get("account_id");
    if (acc && (acc.endsWith(".testnet") || acc.endsWith(".near"))) {
      connectWallet(acc, "selector");
      rememberMethod("selector");
      const url = new URL(window.location.href);
      ["account_id", "public_key", "all_keys"].forEach((k) => url.searchParams.delete(k));
      window.history.replaceState({}, "", url.pathname + url.search);
      return;
    }
    // Do NOT silently resurrect a local wallet here after sign-out.
    // Local wallet is only restored when the user starts Create/Continue flows,
    // or when WalletButton restores it inside a gated /home session.
  }, [hydrated, connectWallet, accountId]);

  const signedIn = hydrated && Boolean(accountId); // demo or real — show Continue, never auto-redirect

  function goApp() {
    router.replace(next);
  }

  function resetCreate() {
    setGen(null);
    setConfirmIdx([]);
    setPicked([]);
    setPasscode("");
    setPass2("");
    setShowPhrase(true);
    setError(null);
  }

  function startCreate() {
    try { sessionStorage.removeItem("nearpocket-suppress-restore"); } catch { /* */ }
    resetCreate();
    const w = generateLocalWallet();
    setGen(w);
    setConfirmIdx(pickConfirmIndices(12));
    setStage("create-backup");
  }

  function checkConfirm() {
    if (!gen) return;
    const expected = confirmIdx.map((i) => words[i]);
    if (picked.length !== expected.length || picked.some((w, i) => w !== expected[i])) {
      setError("Words don't match. Look at your backup again.");
      setPicked([]);
      return;
    }
    setError(null);
    setStage("create-passcode");
  }

  async function finishCreate() {
    if (!gen) return;
    if (passcode.length < 4) { setError("Passcode at least 4 characters."); return; }
    if (passcode !== pass2) { setError("Passcodes don't match."); return; }
    setBusy(true);
    setError(null);
    try {
      await saveEncryptedWallet(gen, passcode, "testnet");
      connectWallet(gen.accountId, "local");
      rememberMethod("local");
      setGen(null);
      goApp();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save wallet");
    } finally {
      setBusy(false);
    }
  }

  async function connectWithSelector() {
    try { sessionStorage.removeItem("nearpocket-suppress-restore"); } catch { /* */ }
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
      modal.show();
      const sub = selector.on("signedIn", ({ accounts }) => {
        const id = accounts?.[0]?.accountId;
        if (id) {
          connectWallet(id, "selector");
          rememberMethod("selector");
          modal.hide();
          goApp();
        }
        sub.remove();
      });
      if (selector.isSignedIn()) {
        const wallet = await selector.wallet();
        const accounts = await wallet.getAccounts();
        const id = accounts?.[0]?.accountId;
        if (id) {
          connectWallet(id, "selector");
          rememberMethod("selector");
          modal.hide();
          goApp();
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Wallet connect failed");
    } finally {
      setBusy(false);
    }
  }

  function tryDemo() {
    try { sessionStorage.removeItem("nearpocket-suppress-restore"); } catch { /* */ }
    connectDemo();
    rememberMethod("demo");
    goApp();
  }

  const hue = accountId ? avatarHue(accountId) : 0;

  if (!hydrated) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-cream-200 text-ink">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-ink text-sm font-bold text-cream-100">
          NP
        </span>
        <p className="text-sm font-medium">{BRAND.displayName}</p>
        <p className="text-xs text-warm-500">Loading…</p>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-cream-200 text-ink">
      <header className="border-b border-cream-300/80 bg-cream-100/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-lg items-center justify-between gap-3 px-4">
          <Link href="/" className="flex items-center gap-2 text-sm font-medium text-warm-600">
            <ArrowLeft className="h-4 w-4" /> {BRAND.displayName}
          </Link>
          <LanguageSwitcher compact />
        </div>
      </header>

      <main className="mx-auto w-full max-w-lg px-4 py-8 sm:py-10">
        {signedIn && stage === "menu" ? (
          <div className="space-y-6">
            <div className="text-center">
              <span
                className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full text-lg font-bold text-cream-100"
                style={{ background: `hsl(${hue} 42% 32%)` }}
              >
                {accountInitials(accountId)}
              </span>
              <h1 className="text-2xl font-semibold tracking-tight">{t("auth.signedInTitle")}</h1>
              <p className="mt-2 text-sm text-warm-600">
                {t("auth.signedInAs", { name: shortAccountLabel(accountId, authMethod) })}
              </p>
              <p className="mt-1 break-all px-4 text-xs text-warm-500">{accountId}</p>
            </div>
            <div className="space-y-3 rounded-[1.75rem] bg-cream-100 p-5 ring-1 ring-cream-300">
              <button type="button" className="btn-primary w-full" onClick={goApp}>
                {t("auth.continueToApp")} <ArrowRight className="h-4 w-4" />
              </button>
              <SignOutButton />
            </div>
          </div>
        ) : (
          <>
            {stage === "menu" && (
              <div className="mb-6 text-center">
                <h1 className="text-2xl font-semibold tracking-tight sm:text-[1.75rem]">
                  {t("auth.loginTitle")}
                </h1>
                <p className="mt-2 text-sm text-warm-600">{t("auth.loginSub")}</p>
              </div>
            )}

            <div className="space-y-4">
              {stage === "menu" && (
                <>
                  {/* Recommended */}
                  <button
                    type="button"
                    onClick={startCreate}
                    className="relative flex w-full flex-col items-start gap-1 rounded-[1.5rem] bg-ink p-5 text-left text-cream-100 shadow-[0_12px_32px_rgba(17,17,17,0.12)]"
                  >
                    <span className="absolute right-4 top-4 rounded-full bg-cream-100 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-ink">
                      {t("auth.recommended")}
                    </span>
                    <span className="flex items-center gap-2 text-base font-semibold">
                      <KeyRound className="h-5 w-5" />
                      {t("auth.createWallet")}
                      {recent === "local" && (
                        <span className="rounded-full bg-cream-100/20 px-2 py-0.5 text-[10px] font-semibold">
                          {t("auth.recent")}
                        </span>
                      )}
                    </span>
                    <span className="text-sm text-cream-400">{t("auth.createHintShort")}</span>
                  </button>

                  <div className="relative py-1 text-center text-xs font-medium uppercase tracking-wider text-warm-500">
                    <span className="relative z-10 bg-cream-200 px-3">{t("auth.web3Wallets")}</span>
                    <span className="absolute left-0 right-0 top-1/2 h-px bg-cream-300" />
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    {WALLETS.map((w) => (
                      <button
                        key={w.id}
                        type="button"
                        disabled={busy}
                        onClick={connectWithSelector}
                        className="relative flex flex-col items-center gap-2 rounded-2xl bg-cream-100 px-3 py-4 ring-1 ring-cream-300 transition active:scale-[0.98]"
                      >
                        {recent === "selector" && w.id === "meteor" && (
                          <span className="absolute right-2 top-2 rounded-full bg-ink px-1.5 py-0.5 text-[9px] font-bold text-cream-100">
                            {t("auth.recent")}
                          </span>
                        )}
                        <Image src={w.icon} alt="" width={36} height={36} className="h-9 w-9 rounded-xl object-contain" />
                        <span className="text-center text-xs font-semibold leading-tight">{w.name}</span>
                      </button>
                    ))}
                  </div>

                  {PRIVY_APP_ID ? (
                    <div className="rounded-2xl bg-cream-100 p-1 ring-1 ring-cream-300">
                      <GoogleLoginButton
                        onDone={() => {
                          rememberMethod("privy");
                          goApp();
                        }}
                      />
                    </div>
                  ) : null}

                  {error ? <p className="text-sm text-[#8a2d1c]">{error}</p> : null}

                  <button
                    type="button"
                    onClick={tryDemo}
                    className="mx-auto flex items-center gap-1.5 pt-2 text-sm text-warm-600 underline-offset-2 hover:underline"
                  >
                    <Sparkles className="h-3.5 w-3.5" /> {t("auth.tryDemo")}
                  </button>
                </>
              )}

              {stage === "create-backup" && gen && (
                <div className="space-y-4 rounded-[1.75rem] bg-cream-100 p-5 ring-1 ring-cream-300">
                  <h2 className="text-lg font-semibold">{t("auth.createWallet")}</h2>
                  <p className="rounded-2xl bg-[#f4dcd6] px-3 py-2 text-sm text-[#8a2d1c]">{t("auth.backupWarn")}</p>
                  <div className="relative grid grid-cols-3 gap-2 rounded-2xl bg-cream-200 p-3">
                    {words.map((w, i) => (
                      <span key={i} className="rounded-xl bg-cream-100 px-2 py-2 text-center text-sm">
                        <span className="text-[10px] text-warm-500">{i + 1}.</span> {showPhrase ? w : "••••"}
                      </span>
                    ))}
                    <button type="button" className="absolute right-2 top-2 rounded-full bg-cream-100 p-2" onClick={() => setShowPhrase((s) => !s)}>
                      {showPhrase ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <button type="button" className="btn-secondary w-full" onClick={() => navigator.clipboard?.writeText(gen.seedPhrase)}>
                    <Copy className="h-4 w-4" /> Copy phrase
                  </button>
                  <button type="button" className="btn-primary w-full" onClick={() => setStage("create-confirm")}>{t("common.continue")}</button>
                  <button type="button" className="btn-outline w-full" onClick={() => { resetCreate(); setStage("menu"); }}>{t("common.back")}</button>
                </div>
              )}

              {stage === "create-confirm" && gen && (
                <div className="space-y-4 rounded-[1.75rem] bg-cream-100 p-5 ring-1 ring-cream-300">
                  <p className="text-sm text-warm-600">{t("auth.confirmHint")}</p>
                  <div className="space-y-2">
                    {confirmIdx.map((idx, slot) => (
                      <div key={idx} className="flex items-center gap-2 rounded-2xl bg-cream-200 px-3 py-2">
                        <span className="text-xs text-warm-500">Word {idx + 1}</span>
                        <span className="font-semibold">{picked[slot] || "—"}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {shuffleOptions.map((w) => (
                      <button key={w} type="button" disabled={picked.includes(w)} className="h-10 rounded-full bg-cream-300 px-4 text-sm font-medium disabled:opacity-30" onClick={() => setPicked((p) => (p.length < 3 ? [...p, w] : p))}>{w}</button>
                    ))}
                  </div>
                  {error && <p className="text-sm text-[#8a2d1c]">{error}</p>}
                  <button type="button" className="btn-primary w-full" disabled={picked.length < 3} onClick={checkConfirm}>{t("common.continue")}</button>
                </div>
              )}

              {stage === "create-passcode" && (
                <div className="space-y-4 rounded-[1.75rem] bg-cream-100 p-5 ring-1 ring-cream-300">
                  <p className="text-sm text-warm-600">{t("auth.passcodeHint")}</p>
                  <label className="block space-y-1.5">
                    <span className="text-sm text-warm-600">{t("auth.setPasscode")}</span>
                    <input className="input" type="password" autoComplete="new-password" value={passcode} onChange={(e) => setPasscode(e.target.value)} />
                  </label>
                  <label className="block space-y-1.5">
                    <span className="text-sm text-warm-600">Confirm passcode</span>
                    <input className="input" type="password" autoComplete="new-password" value={pass2} onChange={(e) => setPass2(e.target.value)} />
                  </label>
                  {error && <p className="text-sm text-[#8a2d1c]">{error}</p>}
                  <button type="button" className="btn-primary w-full" disabled={busy} onClick={finishCreate}>
                    <Shield className="h-4 w-4" />
                    {busy ? t("auth.creating") : t("common.save")}
                  </button>
                </div>
              )}
            </div>
          </>
        )}
        <p className="mt-8 text-center text-xs text-warm-500">{t("landing.footerTestnet")}</p>
      </main>
    </div>
  );
}
