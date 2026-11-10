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
import { getOrCreateFunctionCallKey } from "./local-access-key";
import {
  BLOCK_HEIGHT_TTL,
  DEFAULT_FUNCTION_GAS,
  LOCAL_KEY_ALLOWANCE_YOCTO,
  POLICY_METHODS,
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
  detailCode?: "owner-only" | "demo" | "not-testnet" | "unavailable";
  detail?: string;
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

function readHash(outcome: unknown): string | undefined {
  if (!outcome || typeof outcome !== "object") return undefined;
  const record = outcome as {
    transaction?: { hash?: string };
    transaction_outcome?: { id?: string };
  };
  const hash = record.transaction?.hash || record.transaction_outcome?.id;
  return hash && /^[1-9A-HJ-NP-Za-km-z]{32,64}$/.test(hash) ? hash : undefined;
}

async function nearRuntime(): Promise<NearRuntime> {
  return (await import("near-api-js")) as unknown as NearRuntime;
}

async function relayerConfigured(): Promise<boolean> {
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

async function signWithWallet(
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

async function signWithLocalKey(
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
          [...POLICY_METHODS],
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

async function postDelegate(signedDelegate: string): Promise<ChainResult> {
  const res = await fetch("/api/relay", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ signedDelegate }),
  });
  const body = (await res.json().catch(() => ({}))) as {
    error?: string;
    txHash?: string;
    explorerUrl?: string;
    success?: boolean;
  };
  if (res.status === 503) return skipped("unavailable", body.error || "relayer not configured");
  if (!res.ok || !body.txHash) {
    return { ok: false, mode: "skipped", detail: body.error || "relay failed", detailCode: "unavailable" };
  }
  return {
    ok: true,
    mode: "gasless",
    txHash: body.txHash,
    explorerUrl: body.explorerUrl || explorerTxUrl(body.txHash),
    success: body.success !== false,
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
  try {
    const outcome = await wallet.signAndSendTransaction({
      signerId: accountId,
      receiverId,
      actions: callActions,
    });
    const txHash = readHash(outcome);
    return {
      ok: Boolean(txHash),
      mode: txHash ? "user-paid" : "skipped",
      txHash,
      explorerUrl: txHash ? explorerTxUrl(txHash) : undefined,
      success: Boolean(txHash),
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

export async function submitContractCalls(
  calls: ContractCall[],
  opts: { accountId: string | null; demoMode: boolean },
): Promise<ChainResult> {
  const blocked = canAttempt(opts.accountId, opts.demoMode);
  if (blocked) return blocked;
  if (!calls.length) return skipped("unavailable");
  const receiverId = calls[0].receiverId;
  if (!receiverId || calls.some((call) => call.receiverId !== receiverId)) {
    return skipped("unavailable", "a relayed delegate has one receiver");
  }
  const accountId = opts.accountId as string;

  let near: NearRuntime;
  try {
    near = await nearRuntime();
  } catch (error) {
    return skipped("unavailable", error instanceof Error ? error.message : "near-api-js unavailable");
  }
  const callActions = calls.map((call) =>
    near.actions.functionCall(
      call.methodName,
      call.args,
      call.gas ?? DEFAULT_FUNCTION_GAS,
      call.deposit ?? 0n,
    ),
  );
  const wallet = await getSignedInWallet().catch(() => null);

  const configured = await relayerConfigured();
  if (configured) {
    try {
      const signed =
        (wallet ? await signWithWallet(near, wallet, accountId, receiverId, callActions) : null) ??
        (await signWithLocalKey(near, wallet, accountId, receiverId, callActions));
      if (signed) {
        const relayed = await postDelegate(signed);
        if (relayed.ok && relayed.txHash) return relayed;
      }
    } catch {
      /* fall through to a normal transaction */
    }
  }

  return userPays(near, wallet, accountId, receiverId, callActions);
}
