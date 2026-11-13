"use client";

import { NEAR_CONFIG } from "./config";
import { numberToUsdc6 } from "./contract";
import { sendWalletCalls, submitContractCalls, type ChainResult } from "./gasless";
import { SPEND_FUNCTION_GAS } from "./relay-allowlist";
import { clearPending, finishPending, rememberPending, type PendingChain } from "./chain-tx";
import { useNearPocketStore } from "@/lib/store";

export interface WalletBalances {
  walletUsdc: number;
  escrowAvailableUsdc: number;
  escrowLockedUsdc: number;
  registered: boolean;
  minStorageYocto: string;
  usdcContract: string;
  policyContract: string;
}

export async function fetchWalletBalances(accountId: string): Promise<WalletBalances | null> {
  try {
    const res = await fetch(`/api/balances?account=${encodeURIComponent(accountId)}`);
    if (!res.ok) return null;
    return (await res.json()) as WalletBalances;
  } catch {
    return null;
  }
}

async function runPending(pending: PendingChain, run: () => Promise<ChainResult>): Promise<ChainResult> {
  rememberPending(pending);
  try {
    const result = await run();
    if (result.txHash) finishPending(result.txHash);
    else clearPending();
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
