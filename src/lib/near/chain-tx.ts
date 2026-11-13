"use client";

import { useNearPocketStore, type ActivityKind } from "@/lib/store";

const PENDING_KEY = "nearpocket-pending-chain";
const SEEN_KEY = "nearpocket-seen-tx";
const OPEN_TX_KEY = "nearpocket-open-tx";

export type ChainActionKind = "deposit" | "withdraw" | "request" | "approve" | "reject";

export interface PendingChain {
  kind: ChainActionKind;
  title: string;
  detail?: string;
  amountUsdc?: number;
  direction?: "in" | "out";
}

export interface ChainTxNotice extends PendingChain {
  txHash: string;
  /** False when the hash exists but a receipt failed. */
  ok?: boolean;
  error?: string;
  /** Every transaction in this user action, oldest first. */
  steps?: { methodName: string; txHash: string; title: string; ok: boolean }[];
}

export function rememberPending(action: PendingChain) {
  try {
    sessionStorage.setItem(PENDING_KEY, JSON.stringify(action));
  } catch {
    /* private mode */
  }
}

export function readPending(): PendingChain | null {
  try {
    const raw = sessionStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingChain;
    if (!parsed?.title || !parsed.kind) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearPending() {
  try {
    sessionStorage.removeItem(PENDING_KEY);
  } catch {
    /* ignore */
  }
}

/** Keep the hash across a reload that happens before the receipt check finishes. */
export function rememberOpenTx(hash: string) {
  try {
    sessionStorage.setItem(OPEN_TX_KEY, hash);
  } catch {
    /* private mode */
  }
}

export function readOpenTx(): string | null {
  try {
    return sessionStorage.getItem(OPEN_TX_KEY);
  } catch {
    return null;
  }
}

export function clearOpenTx() {
  try {
    sessionStorage.removeItem(OPEN_TX_KEY);
  } catch {
    /* ignore */
  }
}

export function readSeenTx(): string | null {
  const seen = readSeen();
  return seen[seen.length - 1] || null;
}

function readSeen(): string[] {
  try {
    const raw = sessionStorage.getItem(SEEN_KEY);
    if (!raw) return [];
    if (raw.startsWith("[")) {
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
    }
    return [raw];
  } catch {
    return [];
  }
}

function alreadySeen(hash: string): boolean {
  return readSeen().includes(hash);
}

function markSeen(hashes: string[]) {
  try {
    const next = [...readSeen()];
    for (const hash of hashes) {
      if (!next.includes(hash)) next.push(hash);
    }
    sessionStorage.setItem(SEEN_KEY, JSON.stringify(next.slice(-40)));
  } catch {
    /* ignore */
  }
}

const KIND: Record<ChainActionKind, ActivityKind> = {
  deposit: "topup",
  withdraw: "payment",
  request: "agent",
  approve: "agent",
  reject: "agent",
};

/** Record every transaction in the action and open one receipt that lists them. */
export function publishChainTx(notice: ChainTxNotice) {
  const steps = notice.steps?.length
    ? notice.steps
    : notice.txHash
      ? [{ methodName: "", txHash: notice.txHash, title: notice.title, ok: notice.ok !== false }]
      : [];
  const fresh = steps.filter((step) => step.txHash && !alreadySeen(step.txHash));
  window.dispatchEvent(new CustomEvent("nearpocket-balances-refresh"));
  if (!fresh.length) return;
  markSeen(fresh.map((step) => step.txHash));
  clearPending();
  clearOpenTx();
  for (const step of fresh) {
    const failed = step.ok === false;
    useNearPocketStore.getState().logActivity({
      kind: KIND[notice.kind],
      title: step.title || notice.title,
      detail: failed ? notice.error || notice.detail : notice.detail,
      status: failed ? "failed" : "onchain",
      amountUsdc: notice.amountUsdc,
      direction: notice.direction,
      txHash: step.txHash,
    });
  }
  window.dispatchEvent(new CustomEvent<ChainTxNotice>("nearpocket-chain-tx", { detail: { ...notice, steps: fresh } }));
}

export function finishPending(
  txHash: string | undefined,
  outcome?: {
    ok: boolean;
    error?: string;
    steps?: { methodName: string; txHash: string; title?: string; ok?: boolean }[];
  },
) {
  const pending = readPending();
  if (!pending) return;
  const steps = (outcome?.steps?.length
    ? outcome.steps
    : txHash
      ? [{ methodName: "", txHash, ok: outcome?.ok }]
      : []
  )
    .filter((step) => step.txHash)
    .map((step) => ({
      methodName: step.methodName,
      txHash: step.txHash,
      title: step.title || pending.title,
      ok: step.ok !== false,
    }));
  if (!steps.length) return;
  const ok = outcome?.ok !== false;
  publishChainTx({
    ...pending,
    txHash: steps[steps.length - 1]?.txHash || txHash || "",
    ok,
    error: ok ? undefined : outcome?.error,
    steps,
  });
}
