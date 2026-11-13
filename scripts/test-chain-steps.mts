import assert from "node:assert/strict";
import { showEscrowDepositBanner, stepTitleKey, stepsFromChain } from "../src/lib/near/chain-steps.ts";

const steps = stepsFromChain({
  ok: true,
  txHash: "request-hash",
  steps: [
    { methodName: "queue_item", txHash: "queue-hash", ok: true },
    { methodName: "request_spend", txHash: "request-hash", ok: true },
  ],
});
assert.deepEqual(
  steps.map((step) => step.txHash),
  ["queue-hash", "request-hash"],
);
assert.equal(stepTitleKey("queue_item"), "escrow.queued");
assert.equal(stepTitleKey("request_spend"), "escrow.requested");
assert.notEqual(stepTitleKey("queue_item"), stepTitleKey("request_spend"));

assert.equal(
  showEscrowDepositBanner({ real: true, loaded: true, available: 0, locked: 0 }),
  true,
);
assert.equal(
  showEscrowDepositBanner({ real: true, loaded: true, available: 2.4, locked: 0 }),
  false,
);
assert.equal(
  showEscrowDepositBanner({ real: true, loaded: true, available: 0, locked: 1.49 }),
  false,
);
assert.equal(
  showEscrowDepositBanner({ real: true, loaded: false, available: 0, locked: 0 }),
  false,
);

console.log("chain steps ok");
