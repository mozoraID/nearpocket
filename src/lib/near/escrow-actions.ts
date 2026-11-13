"use client";

import { NEAR_CONFIG } from "./config";
import { numberToUsdc6 } from "./contract";
import { sendWalletCalls, submitContractCalls, type ChainResult } from "./gasless";
import { SPEND_FUNCTION_GAS } from "./relay-allowlist";
import { clearPending, finishPending, rememberPending, type PendingChain } from "./chain-tx";
import { useNearPocketStore } from "@/lib/store";
import type { WalletBalances } from "./chain-types";

export type { ChainSpendRequest, WalletBalances } from "./chain-types";

const memory = new Map<string, WalletBalances>();
let inflight: { accountId: string; promise: Promise<WalletBalances | null>; gen: number } | null = null;
let fetchGen = 0;

function cacheKey(accountId: string) {
  return `nearpocket-bal:${accountId}`;
}

export function readCachedBalances(accountId: string): WalletBalances | null {
  const hit = memory.get(accountId);
  if (hit) return hit;
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(cacheKey(accountId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as WalletBalances;
    if (typeof parsed?.walletUsdc !== "number") return null;
    memory.set(accountId, parsed);
    return parsed;
  } catch {
    return null;
  }
}

function writeCachedBalances(accountId: string, balances: WalletBalances) {
  const clean: WalletBalances = { ...balances };
  delete clean.stale;
  memory.set(accountId, clean);
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(cacheKey(accountId), JSON.stringify(clean));
  } catch {
    /* private mode can refuse storage; the in-memory copy still serves this tab */
  }
}

function withStale(balances: WalletBalances | null): WalletBalances | null {
  if (!balances) return null;
  return { ...balances, stale: true };
}

/** One in-flight read per account. `fresh` starts a new read after a confirmed transaction. */
export async function loadWalletBalances(accountId: string, opts?: { fresh?: boolean }): Promise<WalletBalances | null> {
  if (!accountId) return null;
  if (!opts?.fresh && inflight?.accountId === accountId) return inflight.promise;
  const gen = ++fetchGen;
  const task: { promise: Promise<WalletBalances | null> } = {
    promise: Promise.resolve(null),
  };
  task.promise = (async () => {
    try {
      const res = await fetch(`/api/balances?account=${encodeURIComponent(accountId)}`, {
        signal: AbortSignal.timeout(8000),
        cache: "no-store",
      });
      if (!res.ok) return withStale(readCachedBalances(accountId));
      const data = (await res.json()) as WalletBalances;
      if (typeof data.walletUsdc !== "number") return withStale(readCachedBalances(accountId));
      const useful =
        data.requestsLoaded === true ||
        data.walletUsdc > 0 ||
        data.escrowAvailableUsdc > 0 ||
        data.escrowLockedUsdc > 0;
      if (!useful) {
        const cached = readCachedBalances(accountId);
        if (cached && (cached.walletUsdc > 0 || cached.escrowLockedUsdc > 0 || cached.requestsLoaded)) {
          return withStale(cached);
        }
      }
      if (gen !== fetchGen) return readCachedBalances(accountId);
      const fresh = { ...data, stale: false };
      writeCachedBalances(accountId, fresh);
      return fresh;
    } catch {
      if (gen !== fetchGen) return readCachedBalances(accountId);
      return withStale(readCachedBalances(accountId));
    } finally {
      if (inflight?.gen === gen) inflight = null;
    }
  })();
  inflight = { accountId, promise: task.promise, gen };
  return task.promise;
}

export async function fetchWalletBalances(accountId: string): Promise<WalletBalances | null> {
  return loadWalletBalances(accountId);
}

async function runPending(pending: PendingChain, run: () => Promise<ChainResult>): Promise<ChainResult> {
  rememberPending(pending);
  try {
    const result = await run();
      if (result.txHash || result.steps?.length) {
      finishPending(result.txHash, {
        ok: result.ok && result.success !== false,
        error: result.detail,
        steps: result.steps,
      });
    } else clearPending();
    return result;
  } catch (error) {
    clearPending();
    throw error;
  }
}

export async function depositToEscrow(amountUsdc: number, title: string): Promise<ChainResult> {
  const st = useNearPocketStore.getState();
  if (!st.accountId || st.demoMode) {
    return { ok: false, mode: "skipped", detailCode: "demo" };
  }
  const info = await fetchWalletBalances(st.accountId);
  if (!info) return { ok: false, mode: "skipped", detailCode: "unavailable" };
  if (!(amountUsdc > 0)) return { ok: false, mode: "skipped", detail: "amount", detailCode: "unavailable" };
  if (amountUsdc > info.walletUsdc + 1e-8) {
    return { ok: false, mode: "skipped", detail: "wallet", detailCode: "needs-escrow" };
  }
  const amount = numberToUsdc6(amountUsdc);
  const transfer = {
    receiverId: info.usdcContract,
    methodName: "ft_transfer_call",
    args: {
      receiver_id: info.policyContract || NEAR_CONFIG.agentPolicyContract,
      amount,
      msg: "",
    },
    gas: 100_000_000_000_000n,
    deposit: 1n,
  };
  const pending: PendingChain = {
    kind: "deposit",
    title,
    amountUsdc,
    direction: "in",
  };
  if (!info.registered) {
    let min = 1_250_000_000_000_000_000_000n;
    try {
      min = BigInt(info.minStorageYocto);
    } catch {
      /* default NEP-145 minimum */
    }
    return runPending(pending, () =>
      sendWalletCalls({
        accountId: st.accountId as string,
        receiverId: info.usdcContract,
        calls: [
          {
            receiverId: info.usdcContract,
            methodName: "storage_deposit",
            args: { account_id: st.accountId },
            gas: 30_000_000_000_000n,
            deposit: min,
          },
          transfer,
        ],
      }),
    );
  }
  return runPending(pending, () => submitContractCalls([transfer], { accountId: st.accountId, demoMode: false }));
}

export async function withdrawFromEscrow(amountUsdc: number, title: string): Promise<ChainResult> {
  const st = useNearPocketStore.getState();
  if (!st.accountId || st.demoMode) {
    return { ok: false, mode: "skipped", detailCode: "demo" };
  }
  const info = await fetchWalletBalances(st.accountId);
  if (!info) return { ok: false, mode: "skipped", detailCode: "unavailable" };
  if (!(amountUsdc > 0)) return { ok: false, mode: "skipped", detail: "amount", detailCode: "unavailable" };
  if (amountUsdc > info.escrowAvailableUsdc + 1e-8) {
    return { ok: false, mode: "skipped", detail: info.escrowAvailableUsdc.toFixed(2), detailCode: "needs-escrow" };
  }
  return runPending(
    { kind: "withdraw", title, amountUsdc, direction: "out" },
    () =>
      submitContractCalls(
        [
          {
            receiverId: info.policyContract || NEAR_CONFIG.agentPolicyContract,
            methodName: "withdraw",
            args: { amount: numberToUsdc6(amountUsdc) },
            gas: SPEND_FUNCTION_GAS,
            deposit: 0n,
          },
        ],
        { accountId: st.accountId, demoMode: false },
      ),
  );
}
