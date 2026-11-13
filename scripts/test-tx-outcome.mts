/**
 * A transaction hash is not success. A later receipt can still panic.
 */
import assert from "node:assert/strict";
import { verdictFromExecutionOutcome } from "../src/lib/near/tx-outcome.ts";

const ok = verdictFromExecutionOutcome({
  status: { SuccessValue: "" },
  transaction: { hash: "H18fFKDpKKPgKhCwYUaQJ4UbmkSARErd2pbpw5YfgixB" },
  transaction_outcome: { id: "H18fFKDpKKPgKhCwYUaQJ4UbmkSARErd2pbpw5YfgixB", outcome: { status: { SuccessReceiptId: "abc" } } },
  receipts_outcome: [{ outcome: { status: { SuccessValue: "" } } }],
});
assert.equal(ok.ok, true);

const panicked = verdictFromExecutionOutcome({
  status: { SuccessValue: "" },
  transaction: { hash: "6q4giVg6zZHtPujaKK2XMXRb87HnHAw5pxqNzawXdPEH" },
  transaction_outcome: { outcome: { status: { SuccessReceiptId: "outer" } } },
  receipts_outcome: [
    {
      outcome: {
        status: {
          Failure: {
            ActionError: {
              kind: {
                FunctionCallError: {
                  ExecutionError: "Smart contract panicked: request",
                },
              },
            },
          },
        },
      },
    },
  ],
});
assert.equal(panicked.ok, false);
assert.match(panicked.error || "", /request/);

const access = verdictFromExecutionOutcome({
  status: {
    Failure: {
      ActionError: {
        kind: { DelegateActionAccessKeyError: "RequiresFullAccess" },
      },
    },
  },
  transaction: { hash: "5Qa6gUMgGMZYyv6mLpGCGy6MyzSgL6ZKAvPtHpHoeZYk" },
});
assert.equal(access.ok, false);
assert.match(access.error || "", /RequiresFullAccess/);

assert.equal(verdictFromExecutionOutcome(null).ok, false);
assert.equal(verdictFromExecutionOutcome({ status: { SuccessValue: "" } }).ok, false);

console.log("tx outcome ok");
