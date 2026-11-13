/**
 * Approval cards come from chain requests. A failed receipt is not a purchase.
 */
import assert from "node:assert/strict";
import { approvalCards, formatRequestExpiry, openRequestIds } from "../src/lib/near/approval-state.ts";
import { chainEffects, displayActivityStatus } from "../src/lib/near/chain-effects.ts";
import type { ChainSpendRequest } from "../src/lib/near/chain-types.ts";
import { requestIdFromIndexKey } from "../src/lib/near/request-index.ts";
import { budgetDecision, spendBlock } from "../src/lib/near/spend-guard.ts";
import { verdictFromExecutionOutcome } from "../src/lib/near/tx-outcome.ts";
import type { WaitlistItem } from "../src/lib/agent/policy.ts";

const liveKey = Buffer.from(
  "02691f0000001200756974657374756e6e6b2e746573746e6574776c5f6d77663863796235",
  "hex",
);
assert.equal(requestIdFromIndexKey(liveKey, "uitestunnk.testnet"), "wl_mwf8cyb5");
assert.equal(requestIdFromIndexKey(liveKey, "nearpocket.testnet"), null);
assert.equal(requestIdFromIndexKey(Buffer.from("026b0000000000000000", "hex"), "uitestunnk.testnet"), null);

const request: ChainSpendRequest = {
  id: "wl_mwf8cyb5",
  title: "a coffee mug",
  category: "food",
  amountUsdc: 1.49,
  amountUsdc6: "1490000",
  status: "awaiting_approval",
  expiresAtNs: "1794676092932118896",
  settlementAccount: "settle.nearpocket.testnet",
};
const queued: WaitlistItem = {
  id: "wl_mwf8cyb5",
  title: "stale title",
  merchant: "Demo mart",
  category: "food",
  targetPriceUsdc: 1.49,
  currentPriceUsdc: 1.49,
  status: "queued",
  createdAt: "2026-11-13T00:00:00.000Z",
  updatedAt: "2026-11-13T00:00:00.000Z",
};

const cards = approvalCards({
  real: true,
  requestsLoaded: true,
  requests: [request],
  waitlist: [queued],
});
assert.equal(cards.length, 1);
assert.equal(cards[0]?.item.title, "a coffee mug");
assert.equal(cards[0]?.item.merchant, "Demo mart");
assert.equal(cards[0]?.item.status, "awaiting_approval");
assert.equal(cards[0]?.item.currentPriceUsdc, 1.49);
assert.equal(cards[0]?.request.settlementAccount, "settle.nearpocket.testnet");
assert.equal(cards[0]?.request.amountUsdc6, "1490000");
assert.ok(formatRequestExpiry(request.expiresAtNs).startsWith("2026-"));
assert.equal(openRequestIds([request, { ...request, id: "done", status: "rejected" }]).has("wl_mwf8cyb5"), true);
assert.equal(
  approvalCards({ real: true, requestsLoaded: true, requests: [], waitlist: [queued] }).length,
  0,
);
assert.equal(
  approvalCards({ real: true, requestsLoaded: false, requests: [request], waitlist: [] }).length,
  0,
);

const open = spendBlock({
  id: "wl_mwf8cyb5",
  amountUsdc: 1.49,
  requests: [request],
  requestsLoaded: true,
  escrowAvailableUsdc: 0.91,
});
assert.equal(open?.code, "request-open");
const low = spendBlock({
  id: "new-item",
  amountUsdc: 1.49,
  requests: [request],
  requestsLoaded: true,
  escrowAvailableUsdc: 0.91,
});
assert.equal(low?.code, "needs-escrow");
if (low?.code === "needs-escrow") assert.equal(low.available, "0.91");
assert.equal(
  spendBlock({ id: "new-item", amountUsdc: 1, requestsLoaded: false, escrowAvailableUsdc: 5 })?.code,
  "unknown",
);
assert.equal(spendBlock({ id: "new-item", amountUsdc: 1, requests: [], requestsLoaded: true, escrowAvailableUsdc: 5 }), null);

assert.equal(budgetDecision(1.49, 1), "over_budget");
assert.equal(budgetDecision(1.49, 1.49), "within");
assert.equal(budgetDecision(1.49, 2), "within");

assert.equal(
  displayActivityStatus({ kind: "agent", status: "awaiting_approval" }),
  "watching",
);
assert.equal(
  displayActivityStatus({ kind: "agent", status: "awaiting_approval", txHash: "abc" }),
  "awaiting_approval",
);
assert.equal(displayActivityStatus({ kind: "purchase", status: "purchased" }), "purchased");

const panicked = verdictFromExecutionOutcome({
  status: { SuccessValue: "" },
  transaction_outcome: { outcome: { status: { SuccessReceiptId: "outer" } } },
  receipts_outcome: [
    {
      outcome: {
        status: {
          Failure: {
            ActionError: { kind: { FunctionCallError: { ExecutionError: "Smart contract panicked: request" } } },
          },
        },
      },
    },
  ],
});
const effect = chainEffects({ action: "approve", ok: panicked.ok });
assert.equal(panicked.ok, false);
assert.match(panicked.error || "", /request/);
assert.equal(effect.purchased, false);
assert.equal(effect.debitUsdc, 0);
assert.equal(effect.waitlistStatus, undefined);

const queuedOnly = chainEffects({ action: "request", ok: false, completedMethods: ["queue_item"] });
assert.equal(queuedOnly.waitlistStatus, "queued");
assert.equal(queuedOnly.purchased, false);

const locked = chainEffects({ action: "request", ok: true, completedMethods: ["queue_item", "request_spend"] });
assert.equal(locked.waitlistStatus, "awaiting_approval");
assert.equal(locked.purchased, false);

console.log("approval cards ok");
