/**
 * A function-call access key can sign exactly one FunctionCall action.
 * queue_item and request_spend must be two transactions.
 */
import assert from "node:assert/strict";
import { shopBuyCallList, shopRequestCallList } from "../src/lib/near/policy-call-list.ts";
import { singleActionTransactions } from "../src/lib/near/single-action.ts";

const item = {
  id: "mug",
  title: "Coffee mug",
  category: "shopping",
  amountUsdc: 1.49,
};

const POLICY = "pocket.nearpocket.testnet";
const groups = [
  shopRequestCallList(POLICY, { ...item, withinBudget: true }),
  shopRequestCallList(POLICY, { ...item, withinBudget: false }),
  shopBuyCallList(POLICY, item),
];

for (const calls of groups) {
  const txs = singleActionTransactions(calls);
  assert.equal(txs.length, calls.length);
  for (const tx of txs) {
    assert.equal(tx.length, 1, `${tx.map((call) => call.methodName).join("+")} is more than one action`);
  }
}

const request = singleActionTransactions(shopRequestCallList(POLICY, { ...item, withinBudget: true }));
assert.deepEqual(
  request.map((tx) => tx[0].methodName),
  ["queue_item", "request_spend"],
);
assert.equal(new Set(request.map((tx) => tx[0].receiverId)).size, 1);

const buy = singleActionTransactions(shopBuyCallList(POLICY, item));
assert.deepEqual(
  buy.map((tx) => tx[0].methodName),
  ["queue_item", "request_spend", "approve_spend"],
);

console.log("one action ok");
