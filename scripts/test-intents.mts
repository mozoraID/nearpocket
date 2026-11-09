/**
 * 1Click execution path: request shape, deposit plan, status poll, broadcast gate.
 * Uses a mocked fetch. Does not call 1Click and does not broadcast.
 */
import assert from "node:assert/strict";
import {
  buildDepositPlan,
  buildOneClickQuoteBody,
  broadcastIntentDeposit,
  intentBroadcastBlockReason,
  prepareIntentExecution,
  quoteAnyToUsdc,
  yoctoFromNear,
} from "../src/lib/near/intents.ts";

const saved = {
  execute: process.env.NEAR_INTENTS_EXECUTE,
  broadcast: process.env.NEAR_INTENTS_BROADCAST,
  ack: process.env.NEAR_INTENTS_MAINNET_ACK,
};

function restoreEnv() {
  for (const [key, value] of [
    ["NEAR_INTENTS_EXECUTE", saved.execute],
    ["NEAR_INTENTS_BROADCAST", saved.broadcast],
    ["NEAR_INTENTS_MAINNET_ACK", saved.ack],
  ] as const) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

assert.equal(yoctoFromNear("1"), "1" + "0".repeat(24));
assert.equal(yoctoFromNear("0.5"), "5" + "0".repeat(23));

const dry = buildOneClickQuoteBody({
  dry: true,
  fromToken: "NEAR",
  fromAmount: "1",
  accountId: "nearly-7b1462.testnet",
  deadlineIso: "2026-11-14T00:00:00.000Z",
});
assert.ok(dry);
assert.equal(dry.dry, true);
assert.equal(dry.depositType, "INTENTS");
assert.equal(dry.recipientType, "INTENTS");
assert.equal(dry.amount, "1" + "0".repeat(24));

const live = buildOneClickQuoteBody({
  dry: false,
  fromToken: "NEAR",
  fromAmount: "0.1",
  accountId: "user.near",
  deadlineIso: "2026-11-14T00:00:00.000Z",
});
assert.ok(live);
assert.equal(live.dry, false);
assert.equal(live.depositType, "ORIGIN_CHAIN");
assert.equal(live.recipientType, "DESTINATION_CHAIN");
assert.equal(live.refundType, "ORIGIN_CHAIN");
assert.equal(live.destinationAsset.startsWith("nep141:"), true);

const plan = buildDepositPlan({
  originAsset: String(live.originAsset),
  depositAddress: "deposit.near",
  amount: String(live.amount),
  depositMemo: "quote-memo",
});
assert.equal(plan.kind, "ft_transfer");
assert.equal(plan.contractId, "wrap.near");
assert.equal(plan.methodName, "ft_transfer");
assert.equal(plan.attachedDepositYocto, "1");
assert.equal(plan.args?.receiver_id, "deposit.near");
assert.equal(plan.args?.memo, "quote-memo");

delete process.env.NEAR_INTENTS_EXECUTE;
delete process.env.NEAR_INTENTS_BROADCAST;
delete process.env.NEAR_INTENTS_MAINNET_ACK;
assert.equal(typeof intentBroadcastBlockReason(), "string");

await assert.rejects(
  () =>
    prepareIntentExecution({
      fromToken: "NEAR",
      fromAmount: "0.1",
      accountId: "user.near",
      fetchImpl: async () => {
        throw new Error("fetch must not run when execution is off");
      },
    }),
  /NEAR_INTENTS_EXECUTE/,
);

await assert.rejects(
  () =>
    broadcastIntentDeposit(plan, {
      accountId: "user.near",
      privateKey: "ed25519:not-a-real-key",
    }),
  /broadcast|NEAR_INTENTS_EXECUTE|mainnet/i,
);

process.env.NEAR_INTENTS_EXECUTE = "1";
const calls: { url: string; body?: unknown }[] = [];
const fetchImpl: typeof fetch = async (input, init) => {
  const url = String(input);
  const body = init?.body ? JSON.parse(String(init.body)) : undefined;
  calls.push({ url, body });
  if (url.includes("/v0/quote")) {
    assert.equal(body.dry, false);
    assert.equal(body.depositType, "ORIGIN_CHAIN");
    return new Response(
      JSON.stringify({
        correlationId: "corr-test",
        quote: {
          depositAddress: "a".repeat(64),
          depositMemo: "memo-1",
          amountOutFormatted: "0.520000",
          amountOut: "520000",
          amountInUsd: "0.52",
          amountOutUsd: "0.52",
          timeEstimate: 30,
        },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }
  if (url.includes("/v0/status")) {
    assert.ok(url.includes("depositAddress="));
    assert.ok(url.includes("depositMemo=memo-1"));
    return new Response(
      JSON.stringify({ status: "PENDING_DEPOSIT", correlationId: "corr-test" }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }
  return new Response("no", { status: 404 });
};

const prepared = await prepareIntentExecution({
  fromToken: "NEAR",
  fromAmount: "0.1",
  accountId: "user.near",
  deadlineIso: "2026-11-14T00:10:00.000Z",
  fetchImpl,
});
assert.equal(prepared.executed, false);
assert.equal(prepared.broadcast, false);
assert.equal(prepared.quote.dry, false);
assert.equal(prepared.quote.depositAddress, "a".repeat(64));
assert.equal(prepared.depositPlan.kind, "ft_transfer");
assert.equal(prepared.depositPlan.args?.receiver_id, "a".repeat(64));
assert.equal(prepared.status?.status, "PENDING_DEPOSIT");
assert.equal(calls.length, 2);
assert.equal(intentBroadcastBlockReason()?.includes("BROADCAST"), true);

// Dry quote helper still asks for dry=true and does not require the execute flag.
calls.length = 0;
const dryQuote = await quoteAnyToUsdc("NEAR", "1", {
  accountId: "nearly-7b1462.testnet",
  fetchImpl: async (_input, init) => {
    const body = JSON.parse(String(init?.body));
    assert.equal(body.dry, true);
    assert.equal(body.depositType, "INTENTS");
    return new Response(
      JSON.stringify({
        quote: { amountOutFormatted: "5.200000", amountInUsd: "5.2", amountOutUsd: "5.2", timeEstimate: 20 },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  },
});
assert.equal(dryQuote.dry, true);
assert.equal(dryQuote.real, true);
assert.equal(dryQuote.toAmount, "5.200000");

restoreEnv();
console.log("ok: 1Click execution path is wired and broadcast stays gated");
