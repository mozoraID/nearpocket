"use client";

import { NEAR_CONFIG } from "./config";
import { verdictFromExecutionOutcome, type TxVerdict } from "./tx-outcome";

/** Fetch the final execution outcome and accept it only when every receipt succeeded. */
export async function confirmNearTransaction(hash: string, senderId: string): Promise<TxVerdict> {
  try {
    const res = await fetch(NEAR_CONFIG.nodeUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "nearpocket",
        method: "tx",
        params: {
          tx_hash: hash,
          sender_account_id: senderId,
          wait_until: "FINAL",
        },
      }),
    });
    const data = (await res.json()) as { result?: unknown; error?: { message?: string } };
    if (data.error) {
      return { ok: false, hash, error: data.error.message || "could not read the transaction" };
    }
    const verdict = verdictFromExecutionOutcome(data.result);
    return { ...verdict, hash: verdict.hash || hash };
  } catch (error) {
    return {
      ok: false,
      hash,
      error: error instanceof Error ? error.message : "could not read the transaction",
    };
  }
}
