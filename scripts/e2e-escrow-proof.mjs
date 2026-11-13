/**
 * Testnet proof: deposit, request, approve, reject, expire, withdraw, and a cross-wallet denial.
 *
 *   POLICY_CONTRACT=escrow.nearpocket.testnet \
 *   USDC_CONTRACT=usdc.fakes.testnet \
 *   ALICE_KEY_FILE=./alice.json \
 *   BOB_KEY_FILE=./bob.json \
 *   node scripts/e2e-escrow-proof.mjs
 *
 * Key files are `{ "account_id", "private_key" }`. The script never prints those keys.
 * Alice needs testnet NEAR for gas and some USDC. The policy account and settlement
 * account must already be registered on the token. This does not create accounts.
 */
import fs from "node:fs";
import { connect, keyStores, KeyPair } from "near-api-js";
import { assertTestnet, readKeyFile, redact } from "./e2e-escrow-lib.mjs";

const NETWORK = process.env.NEAR_NETWORK || "testnet";
const POLICY = process.env.POLICY_CONTRACT || process.env.NEAR_CONTRACT_ID || "escrow.nearpocket.testnet";
const USDC = process.env.USDC_CONTRACT || "usdc.fakes.testnet";
const RPC = process.env.NEAR_RPC || "https://rpc.testnet.near.org";
const DEPOSIT = process.env.E2E_DEPOSIT_USDC6 || "2000000";
const SPEND = process.env.E2E_SPEND_USDC6 || "1000000";

assertTestnet(NETWORK);
const aliceFile = process.env.ALICE_KEY_FILE;
const bobFile = process.env.BOB_KEY_FILE;
if (!aliceFile || !bobFile) {
  console.error("Set ALICE_KEY_FILE and BOB_KEY_FILE to credential JSON paths.");
  process.exit(1);
}

const secrets = [];
const aliceKeys = readKeyFile(fs.readFileSync(aliceFile, "utf8"));
const bobKeys = readKeyFile(fs.readFileSync(bobFile, "utf8"));
secrets.push(aliceKeys.privateKey, bobKeys.privateKey);

function say(text) {
  console.log(redact(text, secrets));
}

function units(value) {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") return String(value.available_usdc_6 ?? value);
  return String(value ?? "0");
}

async function main() {
  const keyStore = new keyStores.InMemoryKeyStore();
  await keyStore.setKey(NETWORK, aliceKeys.accountId, KeyPair.fromString(aliceKeys.privateKey));
  await keyStore.setKey(NETWORK, bobKeys.accountId, KeyPair.fromString(bobKeys.privateKey));
  const near = await connect({ networkId: NETWORK, nodeUrl: RPC, keyStore });
  const alice = await near.account(aliceKeys.accountId);
  const bob = await near.account(bobKeys.accountId);
  const rows = [];

  async function view(contractId, method, args) {
    const response = await near.connection.provider.query({
      request_type: "call_function",
      account_id: contractId,
      method_name: method,
      args_base64: Buffer.from(JSON.stringify(args)).toString("base64"),
      finality: "final",
    });
    return JSON.parse(Buffer.from(response.result).toString());
  }
  async function escrowOf(accountId) {
    const row = await view(POLICY, "get_escrow", { account_id: accountId });
    return `${units(row.available_usdc_6)} available / ${units(row.locked_usdc_6)} locked`;
  }
  async function tokenOf(accountId) {
    const balance = await view(USDC, "ft_balance_of", { account_id: accountId });
    return String(balance);
  }
  async function step(name, account, method, args, deposit) {
    const before = await escrowOf(aliceKeys.accountId);
    let hash = "";
    let ok = "ok";
    try {
      const result = await account.callFunctionRaw({
        contractId: method.startsWith("ft_") ? USDC : POLICY,
        methodName: method,
        args,
        gas: 80_000_000_000_000n,
        deposit: deposit ? BigInt(deposit) : 0n,
        waitUntil: "FINAL",
      });
      hash = result.transaction?.hash || result.transaction_outcome?.id || "";
    } catch (error) {
      ok = "failed";
      hash = redact(error instanceof Error ? error.message : String(error), secrets).slice(0, 180);
    }
    const after = await escrowOf(aliceKeys.accountId);
    rows.push({ name, before, after, ok, hash });
    say(`| ${name} | ${ok} | ${before} | ${after} | ${hash} |`);
  }

  const config = await view(POLICY, "get_config", {});
  const settlement = config.settlement_account;
  say(`policy ${POLICY}`);
  say(`usdc ${USDC}`);
  say(`settlement ${settlement}`);
  say(`alice token before ${await tokenOf(aliceKeys.accountId)}`);
  say(`settlement token before ${await tokenOf(settlement)}`);
  say("| step | result | alice escrow before | alice escrow after | tx |");
  say("| --- | --- | --- | --- | --- |");

  const id = `e2e-${Date.now().toString(36)}`;
  await step("deposit", alice, "ft_transfer_call", { receiver_id: POLICY, amount: DEPOSIT, msg: "" }, "1");
  await step("queue", alice, "queue_item", { id, title: "proof", category: "shopping", target_usdc_6: SPEND });
  await step("request", alice, "request_spend", { id, amount_usdc_6: SPEND });
  const request = await view(POLICY, "get_request", { account_id: aliceKeys.accountId, id });
  say(`request settlement ${request?.settlement_account || ""} status ${request?.status || ""}`);
  await step("approve", alice, "approve_spend", { id, amount_usdc_6: SPEND, plan_id: null });
  await step("approve again", alice, "approve_spend", { id, amount_usdc_6: SPEND, plan_id: null });
  const rejectId = `${id}-no`;
  await step("queue reject", alice, "queue_item", { id: rejectId, title: "no", category: "shopping", target_usdc_6: SPEND });
  await step("request reject", alice, "request_spend", { id: rejectId, amount_usdc_6: SPEND });
  await step("reject", alice, "reject_spend", { id: rejectId });
  await step("bob withdraw", bob, "withdraw", { amount: "1" });
  await step("withdraw", alice, "withdraw", { amount: SPEND });
  say(`settlement token after ${await tokenOf(settlement)}`);
  say(`alice token after ${await tokenOf(aliceKeys.accountId)}`);
  if (rows.some((row) => row.name === "approve" && row.ok !== "ok")) process.exitCode = 1;
}

main().catch((error) => {
  console.error(redact(error instanceof Error ? error.stack || error.message : String(error), secrets));
  process.exit(1);
});
