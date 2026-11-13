/**
 * Testnet-only demo of the agent-policy contract.
 *
 *   request_spend within the live limit → approve_spend → success
 *   request_spend over the limit → contract rejects
 *
 * Signer (never commit this):
 *   NEAR_ACCOUNT_ID + NEAR_PRIVATE_KEY     (ed25519:...)
 *   or NEAR_CREDENTIALS_FILE               JSON { "account_id", "private_key" }
 *
 * Contract defaults to pocket.nearpocket.testnet.
 * Override with NEAR_CONTRACT_ID or --contract <id.testnet>.
 *
 * Each signer uses its own policy and escrow. queue_item, request_spend,
 * and approve_spend do not require the contract admin. request_spend
 * locks USDC already deposited into the contract.
 *
 * Prints explorer links. Does not print private keys. Refuses mainnet.
 * Does not deploy or replace code unless you pass --create-throwaway.
 */
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Account, JsonRpcProvider, KeyPair, actions } from "near-api-js";

const RPC = "https://rpc.testnet.near.org";
const EXPLORER = "https://testnet.nearblocks.io";
const DEFAULT_CONTRACT = "pocket.nearpocket.testnet";
const FAUCET_URLS = [
  "https://helper.testnet.near.org/account",
  "https://helper.testnet.near.org",
];

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function die(message) {
  console.error(message);
  process.exit(1);
}

function assertTestnetOnly() {
  const network = (
    process.env.NEAR_NETWORK ||
    process.env.NEXT_PUBLIC_NEAR_NETWORK ||
    "testnet"
  ).toLowerCase();
  if (network !== "testnet") {
    die(`Refusing to run: network is "${network}". This script is testnet-only.`);
  }
  const rpc = process.env.NEAR_RPC_URL || "";
  if (rpc && !rpc.includes("testnet")) {
    die("Refusing to run: NEAR_RPC_URL is not a testnet endpoint. This script uses rpc.testnet.near.org.");
  }
}

function isTxHash(value) {
  return typeof value === "string" && /^[1-9A-HJ-NP-Za-km-z]{32,64}$/.test(value);
}

function txLink(result) {
  const hash = result?.transaction?.hash || result?.transaction_outcome?.id || result?.txHash;
  return isTxHash(hash) ? `${EXPLORER}/txns/${hash}` : null;
}

function txLinkFromError(error) {
  const result = error?.transactionResult;
  const candidates = [
    error?.txHash,
    error?.transaction?.hash,
    result?.transaction?.hash,
    result?.transaction_outcome?.id,
    error?.cause?.txHash,
    error?.cause?.transactionResult?.transaction?.hash,
  ];
  for (const hash of candidates) {
    if (isTxHash(hash)) return `${EXPLORER}/txns/${hash}`;
  }
  return null;
}

function decodeStatus(result) {
  const status = result?.status;
  if (!status || typeof status === "string") {
    return { ok: false, value: status || "no status" };
  }
  if (Object.prototype.hasOwnProperty.call(status, "SuccessValue")) {
    const text = Buffer.from(status.SuccessValue, "base64").toString("utf8");
    if (!text) return { ok: true, value: null };
    try {
      return { ok: true, value: JSON.parse(text) };
    } catch {
      return { ok: true, value: text };
    }
  }
  if (status.Failure) {
    return { ok: false, value: JSON.stringify(status.Failure).slice(0, 500) };
  }
  return { ok: false, value: "unknown status" };
}

function printStep(name, result) {
  const label = result.ok ? "ok" : "rejected";
  const value = typeof result.value === "string" ? result.value : JSON.stringify(result.value);
  console.log(`${label}  ${name}: ${value}`);
  if (result.link) console.log(`     ${result.link}`);
  else if (result.preBroadcast) {
    console.log("     rejected before broadcast (RPC simulation). No transaction hash.");
  }
}

async function call(account, contractId, methodName, args) {
  try {
    // throwOnFailure: false keeps the outcome when the contract panics, so the
    // transaction hash is still available. A throw means the RPC rejected the
    // transaction before it returned an included outcome.
    const result = await account.signAndSendTransaction({
      receiverId: contractId,
      actions: [actions.functionCall(methodName, args, 80_000_000_000_000n, 0n)],
      waitUntil: "EXECUTED",
      throwOnFailure: false,
    });
    return { ...decodeStatus(result), link: txLink(result) };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const link = txLinkFromError(error);
    return {
      ok: false,
      value: message.slice(0, 500),
      link,
      preBroadcast: !link,
    };
  }
}

function argValue(flag) {
  const index = process.argv.indexOf(flag);
  if (index === -1 || !process.argv[index + 1]) return "";
  return process.argv[index + 1];
}

function resolveContractId() {
  const id =
    argValue("--contract") ||
    process.env.NEAR_CONTRACT_ID ||
    process.env.NEXT_PUBLIC_AGENT_POLICY_CONTRACT ||
    DEFAULT_CONTRACT;
  if (!id.endsWith(".testnet")) {
    die(`Refusing to run: contract "${id}" is not a .testnet account.`);
  }
  return id;
}

function loadCredentials() {
  let accountId = process.env.NEAR_ACCOUNT_ID || "";
  let privateKey = process.env.NEAR_PRIVATE_KEY || "";
  const file = process.env.NEAR_CREDENTIALS_FILE;
  if (file) {
    if (!fs.existsSync(file)) die("NEAR_CREDENTIALS_FILE does not exist.");
    let parsed;
    try {
      parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
      die('NEAR_CREDENTIALS_FILE is not JSON. Expected {"account_id","private_key"}.');
    }
    if (!parsed || typeof parsed !== "object") {
      die('NEAR_CREDENTIALS_FILE must be a JSON object with account_id and private_key.');
    }
    const fileId = typeof parsed.account_id === "string" ? parsed.account_id : parsed.accountId;
    const fileKey = typeof parsed.private_key === "string" ? parsed.private_key : parsed.privateKey;
    if (!accountId && typeof fileId === "string") accountId = fileId;
    if (!privateKey && typeof fileKey === "string") privateKey = fileKey;
  }
  if (file && !accountId) die("NEAR_CREDENTIALS_FILE is missing account_id.");
  if (file && !privateKey) die("NEAR_CREDENTIALS_FILE is missing private_key.");
  if (!accountId || !privateKey) {
    die(
      "Set NEAR_ACCOUNT_ID and NEAR_PRIVATE_KEY, or NEAR_CREDENTIALS_FILE pointing at {account_id, private_key}.",
    );
  }
  if (!accountId.endsWith(".testnet")) {
    die("Refusing to run: account id must end with .testnet.");
  }
  if (!privateKey.startsWith("ed25519:")) {
    die("Refusing to run: private key must be an ed25519: string.");
  }
  return { accountId, privateKey };
}

function asUnits(value) {
  if (value == null) return 0n;
  return BigInt(typeof value === "object" ? value.toString() : value);
}

function usdc(units) {
  const whole = units / 1_000_000n;
  const frac = (units % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : `${whole}`;
}

async function runFlow(signer, contractId, policy, escrow) {
  if (policy.paused || policy.global_paused) die("Contract or this account is paused. Unpause before running the demo.");
  const available = escrow ? asUnits(escrow.available_usdc_6) : 0n;

  const daily = asUnits(policy.daily_limit_usdc_6);
  const perItem = asUnits(policy.per_item_max_usdc_6);
  const spent = asUnits(policy.spent_today_usdc_6);
  const remaining = daily > spent ? daily - spent : 0n;
  const within = 1_000_000n <= perItem && 1_000_000n <= remaining ? 1_000_000n : remaining < perItem ? remaining : perItem;
  if (within <= 0n) {
    die("No room left under the daily limit today. The counter resets on the next UTC day.");
  }

  const spentAfter = spent + within;
  const roomAfter = daily > spentAfter ? daily - spentAfter : 0n;
  let over = perItem + 1n;
  let limitName = "per-item";
  if (roomAfter + 1n <= perItem) {
    over = roomAfter + 1n;
    limitName = "daily";
  }

  console.log(
    `Policy on ${contractId}: daily ${usdc(daily)} USDC, per-item ${usdc(perItem)} USDC, spent ${usdc(spent)} USDC, approval ${policy.require_approval}.`,
  );
  console.log(`Within-limit amount ${usdc(within)} USDC. Over-limit amount ${usdc(over)} USDC (expects ${limitName}).`);
  console.log(`     ${EXPLORER}/address/${contractId}`);

  const stamp = Date.now().toString(36);
  const withinId = `within-${stamp}`;
  const overId = `over-${stamp}`;

  const queueWithin = await call(signer, contractId, "queue_item", {
    id: withinId,
    title: "NearPocket demo item",
    category: "shopping",
    target_usdc_6: within.toString(),
  });
  printStep("queue_item within limit", queueWithin);
  if (!queueWithin.ok) die("queue_item failed.");

  const queueOver = await call(signer, contractId, "queue_item", {
    id: overId,
    title: "NearPocket over-limit item",
    category: "shopping",
    target_usdc_6: over.toString(),
  });
  printStep("queue_item over-limit item", queueOver);
  if (!queueOver.ok) die("queue_item for the rejection case failed.");

  const requested = await call(signer, contractId, "request_spend", {
    id: withinId,
    amount_usdc_6: within.toString(),
  });
  printStep("request_spend within limit", requested);
  const expectedRequest = policy.require_approval ? "awaiting_approval" : "transferring";
  if (available < within) {
    console.log("");
    console.log(
      `Escrow for ${signer.accountId} is ${usdc(available)} USDC. request_spend cannot lock funds until this account deposits USDC.`,
    );
    console.log("Deposit with ft_transfer_call (1 yoctoNEAR attached), then rerun:");
    console.log(
      `  near call ${process.env.NEAR_USDC_CONTRACT_ID || "usdc.fakes.testnet"} ft_transfer_call ` +
        `'{"receiver_id":"${contractId}","amount":"${within}","msg":""}' ` +
        `--accountId ${signer.accountId} --depositYocto 1 --gas 100000000000000`,
    );
    if (!requested.ok) {
      console.log("request_spend was refused, which is expected without escrow.");
      return;
    }
  }
  if (!requested.ok || requested.value !== expectedRequest) {
    die(`Expected request_spend within the limit to return ${expectedRequest}.`);
  }

  const approved = await call(signer, contractId, "approve_spend", {
    id: withinId,
    amount_usdc_6: within.toString(),
  });
  printStep("approve_spend", approved);
  if (!approved.ok) die("approve_spend failed.");

  const rejected = await call(signer, contractId, "request_spend", {
    id: overId,
    amount_usdc_6: over.toString(),
  });
  printStep(`request_spend over ${limitName} limit`, rejected);
  if (rejected.ok) die("Over-limit request_spend was accepted. It must be rejected.");

  console.log("");
  console.log("Testnet demo finished. No mainnet transactions were sent.");
  console.log("Paste the explorer links above into README → On-chain proof.");
}

function saveThrowaway(accountId, privateKey) {
  const dir = path.join(root, ".nearly-credentials");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "testnet-demo.json");
  fs.writeFileSync(
    file,
    JSON.stringify({ account_id: accountId, private_key: privateKey, network: "testnet" }, null, 2),
    { mode: 0o600 },
  );
  console.log("Saved the throwaway key locally (gitignored): .nearly-credentials/testnet-demo.json");
}

async function createThrowaway() {
  const key = KeyPair.fromRandom("ed25519");
  const accountId = `np${randomBytes(5).toString("hex")}.testnet`;
  const body = JSON.stringify({
    newAccountId: accountId,
    newAccountPublicKey: key.getPublicKey().toString(),
  });
  let last = "no response";
  for (const url of FAUCET_URLS) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
      });
      const text = await res.text();
      if (res.ok) {
        console.log(`Faucet created ${accountId} via ${url} (HTTP ${res.status}).`);
        saveThrowaway(accountId, key.toString());
        return { accountId, privateKey: key.toString() };
      }
      last = `${url} HTTP ${res.status}`;
      console.error(`Faucet ${url} returned HTTP ${res.status}.`);
      if (text && !text.includes("ed25519:")) console.error(text.slice(0, 180));
    } catch (error) {
      last = `${url} ${error instanceof Error ? error.message : "network error"}`;
      console.error(`Faucet ${url} failed: ${error instanceof Error ? error.message : "network error"}`);
    }
  }
  throw new Error(`Could not create a testnet account. ${last}`);
}

async function waitForAccount(provider, accountId) {
  for (let attempt = 1; attempt <= 20; attempt++) {
    try {
      await provider.viewAccount({ accountId });
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  }
  die(`Account ${accountId} did not appear on ${RPC}.`);
}

async function deployFresh(signer) {
  const wasmPath = path.join(root, "contracts/agent-policy/res/nearly_agent_policy.wasm");
  const wasm = new Uint8Array(fs.readFileSync(wasmPath));
  const deployed = await signer.deployContract(wasm);
  const link = txLink(deployed);
  console.log(`deployed a fresh copy on ${signer.accountId}`);
  if (link) console.log(`     ${link}`);
  const init = await call(signer, signer.accountId, "new", {
    usdc_contract: process.env.NEAR_USDC_CONTRACT_ID || "usdc.fakes.testnet",
    settlement_account: signer.accountId,
  });
  printStep("new", init);
  if (!init.ok) die("Contract init failed.");
}

async function main() {
  assertTestnetOnly();
  const provider = new JsonRpcProvider({ url: RPC });

  if (process.argv.includes("--create-throwaway")) {
    const created = await createThrowaway();
    const signer = new Account(created.accountId, provider, created.privateKey);
    await waitForAccount(provider, created.accountId);
    console.log(`Signer ${created.accountId} on testnet.`);
    console.log(`     ${EXPLORER}/address/${created.accountId}`);
    await deployFresh(signer);
    const policy = await provider.callFunction({
      contractId: created.accountId,
      method: "get_policy",
      args: { account_id: created.accountId },
    });
    const escrow = await provider.callFunction({
      contractId: created.accountId,
      method: "get_escrow",
      args: { account_id: created.accountId },
    });
    await runFlow(signer, created.accountId, policy, escrow);
    return;
  }

  const { accountId, privateKey } = loadCredentials();
  const contractId = resolveContractId();
  const signer = new Account(accountId, provider, privateKey);
  await waitForAccount(provider, accountId);
  console.log(`Signer ${accountId} on testnet. Contract ${contractId}.`);
  console.log(`     ${EXPLORER}/address/${accountId}`);

  let policy;
  let escrow = null;
  try {
    policy = await provider.callFunction({
      contractId,
      method: "get_policy",
      args: { account_id: accountId },
    });
    escrow = await provider.callFunction({
      contractId,
      method: "get_escrow",
      args: { account_id: accountId },
    });
  } catch (error) {
    die(
      `Could not read get_policy/get_escrow on ${contractId}: ${error instanceof Error ? error.message : "view failed"}. ` +
        "This script targets the per-account escrow contract. Set NEAR_CONTRACT_ID to that account.",
    );
  }
  await runFlow(signer, contractId, policy, escrow);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : "testnet demo failed";
  console.error(message.includes("ed25519:") ? "testnet demo failed" : message);
  process.exit(1);
});
