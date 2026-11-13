"use client";

import { useNearPocketStore, type ActivityKind } from "@/lib/store";

const PENDING_KEY = "nearpocket-pending-chain";
const SEEN_KEY = "nearpocket-seen-tx";

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

function alreadySeen(hash: string): boolean {
  try {
    return sessionStorage.getItem(SEEN_KEY) === hash;
  } catch {
    return false;
  }
}

function markSeen(hash: string) {
  try {
    sessionStorage.setItem(SEEN_KEY, hash);
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

/** Record the transaction and tell the wallet shell to open the receipt. */
export function publishChainTx(notice: ChainTxNotice) {
  if (!notice.txHash || alreadySeen(notice.txHash)) return;
  markSeen(notice.txHash);
  clearPending();
  useNearPocketStore.getState().logActivity({
    kind: KIND[notice.kind],
    title: notice.title,
    detail: notice.detail,
    status: "onchain",
    amountUsdc: notice.amountUsdc,
    direction: notice.direction,
    txHash: notice.txHash,
  });
  window.dispatchEvent(new CustomEvent("nearpocket-balances-refresh"));
  window.dispatchEvent(new CustomEvent<ChainTxNotice>("nearpocket-chain-tx", { detail: notice }));
}

export function finishPending(txHash: string | undefined) {
  if (!txHash) return;
  const pending = readPending();
  if (!pending) return;
  publishChainTx({ ...pending, txHash });
}
