/**
 * Allowlist and validation for NEP-366 delegates.
 * Builds real Borsh SignedDelegates with near-api-js. No network.
 */
import assert from "node:assert/strict";
import {
  KeyPair,
  KeyPairSigner,
  actions,
  buildDelegateAction,
  encodeSignedDelegate,
} from "near-api-js";
import { MAX_GAS_PER_ACTION } from "../src/lib/near/relay-allowlist.ts";
import { resetRelayLimits, checkIpLimit, checkAndRecordSender } from "../src/lib/near/relay-limits.ts";
import {
  RelayValidationError,
  validateSignedDelegate,
} from "../src/lib/near/relay-policy.ts";
import { configuredNetworkId } from "../src/lib/near/relay-env.ts";

const CONTRACT = "nearly-7b1462.testnet";
const USDC = "usdc.fakes.testnet";
const HEIGHT = 1_000n;

const config = {
  networkId: "testnet",
  contractId: CONTRACT,
  usdcContractId: USDC,
  currentBlockHeight: HEIGHT,
};

const signerKey = KeyPair.fromRandom("ed25519");
const signer = KeyPairSigner.fromSecretKey(signerKey.toString());

function bytesOf(signed) {
  return encodeSignedDelegate(signed);
}

async function sign({
  receiverId = CONTRACT,
  nearActions,
  nonce = 7n,
  maxBlockHeight = HEIGHT + 50n,
  keyPair = signerKey,
  signerImpl = signer,
}) {
  const delegate = buildDelegateAction({
    senderId: "alice.testnet",
    receiverId,
    actions: nearActions,
    nonce,
    maxBlockHeight,
    publicKey: keyPair.getPublicKey(),
  });
  const { signedDelegate } = await signerImpl.signDelegateAction(delegate);
  return bytesOf(signedDelegate);
}

function expectReject(bytes, pattern) {
  assert.throws(
    () => validateSignedDelegate(bytes, config),
    (error) => {
      assert.ok(error instanceof RelayValidationError, String(error));
      assert.match(error.message, pattern);
      return true;
    },
  );
}

const allowed = await sign({
  nearActions: [
    actions.functionCall(
      "request_spend",
      { id: "earbuds", amount_usdc_6: "1000000" },
      30_000_000_000_000n,
      0n,
    ),
  ],
});
const ok = validateSignedDelegate(allowed, config);
assert.equal(ok.senderId, "alice.testnet");
assert.equal(ok.receiverId, CONTRACT);
assert.equal(ok.calls[0].methodName, "request_spend");
assert.equal(ok.calls[0].deposit, 0n);
assert.equal(ok.needsOwner, false);
assert.ok(ok.publicKey.startsWith("ed25519:"));

const atCap = await sign({
  nearActions: [actions.functionCall("get_policy", {}, MAX_GAS_PER_ACTION, 0n)],
});
assert.equal(validateSignedDelegate(atCap, config).calls[0].methodName, "get_policy");

const ft = await sign({
  receiverId: USDC,
  nearActions: [
    actions.functionCall(
      "ft_transfer",
      { receiver_id: "bob.testnet", amount: "1" },
      30_000_000_000_000n,
      1n,
    ),
  ],
});
const ftOk = validateSignedDelegate(ft, config);
assert.equal(ftOk.receiverId, USDC);
assert.equal(ftOk.calls[0].deposit, 1n);
assert.equal(ftOk.needsOwner, false);

const ownerCall = await sign({
  nearActions: [
    actions.functionCall(
      "approve_spend",
      { id: "earbuds", amount_usdc_6: "1000000", plan_id: null },
      30_000_000_000_000n,
      0n,
    ),
  ],
});
assert.equal(validateSignedDelegate(ownerCall, config).needsOwner, true);

for (const [name, action] of [
  ["transfer", actions.transfer(1n)],
  ["addKey", actions.addFullAccessKey(signerKey.getPublicKey())],
  ["deleteKey", actions.deleteKey(signerKey.getPublicKey())],
  ["deployContract", actions.deployContract(new Uint8Array([1, 2, 3]))],
  ["deleteAccount", actions.deleteAccount("bob.testnet")],
  ["stake", actions.stake(1n, signerKey.getPublicKey())],
]) {
  const bytes = await sign({ nearActions: [action] });
  expectReject(bytes, new RegExp(`action type ${name} is not allowed`));
}

expectReject(
  await sign({ receiverId: "other.testnet", nearActions: [actions.functionCall("get_policy", {}, 30_000_000_000_000n, 0n)] }),
  /receiver is not an allowlisted contract/,
);

expectReject(
  await sign({ nearActions: [actions.functionCall("reject_spend", {}, 30_000_000_000_000n, 0n)] }),
  /method reject_spend is not allowlisted/,
);

expectReject(
  await sign({
    maxBlockHeight: HEIGHT - 1n,
    nearActions: [actions.functionCall("get_policy", {}, 30_000_000_000_000n, 0n)],
  }),
  /expired/,
);

expectReject(
  await sign({
    nearActions: [actions.functionCall("get_policy", {}, MAX_GAS_PER_ACTION + 1n, 0n)],
  }),
  /gas per action exceeds the cap/,
);

expectReject(
  await sign({
    nearActions: [actions.functionCall("request_spend", { id: "x", amount_usdc_6: "1" }, 30_000_000_000_000n, 1n)],
  }),
  /attached deposit is above the cap/,
);

expectReject(
  await sign({
    receiverId: USDC,
    nearActions: [
      actions.functionCall("ft_transfer", { receiver_id: "bob.testnet", amount: "1" }, 30_000_000_000_000n, 2n),
    ],
  }),
  /deposit must be 0 or 1 yoctoNEAR/,
);

expectReject(
  await sign({
    receiverId: USDC,
    nearActions: [actions.functionCall("storage_deposit", {}, 30_000_000_000_000n, 1n)],
  }),
  /attached deposit is above the cap/,
);

expectReject(
  await sign({
    nonce: 0n,
    nearActions: [actions.functionCall("get_policy", {}, 30_000_000_000_000n, 0n)],
  }),
  /nonce must be greater than zero/,
);

const secp = KeyPair.fromRandom("secp256k1");
const secpSigner = KeyPairSigner.fromSecretKey(secp.toString());
expectReject(
  await sign({
    keyPair: secp,
    signerImpl: secpSigner,
    nearActions: [actions.functionCall("get_policy", {}, 30_000_000_000_000n, 0n)],
  }),
  /public key must be ed25519/,
);

assert.throws(
  () => validateSignedDelegate(allowed, { ...config, networkId: "mainnet" }),
  /testnet/,
);

const tampered = Uint8Array.from(allowed);
tampered[tampered.length - 1] ^= 0xff;
expectReject(tampered, /signature does not match|not valid Borsh/);

resetRelayLimits();
for (let i = 0; i < 12; i++) assert.equal(checkIpLimit("203.0.113.8", 1_000).ok, true);
const blocked = checkIpLimit("203.0.113.8", 1_000);
assert.equal(blocked.ok, false);
assert.equal(checkIpLimit("203.0.113.9", 1_000).ok, true);
assert.equal(checkIpLimit("203.0.113.8", 1_000 + 60_000).ok, true);

resetRelayLimits();
for (let i = 0; i < 40; i++) assert.equal(checkAndRecordSender("alice.testnet", Date.parse("2026-11-10T00:00:00Z")).ok, true);
assert.equal(checkAndRecordSender("alice.testnet", Date.parse("2026-11-10T12:00:00Z")).ok, false);
assert.equal(checkAndRecordSender("alice.testnet", Date.parse("2026-11-11T00:00:00Z")).ok, true);

assert.equal(configuredNetworkId({}), "testnet");
assert.equal(configuredNetworkId({ NEXT_PUBLIC_NEAR_NETWORK: "mainnet" }), "mainnet");
assert.equal(configuredNetworkId({ NEAR_NETWORK: "mainnet", NEXT_PUBLIC_NEAR_NETWORK: "testnet" }), "mainnet");
assert.equal(configuredNetworkId({ NEXT_PUBLIC_NEAR_NETWORK: " Testnet " }), "testnet");

console.log("relay allowlist ok");
