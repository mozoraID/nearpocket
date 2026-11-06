"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Wallet,
  Sparkles,
  KeyRound,
  Globe,
  Copy,
  Eye,
  EyeOff,
  Shield,
  ArrowLeft,
} from "lucide-react";
import Link from "next/link";
import { useNearPocketStore } from "@/lib/store";
import { NEAR_CONFIG } from "@/lib/near/config";
import { useT } from "@/lib/i18n";
import { GoogleLoginButton } from "./GoogleLoginButton";
import { PRIVY_APP_ID } from "./PrivyClientProvider";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { BRAND } from "@/config/brand";
import {
  generateLocalWallet,
  loadLocalWalletRecord,
  pickConfirmIndices,
  saveEncryptedWallet,
  type GeneratedWallet,
} from "@/lib/wallet/local";

type Stage = "menu" | "create-backup" | "create-confirm" | "create-passcode";

function safeNext(raw: string | null): string {
  if (!raw) return "/app";
  try {
    const d = decodeURIComponent(raw);
    if (d.startsWith("/") && !d.startsWith("//")) return d;
  } catch { /* ignore */ }
  return "/app";
}

export function LoginPanel() {
  const t = useT();
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = safeNext(searchParams.get("next"));

  const accountId = useNearPocketStore((s) => s.accountId);
  const demoMode = useNearPocketStore((s) => s.demoMode);
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
    return unsub;
  }, []);

  // Already fully signed in (not demo) → bounce into app
  useEffect(() => {
    if (!hydrated) return;
    if (accountId && !demoMode) router.replace(next);
  }, [hydrated, accountId, demoMode, next, router]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const acc = params.get("account_id");
    if (acc && (acc.endsWith(".testnet") || acc.endsWith(".near"))) {
      connectWallet(acc, "selector");
      router.replace(next);
      return;
    }
    const local = loadLocalWalletRecord();
    if (local && (!accountId || demoMode)) {
      connectWallet(local.accountId, "local");
      router.replace(next);
    }
  }, [connectWallet, accountId, demoMode, next, router]);

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
    if (passcode.length < 4) {
      setError("Passcode at least 4 characters.");
      return;
    }
    if (passcode !== pass2) {
      setError("Passcodes don't match.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await saveEncryptedWallet(gen, passcode, "testnet");
      connectWallet(gen.accountId, "local");
      setGen(null);
      goApp();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save wallet");
    } finally {
      setBusy(false);
    }
  }

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
      modal.show();
      const sub = selector.on("signedIn", ({ accounts }) => {
        const id = accounts?.[0]?.accountId;
        if (id) {
          connectWallet(id, "selector");
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
    connectDemo();
    goApp();
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

      <main className="mx-auto w-full max-w-lg px-4 py-8 sm:py-12">
        <div className="mb-8 text-center">
          <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-ink text-sm font-bold text-cream-100">
            NP
          </span>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            {stage === "menu" ? t("auth.signIn") : t("auth.createWallet")}
          </h1>
          <p className="mt-2 text-sm text-warm-600">{t("auth.neverLeaves")}</p>
        </div>

        <div className="rounded-[1.75rem] bg-cream-100 p-5 shadow-[0_12px_40px_rgba(17,17,17,0.06)] ring-1 ring-cream-300 sm:p-6">
          {stage === "menu" && (
            <div className="space-y-3">
              <button type="button" className="btn-primary w-full" onClick={startCreate}>
                <KeyRound className="h-5 w-5" />
                {t("auth.createWallet")}
              </button>
              <p className="text-center text-xs text-warm-500">{t("auth.createHint")}</p>

              <button type="button" className="btn-secondary w-full" disabled={busy} onClick={connectWithSelector}>
                <Wallet className="h-5 w-5" />
                {busy ? "…" : t("auth.connectNear")}
              </button>
              <p className="text-center text-xs text-warm-500">{t("auth.connectHint")}</p>

              {PRIVY_APP_ID ? (
                <GoogleLoginButton
                  onDone={() => {
                    goApp();
                  }}
                />
              ) : (
                <>
                  <button type="button" className="btn-outline w-full" disabled title={t("auth.googleNeedId")}>
                    <Globe className="h-5 w-5" />
                    {t("auth.google")}
                    <span className="ml-1 rounded-full bg-cream-300 px-2 py-0.5 text-[10px] font-semibold text-ink">
                      {t("common.comingSoon")}
                    </span>
                  </button>
                  <p className="text-xs text-warm-600">{t("auth.googleNeedId")}</p>
                </>
              )}

              <button type="button" className="btn-secondary w-full" onClick={tryDemo}>
                <Sparkles className="h-4 w-4" /> {t("auth.tryDemo")}
              </button>
              {error ? <p className="text-sm text-[#8a2d1c]">{error}</p> : null}
            </div>
          )}

          {stage === "create-backup" && gen && (
            <div className="space-y-4">
              <p className="rounded-2xl bg-[#f4dcd6] px-3 py-2 text-sm text-[#8a2d1c]">{t("auth.backupWarn")}</p>
              <div className="relative grid grid-cols-3 gap-2 rounded-2xl bg-cream-200 p-3">
                {words.map((w, i) => (
                  <span key={i} className="rounded-xl bg-cream-100 px-2 py-2 text-center text-sm">
                    <span className="text-[10px] text-warm-500">{i + 1}.</span> {showPhrase ? w : "••••"}
                  </span>
                ))}
                <button
                  type="button"
                  className="absolute right-2 top-2 rounded-full bg-cream-100 p-2"
                  onClick={() => setShowPhrase((s) => !s)}
                >
                  {showPhrase ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <button
                type="button"
                className="btn-secondary w-full"
                onClick={() => navigator.clipboard?.writeText(gen.seedPhrase)}
              >
                <Copy className="h-4 w-4" /> Copy phrase
              </button>
              <button type="button" className="btn-primary w-full" onClick={() => setStage("create-confirm")}>
                {t("common.continue")}
              </button>
              <button type="button" className="btn-outline w-full" onClick={() => { resetCreate(); setStage("menu"); }}>
                {t("common.back")}
              </button>
            </div>
          )}

          {stage === "create-confirm" && gen && (
            <div className="space-y-4">
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
                  <button
                    key={w}
                    type="button"
                    disabled={picked.includes(w)}
                    className="h-10 rounded-full bg-cream-300 px-4 text-sm font-medium disabled:opacity-30"
                    onClick={() => setPicked((p) => (p.length < 3 ? [...p, w] : p))}
                  >
                    {w}
                  </button>
                ))}
              </div>
              <button type="button" className="btn-outline w-full" onClick={() => setPicked([])}>
                Reset
              </button>
              {error && <p className="text-sm text-[#8a2d1c]">{error}</p>}
              <button type="button" className="btn-primary w-full" disabled={picked.length < 3} onClick={checkConfirm}>
                {t("common.continue")}
              </button>
            </div>
          )}

          {stage === "create-passcode" && (
            <div className="space-y-4">
              <p className="text-sm text-warm-600">{t("auth.passcodeHint")}</p>
              <label className="block space-y-1.5">
                <span className="text-sm text-warm-600">{t("auth.setPasscode")}</span>
                <input
                  className="input"
                  type="password"
                  autoComplete="new-password"
                  value={passcode}
                  onChange={(e) => setPasscode(e.target.value)}
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-sm text-warm-600">Confirm passcode</span>
                <input
                  className="input"
                  type="password"
                  autoComplete="new-password"
                  value={pass2}
                  onChange={(e) => setPass2(e.target.value)}
                />
              </label>
              {error && <p className="text-sm text-[#8a2d1c]">{error}</p>}
              <button type="button" className="btn-primary w-full" disabled={busy} onClick={finishCreate}>
                <Shield className="h-4 w-4" />
                {busy ? t("auth.creating") : t("common.save")}
              </button>
            </div>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-warm-500">{t("landing.footerTestnet")}</p>
      </main>
    </div>
  );
}
