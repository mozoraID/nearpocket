/**
 * Server-side relayer. Credentials are read from RELAYER_ACCOUNT_ID and
 * RELAYER_PRIVATE_KEY only. They are never logged and never returned.
 */
import { Account, JsonRpcProvider, actions } from "near-api-js";
import deployed from "@/config/deployed.json";
import { DEFAULT_USDC_CONTRACT_ID } from "./relay-allowlist";
import { configuredNetworkId } from "./relay-env";
import { checkAndRecordSender } from "./relay-limits";
import {
  RelayValidationError,
  validateSignedDelegate,
  type ValidatedDelegate,
} from "./relay-policy";
import { verdictFromExecutionOutcome } from "./tx-outcome";

export { configuredNetworkId } from "./relay-env";

export class RelayHttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "RelayHttpError";
    this.status = status;
  }
}

const TESTNET_RPC = "https://rpc.testnet.near.org";
const TESTNET_EXPLORER = "https://testnet.nearblocks.io";

export function configuredContractId(): string {
  return (
    process.env.NEAR_CONTRACT_ID ||
    process.env.NEXT_PUBLIC_AGENT_POLICY_CONTRACT ||
    deployed.contractId ||
    ""
  ).trim();
}

export function configuredUsdcContractId(): string {
  return (
    process.env.NEAR_USDC_CONTRACT_ID ||
    process.env.NEXT_PUBLIC_USDC_CONTRACT ||
    DEFAULT_USDC_CONTRACT_ID
  ).trim();
}

export function relayerIsConfigured(): boolean {
  return Boolean(process.env.RELAYER_ACCOUNT_ID?.trim() && process.env.RELAYER_PRIVATE_KEY?.trim());
}

function assertTestnetNetwork(): void {
  const networkId = configuredNetworkId();
  if (networkId !== "testnet") {
    throw new RelayHttpError(403, "relayer refuses to run unless networkId is testnet");
  }
  const rpc = process.env.NEAR_RPC_URL || "";
  if (rpc && !rpc.includes("testnet")) {
    throw new RelayHttpError(403, "relayer refuses a non-testnet RPC");
  }
}

function rpcUrl(): string {
  assertTestnetNetwork();
  return process.env.NEAR_RPC_URL || TESTNET_RPC;
}

function loadRelayer(): { accountId: string; privateKey: `ed25519:${string}` } {
  assertTestnetNetwork();
  const accountId = process.env.RELAYER_ACCOUNT_ID?.trim() || "";
  const privateKey = process.env.RELAYER_PRIVATE_KEY?.trim() || "";
  if (!accountId || !privateKey) {
    throw new RelayHttpError(503, "relayer not configured");
  }
  if (!accountId.endsWith(".testnet")) {
    throw new RelayHttpError(403, "relayer account must be a testnet account");
  }
  if (!privateKey.startsWith("ed25519:")) {
    throw new RelayHttpError(503, "relayer key invalid");
  }
  return { accountId, privateKey: privateKey as `ed25519:${string}` };
}

async function rpcCall<T>(method: string, params: unknown): Promise<T> {
  const res = await fetch(rpcUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: "nearpocket-relay", method, params }),
  });
  const data = (await res.json()) as { error?: { message?: string }; result?: T };
  if (!res.ok || data.error) {
    throw new RelayHttpError(502, data.error?.message || "testnet RPC failed");
  }
  return data.result as T;
}

export async function currentBlockHeight(): Promise<bigint> {
  const result = await rpcCall<{ header?: { height?: number } }>("block", { finality: "final" });
  const height = result?.header?.height;
  if (typeof height !== "number" || height < 0) {
    throw new RelayHttpError(502, "could not read the testnet block height");
  }
  return BigInt(height);
}

let ownerCache: { contractId: string; owner: string; at: number } | null = null;

export async function fetchPolicyOwner(contractId: string): Promise<string> {
  if (ownerCache && ownerCache.contractId === contractId && Date.now() - ownerCache.at < 60_000) {
    return ownerCache.owner;
  }
  const args = Buffer.from("{}").toString("base64");
  const result = await rpcCall<{ result?: number[] }>("query", {
    request_type: "call_function",
    finality: "final",
    account_id: contractId,
    method_name: "get_config",
    args_base64: args,
  });
  const bytes = result?.result;
  if (!bytes?.length) throw new RelayHttpError(400, "could not confirm the contract admin");
  let parsed: { owner?: unknown };
  try {
    parsed = JSON.parse(Buffer.from(bytes).toString("utf8")) as { owner?: unknown };
  } catch {
    throw new RelayHttpError(400, "could not confirm the contract admin");
  }
  if (typeof parsed.owner !== "string" || !parsed.owner) {
    throw new RelayHttpError(400, "could not confirm the contract admin");
  }
  ownerCache = { contractId, owner: parsed.owner, at: Date.now() };
  return parsed.owner;
}

/** Test hook. Production code does not need to clear this. */
export function clearOwnerCache(): void {
  ownerCache = null;
}

function readOutcome(result: unknown): { txHash: string; success: boolean; detail: string } {
  const verdict = verdictFromExecutionOutcome(result);
  if (!verdict.hash || !/^[1-9A-HJ-NP-Za-km-z]{32,64}$/.test(verdict.hash)) {
    throw new RelayHttpError(502, "relayer did not receive a transaction hash");
  }
  return { txHash: verdict.hash, success: verdict.ok, detail: verdict.error || "" };
}

export interface RelayBroadcast {
  txHash: string;
  explorerUrl: string;
  success: boolean;
  detail: string;
  senderId: string;
  receiverId: string;
  gasCovered: true;
}

/**
 * Validate, then wrap the delegate in one transaction signed by the relayer.
 * The receiver of that outer transaction is the delegate's sender, which is
 * what makes the contract see the user's account as predecessor.
 */
export async function relaySignedDelegate(bytes: Uint8Array): Promise<RelayBroadcast> {
  const relayer = loadRelayer();
  const current = await currentBlockHeight();
  const validated: ValidatedDelegate = validateSignedDelegate(bytes, {
    networkId: configuredNetworkId(),
    contractId: configuredContractId(),
    usdcContractId: configuredUsdcContractId(),
    currentBlockHeight: current,
  });
  if (validated.needsOwner) {
    const owner = await fetchPolicyOwner(validated.receiverId);
    if (validated.senderId !== owner) {
      throw new RelayValidationError(
        "this method is admin-only, and the signing account is not the contract admin",
      );
    }
  }
  const quota = checkAndRecordSender(validated.senderId);
  if (!quota.ok) {
    throw new RelayHttpError(429, quota.reason);
  }

  let account: Account;
  try {
    const provider = new JsonRpcProvider({ url: rpcUrl() });
    account = new Account(relayer.accountId, provider, relayer.privateKey);
  } catch {
    throw new RelayHttpError(503, "relayer key invalid");
  }

  let outcome: unknown;
  try {
    outcome = await account.signAndSendTransaction({
      receiverId: validated.senderId,
      actions: [actions.signedDelegate(validated.signedDelegate as never)],
      waitUntil: "FINAL",
      throwOnFailure: false,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "relay failed";
    if (/ed25519:|private key|secret key/i.test(message)) {
      throw new RelayHttpError(502, "relay failed");
    }
    throw new RelayHttpError(502, message.slice(0, 300));
  }

  const parsed = readOutcome(outcome);
  return {
    txHash: parsed.txHash,
    explorerUrl: `${TESTNET_EXPLORER}/txns/${parsed.txHash}`,
    success: parsed.success,
    detail: parsed.detail,
    senderId: validated.senderId,
    receiverId: validated.receiverId,
    gasCovered: true,
  };
}

export { RelayValidationError };
