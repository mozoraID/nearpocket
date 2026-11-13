"use client";

/**
 * Sign a NEAR meta-transaction and ask our relayer to pay the gas.
 *
 * Wallets: call signDelegateActions when the selected wallet implements it
 * (wallet-selector 10 exposes the singular signDelegateAction on the Signer
 * interface; Meteor, HOT, Intear, and NEAR Mobile in this repo throw
 * "not supported" for that method). When the wallet cannot sign a delegate,
 * a function-call key generated in the browser signs it instead. That key is
 * limited to the agent-policy contract. It has to be registered on the
 * account once; that registration is a normal transaction.
 *
 * If the relayer is not configured, or the relay fails before it is included,
 * the same calls are sent with the wallet so the user pays gas.
 * Demo accounts never leave the device.
 */
import { NEAR_CONFIG, explorerTxUrl } from "./config";
import { confirmNearTransaction } from "./confirm-tx";
import { singleActionTransactions } from "./single-action";
import { getOrCreateFunctionCallKey } from "./local-access-key";
import {
  BLOCK_HEIGHT_TTL,
  DEFAULT_FUNCTION_GAS,
  LOCAL_KEY_ALLOWANCE_YOCTO,
  USER_POLICY_METHODS,
} from "./relay-allowlist";
import { getSignedInWallet, type SelectorWallet } from "./selector";

export interface ContractCall {
  receiverId: string;
  methodName: string;
  args: Record<string, unknown>;
  gas?: bigint;
  deposit?: bigint;
}

export interface ChainResult {
  ok: boolean;
  mode: "gasless" | "user-paid" | "skipped";
  txHash?: string;
  explorerUrl?: string;
  success?: boolean;
  detailCode?:
    | "owner-only"
    | "legacy-contract"
    | "needs-escrow"
    | "request-open"
    | "demo"
    | "not-testnet"
    | "unavailable"
    | "failed";
  detail?: string;
  /** Methods whose final outcome succeeded before a later step failed. */
  completedMethods?: string[];
  /** One hash per signed transaction, in order. */
  steps?: { methodName: string; txHash: string; ok: boolean }[];
}

interface NearRuntime {
  actions: {
    functionCall: (
      methodName: string,
      args: object,
      gas: bigint,
      deposit: bigint,
    ) => unknown;
    addFunctionCallAccessKey: (
      publicKey: unknown,
      receiverId: string,
      methodNames: string[],
      allowance?: bigint,
    ) => unknown;
  };
  KeyPair: {
    fromString: (encoded: string) => {
      getPublicKey: () => { toString: () => string };
    };
  };
  PublicKey: {
    fromString: (encoded: string) => unknown;
  };
  KeyPairSigner: { fromSecretKey: (encoded: string) => { signDelegateAction: (action: unknown) => Promise<{ signedDelegate: unknown }> } };
  JsonRpcProvider: new (config: { url: string }) => {
    viewBlock: (query: { finality: "final" }) => Promise<{ header: { height: number } }>;
    viewAccessKey: (args: { accountId: string; publicKey: unknown }) => Promise<{ nonce: number }>;
  };
  buildDelegateAction: (args: {
    actions: unknown[];
    maxBlockHeight: bigint;
    nonce: bigint;
    publicKey: unknown;
    receiverId: string;
    senderId: string;
  }) => unknown;
  encodeSignedDelegate: (signed: unknown) => Uint8Array;
}

function skipped(detailCode: ChainResult["detailCode"], detail?: string): ChainResult {
  return { ok: false, mode: "skipped", detailCode, detail };
}

function canAttempt(accountId: string | null, demoMode: boolean): ChainResult | null {
  if (NEAR_CONFIG.networkId !== "testnet") return skipped("not-testnet");
  if (demoMode || !accountId || accountId === "demo.local") return skipped("demo");
  if (accountId.endsWith(".near")) return skipped("not-testnet");
  return null;
}

function unsupported(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /not supported/i.test(message);
}

function bytesToBase64(bytes: Uint8Array): string {
  let text = "";
  bytes.forEach((byte) => {
    text += String.fromCharCode(byte);
  });
  return btoa(text);
}

const TX_HASH = /^[1-9A-HJ-NP-Za-km-z]{32,64}$/;

export function readTxHash(outcome: unknown): string | undefined {
  if (typeof outcome === "string") {
    const first = outcome.split(",")[0]?.trim();
    return first && TX_HASH.test(first) ? first : undefined;
  }
  if (Array.isArray(outcome)) {
    for (const item of outcome) {
      const found = readTxHash(item);
      if (found) return found;
    }
    return undefined;
  }
  if (!outcome || typeof outcome !== "object") return undefined;
  const record = outcome as Record<string, unknown>;
  for (const key of ["transactionHashes", "txHash", "hash", "id"]) {
    const found = readTxHash(record[key]);
    if (found) return found;
  }
  return readTxHash(record.transaction) || readTxHash(record.transaction_outcome);
}

async function nearRuntime(): Promise<NearRuntime> {
  return (await import("near-api-js")) as unknown as NearRuntime;
}

export async function relayerConfigured(): Promise<boolean> {
  try {
    const res = await fetch("/api/relay");
    if (!res.ok) return false;
    const body = (await res.json()) as { configured?: boolean };
    return body.configured === true;
  } catch {
    return false;
  }
}

function coerceSigned(value: unknown): unknown | null {
  if (!value) return null;
  if (typeof value === "string" || value instanceof Uint8Array) return value;
  if (Array.isArray(value)) {
    if (value.length === 2 && value[1] && typeof value[1] === "object") {
      const second = coerceSigned(value[1]);
      if (second) return second;
    }
    return coerceSigned(value[0]);
  }
  if (typeof value === "object") {
    const record = value as { signedDelegate?: unknown; delegateAction?: unknown; signature?: unknown };
    if (record.signedDelegate) return record.signedDelegate;
    if (record.delegateAction && record.signature) return value;
  }
  return null;
}

async function encodeForRelay(near: NearRuntime, signed: unknown): Promise<string | null> {
  const coerced = coerceSigned(signed);
  if (!coerced) return null;
  if (typeof coerced === "string") return coerced;
  if (coerced instanceof Uint8Array) return bytesToBase64(coerced);
  try {
    return bytesToBase64(near.encodeSignedDelegate(coerced));
  } catch {
    return null;
  }
}

async function walletPublicKey(wallet: SelectorWallet, near: NearRuntime): Promise<unknown | null> {
  try {
    if (wallet.getPublicKey) {
      const key = await wallet.getPublicKey();
      if (typeof key === "string") {
        const encoded = key.includes(":") ? key : `ed25519:${key}`;
        return near.PublicKey.fromString(encoded);
      }
      if (key && typeof key === "object" && "toString" in key) return key;
    }
  } catch (error) {
    if (!unsupported(error)) return null;
  }
  try {
    const accounts = await wallet.getAccounts?.();
    const encoded = accounts?.[0]?.publicKey;
    if (encoded) return near.PublicKey.fromString(encoded.includes(":") ? encoded : `ed25519:${encoded}`);
  } catch {
    /* the wallet did not share a public key */
  }
  return null;
}

async function accessKeyNonce(
  provider: InstanceType<NearRuntime["JsonRpcProvider"]>,
  accountId: string,
  publicKey: unknown,
): Promise<bigint | null> {
  try {
    const view = await provider.viewAccessKey({ accountId, publicKey });
    return BigInt(view.nonce);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/does not exist|unknown access key|not found/i.test(message)) return null;
    throw error;
  }
}

async function buildSignedDelegate(
  near: NearRuntime,
  opts: {
    accountId: string;
    receiverId: string;
    actions: unknown[];
    publicKey: unknown;
    secretKey: string;
    nonce: bigint;
    blockHeight: bigint;
  },
): Promise<string> {
  const delegate = near.buildDelegateAction({
    senderId: opts.accountId,
    receiverId: opts.receiverId,
    actions: opts.actions,
    nonce: opts.nonce + 1n,
    maxBlockHeight: opts.blockHeight + BLOCK_HEIGHT_TTL,
    publicKey: opts.publicKey,
  });
  const signer = near.KeyPairSigner.fromSecretKey(opts.secretKey);
  const { signedDelegate } = await signer.signDelegateAction(delegate);
  const encoded = await encodeForRelay(near, signedDelegate);
  if (!encoded) throw new Error("could not encode the signed delegate");
  return encoded;
}

export async function signWithWallet(
  near: NearRuntime,
  wallet: SelectorWallet,
  accountId: string,
  receiverId: string,
  callActions: unknown[],
): Promise<string | null> {
  if (typeof wallet.signDelegateActions === "function") {
    try {
      const signed = await wallet.signDelegateActions({
        transactions: [{ signerId: accountId, receiverId, actions: callActions }],
      });
      const encoded = await encodeForRelay(near, signed);
      if (encoded) return encoded;
    } catch (error) {
      if (!unsupported(error)) return null;
    }
  }
  if (typeof wallet.signDelegateAction !== "function") return null;
  const publicKey = await walletPublicKey(wallet, near);
  if (!publicKey) return null;
  const provider = new near.JsonRpcProvider({ url: NEAR_CONFIG.nodeUrl });
  try {
    const nonce = await accessKeyNonce(provider, accountId, publicKey);
    if (nonce == null) return null;
    const block = await provider.viewBlock({ finality: "final" });
    const delegate = near.buildDelegateAction({
      senderId: accountId,
      receiverId,
      actions: callActions,
      nonce: nonce + 1n,
      maxBlockHeight: BigInt(block.header.height) + BLOCK_HEIGHT_TTL,
      publicKey,
    });
    const signed = await wallet.signDelegateAction(delegate);
    return encodeForRelay(near, signed);
  } catch (error) {
    if (unsupported(error)) return null;
    return null;
  }
}

export async function signWithLocalKey(
  near: NearRuntime,
  wallet: SelectorWallet | null,
  accountId: string,
  receiverId: string,
  callActions: unknown[],
): Promise<string | null> {
  if (receiverId !== NEAR_CONFIG.agentPolicyContract) return null;
  const record = await getOrCreateFunctionCallKey(accountId, receiverId);
  const keyPair = near.KeyPair.fromString(record.secretKey);
  const provider = new near.JsonRpcProvider({ url: NEAR_CONFIG.nodeUrl });
  let nonce = await accessKeyNonce(provider, accountId, keyPair.getPublicKey());
  if (nonce == null) {
    if (!wallet?.signAndSendTransaction) return null;
    await wallet.signAndSendTransaction({
      signerId: accountId,
      receiverId: accountId,
      actions: [
        near.actions.addFunctionCallAccessKey(
          keyPair.getPublicKey(),
          receiverId,
          [...USER_POLICY_METHODS],
          LOCAL_KEY_ALLOWANCE_YOCTO,
        ),
      ],
    });
    nonce = await accessKeyNonce(provider, accountId, keyPair.getPublicKey());
    if (nonce == null) return null;
  }
  const block = await provider.viewBlock({ finality: "final" });
  return buildSignedDelegate(near, {
    accountId,
    receiverId,
    actions: callActions,
    publicKey: keyPair.getPublicKey(),
    secretKey: record.secretKey,
    nonce,
    blockHeight: BigInt(block.header.height),
  });
}

export async function postDelegate(signedDelegate: string): Promise<ChainResult> {
  const res = await fetch("/api/relay", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ signedDelegate }),
  });
  const body = (await res.json().catch(() => ({}))) as {
    error?: string;
    detail?: string;
    txHash?: string;
    explorerUrl?: string;
    success?: boolean;
  };
  if (res.status === 503) return skipped("unavailable", body.error || "relayer not configured");
  if (!res.ok || !body.txHash) {
    return { ok: false, mode: "skipped", detail: body.error || "relay failed", detailCode: "unavailable" };
  }
  const succeeded = body.success !== false;
  return {
    ok: succeeded,
    mode: "gasless",
    txHash: body.txHash,
    explorerUrl: body.explorerUrl || explorerTxUrl(body.txHash),
    success: succeeded,
    detail: succeeded ? undefined : body.detail || body.error,
    detailCode: succeeded ? undefined : "failed",
  };
}

async function userPays(
  near: NearRuntime,
  wallet: SelectorWallet | null,
  accountId: string,
  receiverId: string,
  callActions: unknown[],
): Promise<ChainResult> {
  if (!wallet?.signAndSendTransaction) return skipped("unavailable");
  if (callActions.length !== 1) {
    return {
      ok: false,
      mode: "skipped",
      detailCode: "unavailable",
      detail: "a policy transaction must contain one action",
    };
  }
  try {
    const outcome = await wallet.signAndSendTransaction({
      signerId: accountId,
      receiverId,
      actions: callActions,
    });
    const txHash = readTxHash(outcome);
    if (!txHash) {
      return { ok: false, mode: "skipped", detailCode: "unavailable", detail: "no transaction hash" };
    }
    const verdict = await confirmNearTransaction(txHash, accountId);
    return {
      ok: verdict.ok,
      mode: "user-paid",
      txHash,
      explorerUrl: explorerTxUrl(txHash),
      success: verdict.ok,
      detail: verdict.ok ? undefined : verdict.error,
      detailCode: verdict.ok ? undefined : "failed",
    };
  } catch (error) {
    return {
      ok: false,
      mode: "skipped",
      detail: error instanceof Error ? error.message : "wallet rejected the transaction",
      detailCode: "unavailable",
    };
  }
}

/** Each call is its own transaction. A function-call access key allows one FunctionCall action. */
export async function sendWalletCalls(opts: {
  accountId: string;
  receiverId: string;
  calls: ContractCall[];
}): Promise<ChainResult> {
  const blocked = canAttempt(opts.accountId, false);
  if (blocked) return blocked;
  let near: NearRuntime;
  try {
    near = await nearRuntime();
  } catch (error) {
    return skipped("unavailable", error instanceof Error ? error.message : "near-api-js unavailable");
  }
  const wallet = await getSignedInWallet().catch(() => null);
  return runOneActionAtATime(near, wallet, opts.accountId, opts.calls);
}

export async function submitContractCalls(
  calls: ContractCall[],
  opts: { accountId: string | null; demoMode: boolean },
): Promise<ChainResult> {
  const blocked = canAttempt(opts.accountId, opts.demoMode);
  if (blocked) return blocked;
  if (!calls.length) return skipped("unavailable");
  const accountId = opts.accountId as string;

  let near: NearRuntime;
  try {
    near = await nearRuntime();
  } catch (error) {
    return skipped("unavailable", error instanceof Error ? error.message : "near-api-js unavailable");
  }
  const wallet = await getSignedInWallet().catch(() => null);
  // A function-call key may sign exactly one FunctionCall action. Queue and
  // request are two transactions, and the second is sent only after the first
  // receipt outcome succeeds.
  return runOneActionAtATime(near, wallet, accountId, calls);
}

async function runOneActionAtATime(
  near: NearRuntime,
  wallet: SelectorWallet | null,
  accountId: string,
  calls: ContractCall[],
): Promise<ChainResult> {
  const batches = singleActionTransactions(calls);
  const completed: string[] = [];
  const steps: { methodName: string; txHash: string; ok: boolean }[] = [];
  let last: ChainResult = skipped("unavailable");
  for (const batch of batches) {
    if (batch.length !== 1) {
      return {
        ok: false,
        mode: "skipped",
        detailCode: "unavailable",
        detail: "a policy transaction must contain one action",
        completedMethods: completed,
        steps,
      };
    }
    const call = batch[0];
    const action = near.actions.functionCall(
      call.methodName,
      call.args,
      call.gas ?? DEFAULT_FUNCTION_GAS,
      call.deposit ?? 0n,
    );
    last = await userPays(near, wallet, accountId, call.receiverId, [action]);
    const stepOk = Boolean(last.ok && last.success !== false && last.txHash);
    if (last.txHash) steps.push({ methodName: call.methodName, txHash: last.txHash, ok: stepOk });
    if (!stepOk) {
      const why = last.detail || "transaction failed";
      return {
        ...last,
        ok: false,
        success: false,
        detailCode: last.detailCode || "failed",
        detail: completed.length ? `${call.methodName}: ${why}` : why,
        completedMethods: completed,
        steps,
      };
    }
    completed.push(call.methodName);
    last = { ...last, completedMethods: [...completed], steps: [...steps] };
  }
  return last;
}
