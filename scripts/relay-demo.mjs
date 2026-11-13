/**
 * Relay one harmless get_policy meta-transaction on NEAR testnet.
 *
 *   NEAR_CREDENTIALS_FILE=./sender.json \
 *   RELAYER_ACCOUNT_ID=nearpocket.testnet \
 *   RELAYER_PRIVATE_KEY='ed25519:...' \
 *   npm run relay:demo
 *
 * The sender key is read only from NEAR_CREDENTIALS_FILE ({ account_id, private_key }).
 * NEAR_PRIVATE_KEY is ignored on purpose.
 * The relayer key is RELAYER_ACCOUNT_ID + RELAYER_PRIVATE_KEY, or RELAYER_CREDENTIALS_FILE.
 * Nothing here prints a private key. Mainnet is refused.
 */
import fs from "node:fs";
import {
  Account,
  JsonRpcProvider,
  KeyPair,
  KeyPairSigner,
  actions,
  buildDelegateAction,
  encodeSignedDelegate,
} from "near-api-js";
import { validateSignedDelegate } from "../src/lib/near/relay-policy.ts";

const RPC = "https://rpc.testnet.near.org";
const DEFAULT_CONTRACT = "pocket.nearpocket.testnet";

function die(message) {
  console.error(message);
  process.exit(1);
}

function assertTestnetOnly() {
  const network = (process.env.NEAR_NETWORK || process.env.NEXT_PUBLIC_NEAR_NETWORK || "testnet").toLowerCase();
  if (network !== "testnet") {
    die(`Refusing to run: network is "${network}". This script is testnet-only.`);
  }
  const rpc = process.env.NEAR_RPC_URL || "";
  if (rpc && !rpc.includes("testnet")) {
    die("Refusing to run: NEAR_RPC_URL is not a testnet endpoint.");
  }
}

function readCredentials(file, label) {
  if (!file) die(`Set ${label}.`);
  if (!fs.existsSync(file)) die(`${label} does not exist.`);
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    die(`${label} is not JSON. Expected {"account_id","private_key"}.`);
  }
  const accountId = typeof parsed.account_id === "string" ? parsed.account_id : parsed.accountId;
  const privateKey = typeof parsed.private_key === "string" ? parsed.private_key : parsed.privateKey;
  if (typeof accountId !== "string" || typeof privateKey !== "string") {
    die(`${label} must contain account_id and private_key.`);
  }
  return { accountId: accountId.trim(), privateKey: privateKey.trim() };
}

function assertTestnetAccount(accountId, label) {
  const implicit = /^[0-9a-f]{64}$/.test(accountId);
  if (!accountId.endsWith(".testnet") && !implicit) {
    die(`Refusing to run: ${label} "${accountId}" is not a testnet account.`);
  }
  if (!accountId.endsWith(".testnet") && accountId.endsWith(".near")) {
    die(`Refusing to run: ${label} is a mainnet account.`);
  }
}

function loadSender() {
  if (process.env.NEAR_PRIVATE_KEY) {
    console.log("Ignoring NEAR_PRIVATE_KEY. The sender key is read only from NEAR_CREDENTIALS_FILE.");
    delete process.env.NEAR_PRIVATE_KEY;
  }
  const sender = readCredentials(process.env.NEAR_CREDENTIALS_FILE, "NEAR_CREDENTIALS_FILE");
  assertTestnetAccount(sender.accountId, "sender");
  if (!sender.privateKey.startsWith("ed25519:")) {
    die("Refusing to run: the sender key must be an ed25519: string.");
  }
  return sender;
}

function loadRelayerEnv() {
  const fromEnv = process.env.RELAYER_ACCOUNT_ID?.trim() && process.env.RELAYER_PRIVATE_KEY?.trim();
  if (fromEnv) {
    assertTestnetAccount(process.env.RELAYER_ACCOUNT_ID.trim(), "relayer");
    if (!process.env.RELAYER_PRIVATE_KEY.trim().startsWith("ed25519:")) {
      die("Refusing to run: the relayer key must be an ed25519: string.");
    }
    return;
  }
  const file = process.env.RELAYER_CREDENTIALS_FILE;
  const relayer = readCredentials(file, "RELAYER_ACCOUNT_ID and RELAYER_PRIVATE_KEY, or RELAYER_CREDENTIALS_FILE");
  assertTestnetAccount(relayer.accountId, "relayer");
  if (!relayer.privateKey.startsWith("ed25519:")) {
    die("Refusing to run: the relayer key must be an ed25519: string.");
  }
  process.env.RELAYER_ACCOUNT_ID = relayer.accountId;
  process.env.RELAYER_PRIVATE_KEY = relayer.privateKey;
}

function contractId() {
  const id = (process.env.NEAR_CONTRACT_ID || process.env.NEXT_PUBLIC_AGENT_POLICY_CONTRACT || DEFAULT_CONTRACT).trim();
  if (!id.endsWith(".testnet")) die(`Refusing to run: contract "${id}" is not a .testnet account.`);
  return id;
}

async function signedGetPolicy(sender, contract) {
  const provider = new JsonRpcProvider({ url: process.env.NEAR_RPC_URL || RPC });
  const keyPair = KeyPair.fromString(sender.privateKey);
  const accessKey = await provider.viewAccessKey({
    accountId: sender.accountId,
    publicKey: keyPair.getPublicKey(),
  });
  const block = await provider.viewBlock({ finality: "final" });
  const delegate = buildDelegateAction({
    senderId: sender.accountId,
    receiverId: contract,
    actions: [
      actions.functionCall(
        "get_policy",
        { account_id: sender.accountId },
        30_000_000_000_000n,
        0n,
      ),
    ],
    nonce: BigInt(accessKey.nonce) + 1n,
    maxBlockHeight: BigInt(block.header.height) + 100n,
    publicKey: keyPair.getPublicKey(),
  });
  const signer = KeyPairSigner.fromSecretKey(sender.privateKey);
  const { signedDelegate } = await signer.signDelegateAction(delegate);
  const bytes = encodeSignedDelegate(signedDelegate);
  const validated = validateSignedDelegate(bytes, {
    networkId: "testnet",
    contractId: contract,
    usdcContractId: process.env.NEAR_USDC_CONTRACT_ID || "usdc.fakes.testnet",
    currentBlockHeight: BigInt(block.header.height),
  });
  if (validated.needsOwner) {
    die("Refusing to relay an owner-only method from this script. get_policy does not need the owner.");
  }
  return signedDelegate;
}

function readHash(result) {
  const hash = result?.transaction?.hash || result?.transaction_outcome?.id || "";
  return /^[1-9A-HJ-NP-Za-km-z]{32,64}$/.test(hash) ? hash : "";
}

async function main() {
  assertTestnetOnly();
  const sender = loadSender();
  loadRelayerEnv();
  const contract = contractId();
  console.log(`Sender ${sender.accountId} delegates get_policy on ${contract}.`);
  const signedDelegate = await signedGetPolicy(sender, contract);
  const provider = new JsonRpcProvider({ url: process.env.NEAR_RPC_URL || RPC });
  const relayer = new Account(
    process.env.RELAYER_ACCOUNT_ID.trim(),
    provider,
    process.env.RELAYER_PRIVATE_KEY.trim(),
  );
  const result = await relayer.signAndSendTransaction({
    receiverId: sender.accountId,
    actions: [actions.signedDelegate(signedDelegate)],
    waitUntil: "EXECUTED",
    throwOnFailure: false,
  });
  const hash = readHash(result);
  if (!hash) die("Relayer did not return a transaction hash.");
  const failed = result?.status && typeof result.status === "object" && result.status.Failure;
  console.log(failed ? "included, execution failed" : "ok");
  console.log(hash);
  console.log(`https://testnet.nearblocks.io/txns/${hash}`);
  if (failed) {
    console.log(JSON.stringify(result.status.Failure).slice(0, 300));
    process.exit(1);
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : "relay failed";
  die(/ed25519:/.test(message) ? "relay failed" : message);
});
