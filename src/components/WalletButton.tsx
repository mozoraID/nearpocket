"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Wallet,
  LogOut,
  Sparkles,
  KeyRound,
  Globe,
  Copy,
  Eye,
  EyeOff,
  Shield
} from "lucide-react";
import { useNearPocketStore } from "@/lib/store";
import { NEAR_CONFIG, explorerAccountUrl } from "@/lib/near/config";
import { useT } from "@/lib/i18n";
import { Sheet } from "./Sheet";
import {
  clearLocalWallet,
  generateLocalWallet,
  loadLocalWalletRecord,
  pickConfirmIndices,
  requestTestnetFaucet,
  saveEncryptedWallet,
  unlockSecretKey,
  type GeneratedWallet,
} from "@/lib/wallet/local";

const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID || "";

type Stage =
  | "menu"
  | "create-backup"
  | "create-confirm"
  | "create-passcode"
  | "export"
  | "account";

export function WalletButton() {
  const t = useT();
  const accountId = useNearPocketStore((s) => s.accountId);
  const demoMode = useNearPocketStore((s) => s.demoMode);
  const authMethod = useNearPocketStore((s) => s.authMethod);
  const connectDemo = useNearPocketStore((s) => s.connectDemo);
  const connectWallet = useNearPocketStore((s) => s.connectWallet);
  const disconnect = useNearPocketStore((s) => s.disconnect);

  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<Stage>("menu");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gen, setGen] = useState<GeneratedWallet | null>(null);
  const [confirmIdx, setConfirmIdx] = useState<number[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [passcode, setPasscode] = useState("");
  const [pass2, setPass2] = useState("");
  const [showPhrase, setShowPhrase] = useState(true);
  const [exported, setExported] = useState(false);
  const [faucetMsg, setFaucetMsg] = useState<string | null>(null);

  const signedIn = Boolean(accountId && !demoMode);
  const words = useMemo(() => (gen?.seedPhrase || "").split(/\s+/).filter(Boolean), [gen]);
  const shuffleOptions = useMemo(() => {
    if (!words.length || !confirmIdx.length) return [];
    const needed = confirmIdx.map((i) => words[i]);
    const decoys = words.filter((w) => !needed.includes(w)).slice(0, 3);
    return [...needed, ...decoys].sort(() => Math.random() - 0.5);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [words.join(" "), confirmIdx.join(",")]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const acc = params.get("account_id");
    if (acc && (acc.endsWith(".testnet") || acc.endsWith(".near"))) {
      connectWallet(acc, "selector");
      const url = new URL(window.location.href);
      ["account_id", "public_key", "all_keys"].forEach((k) => url.searchParams.delete(k));
      window.history.replaceState({}, "", url.pathname + url.search);
    }
    // Restore local wallet session
    const local = loadLocalWalletRecord();
    if (local && !accountId) {
      connectWallet(local.accountId, "local");
    }
  }, [connectWallet, accountId]);

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
      // wipe mnemonic from React state ASAP
      const id = gen.accountId;
      setGen(null);
      setStage("account");
      setFaucetMsg("Wallet saved on this device. Optional: request testnet NEAR.");
      void id;
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
      setOpen(false);
      modal.show();
      const sub = selector.on("signedIn", ({ accounts }) => {
        const id = accounts?.[0]?.accountId;
        if (id) connectWallet(id, "selector");
        modal.hide();
        sub.remove();
      });
      if (selector.isSignedIn()) {
        const wallet = await selector.wallet();
        const accounts = await wallet.getAccounts();
        const id = accounts?.[0]?.accountId;
        if (id) connectWallet(id, "selector");
        modal.hide();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Wallet connect failed");
    } finally {
      setBusy(false);
    }
  }

  async function exportKey() {
    if (!passcode) {
      setStage("export");
      setPasscode("");
      setError(null);
      return;
    }
    setBusy(true);
    try {
      const sk = await unlockSecretKey(passcode);
      await navigator.clipboard?.writeText(sk);
      setExported(true);
      setError(null);
      setTimeout(() => setExported(false), 2500);
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
    setFaucetMsg(r.ok ? `Faucet: ${r.detail}` : `Faucet unavailable: ${r.detail}. Fund via https://near-faucet.io`);
    setBusy(false);
  }

  function close() {
    setOpen(false);
    setStage(signedIn ? "account" : "menu");
    resetCreate();
  }

  return (
    <>
      {signedIn ? (
        <button
          type="button"
          onClick={() => {
            setStage("account");
            setOpen(true);
          }}
          className="flex h-10 max-w-[9.5rem] items-center gap-2 rounded-full bg-cream-100 pl-1.5 pr-3 text-sm font-medium ring-1 ring-cream-300"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-ink text-[11px] font-bold text-cream-100">
            {accountId!.slice(0, 1).toUpperCase()}
          </span>
          <span className="truncate">{accountId}</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={() => {
            setStage("menu");
            setOpen(true);
          }}
          className="flex h-10 items-center gap-2 rounded-full bg-ink px-4 text-sm font-semibold text-cream-100"
        >
          <Wallet className="h-4 w-4" />
          {t("auth.signIn")}
        </button>
      )}

      <Sheet
        open={open}
        onClose={close}
        title={
          stage === "create-backup" || stage === "create-confirm" || stage === "create-passcode"
            ? t("auth.createWallet")
            : signedIn
              ? t("auth.yourWallet")
              : t("auth.signIn")
        }
      >
        {stage === "menu" && !signedIn && (
          <div className="space-y-3">
            <p className="text-sm text-warm-600">{t("auth.neverLeaves")}</p>

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

            <button
              type="button"
              className="btn-outline w-full"
              disabled={!PRIVY_APP_ID}
              title={!PRIVY_APP_ID ? t("auth.googleNeedId") : undefined}
              onClick={() => {
                if (!PRIVY_APP_ID) return;
                setError("Privy SDK is wired behind NEXT_PUBLIC_PRIVY_APP_ID — restart after setting it.");
              }}
            >
              <Globe className="h-5 w-5" />
              {t("auth.google")}
              {!PRIVY_APP_ID && (
                <span className="ml-1 rounded-full bg-cream-300 px-2 py-0.5 text-[10px] font-semibold text-ink">
                  {t("common.comingSoon")}
                </span>
              )}
            </button>
            {!PRIVY_APP_ID && (
              <p className="text-xs text-warm-600">{t("auth.googleNeedId")}</p>
            )}

            <button
              type="button"
              className="btn-secondary w-full"
              onClick={() => {
                connectDemo();
                close();
              }}
            >
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
              onClick={() => {
                navigator.clipboard?.writeText(gen.seedPhrase);
              }}
            >
              <Copy className="h-4 w-4" /> Copy phrase
            </button>
            <button type="button" className="btn-primary w-full" onClick={() => setStage("create-confirm")}>
              {t("common.continue")}
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

        {(stage === "account" || (signedIn && stage === "menu")) && signedIn && (
          <div className="space-y-4">
            <div className="rounded-2xl bg-cream-200 p-4">
              <p className="text-xs text-warm-600">
                {t("auth.connected", { network: NEAR_CONFIG.networkId })} · {authMethod}
              </p>
              <p className="mt-1 break-all font-semibold">{accountId}</p>
              <a
                className="mt-2 inline-block text-sm underline"
                href={explorerAccountUrl(accountId!)}
                target="_blank"
                rel="noreferrer"
              >
                {t("auth.viewExplorer")}
              </a>
            </div>

            {authMethod === "local" && (
              <>
                <button type="button" className="btn-secondary w-full" onClick={() => { setStage("export"); setPasscode(""); }}>
                  <KeyRound className="h-4 w-4" /> {t("auth.exportKey")}
                </button>
                <button type="button" className="btn-outline w-full" disabled={busy} onClick={faucet}>
                  {t("auth.fundFaucet")}
                </button>
                {faucetMsg && <p className="text-xs text-warm-600">{faucetMsg}</p>}
              </>
            )}

            <button
              type="button"
              className="btn-secondary w-full"
              onClick={() => {
                if (authMethod === "local") clearLocalWallet();
                disconnect();
                connectDemo();
                close();
              }}
            >
              <LogOut className="h-4 w-4" /> {t("auth.signOut")}
            </button>
          </div>
        )}

        {stage === "export" && (
          <div className="space-y-4">
            <p className="rounded-2xl bg-[#f4dcd6] px-3 py-2 text-sm text-[#8a2d1c]">
              Export only to a secure offline place. Anyone with this key controls the account.
            </p>
            <input
              className="input"
              type="password"
              placeholder="Passcode"
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
            />
            {error && <p className="text-sm text-[#8a2d1c]">{error}</p>}
            {exported && <p className="text-sm text-[#2f5a1f]">{t("auth.copiedKey")}</p>}
            <button type="button" className="btn-primary w-full" disabled={busy || !passcode} onClick={exportKey}>
              {t("auth.exportKey")}
            </button>
            <button type="button" className="btn-outline w-full" onClick={() => setStage("account")}>
              {t("common.back")}
            </button>
          </div>
        )}
      </Sheet>
    </>
  );
}
