"use client";

import { rpcCall } from "./rpc";
import { verdictFromExecutionOutcome, type TxVerdict } from "./tx-outcome";

/** Fetch the final execution outcome and accept it only when every receipt succeeded. */
export async function confirmNearTransaction(hash: string, senderId: string): Promise<TxVerdict> {
  try {
    const result = await rpcCall(
      {
        jsonrpc: "2.0",
        id: "nearpocket",
        method: "tx",
        params: {
          tx_hash: hash,
          sender_account_id: senderId,
          wait_until: "FINAL",
        },
      },
      20000,
    );
    const verdict = verdictFromExecutionOutcome(result);
    return { ...verdict, hash: verdict.hash || hash };
  } catch (error) {
    return {
      ok: false,
      hash,
      error: error instanceof Error ? error.message : "could not read the transaction",
    };
  }
}
