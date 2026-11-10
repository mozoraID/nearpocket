/**
 * Decode a base64 Borsh SignedDelegate and decide whether the relayer may
 * forward it. No network calls and no keys live here.
 */
import { deserialize, type Schema } from "borsh";
import { sha256 } from "@noble/hashes/sha2.js";
import * as near from "near-api-js";
import {
  MAX_ACTIONS,
  MAX_ARGS_BYTES,
  MAX_BLOCK_HORIZON,
  MAX_GAS_PER_ACTION,
  MAX_TOTAL_DEPOSIT_YOCTO,
  ONE_YOCTO_METHODS,
  isOwnerOnlyMethod,
  isPolicyMethod,
  isTokenMethod,
} from "./relay-allowlist";

export class RelayValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RelayValidationError";
  }
}

export interface RelayPolicyConfig {
  /** Must be "testnet". Any other value is refused. */
  networkId: string;
  contractId: string;
  usdcContractId: string;
  /** Latest block height the relayer has observed. */
  currentBlockHeight: bigint;
}

export interface ValidatedFunctionCall {
  methodName: string;
  args: Uint8Array;
  gas: bigint;
  deposit: bigint;
}

export interface ValidatedDelegate {
  senderId: string;
  receiverId: string;
  publicKey: string;
  nonce: bigint;
  maxBlockHeight: bigint;
  calls: ValidatedFunctionCall[];
  /** True when any call is owner-only on the agent-policy contract. */
  needsOwner: boolean;
  /** Original decoded value, suitable for actions.signedDelegate. */
  signedDelegate: unknown;
}

interface NearRuntime {
  SCHEMA: { SignedDelegate: object };
  encodeDelegateAction: (delegate: unknown) => Uint8Array;
  encodeSignedDelegate: (signed: unknown) => Uint8Array;
  DelegateAction: new (args: {
    senderId: string;
    receiverId: string;
    actions: unknown[];
    nonce: bigint;
    maxBlockHeight: bigint;
    publicKey: unknown;
  }) => unknown;
  PublicKey: {
    from: (value: unknown) => {
      keyType: number;
      data: Uint8Array;
      toString: () => string;
      verify: (message: Uint8Array, signature: Uint8Array) => boolean;
    };
  };
}

const runtime = near as unknown as NearRuntime;

interface DecodedFunctionCall {
  methodName: string;
  args: ArrayLike<number> | Uint8Array;
  gas: bigint | number | string;
  deposit: bigint | number | string;
}

interface DecodedAction {
  enum?: string;
  functionCall?: DecodedFunctionCall;
  [key: string]: unknown;
}

interface DecodedDelegateAction {
  senderId: string;
  receiverId: string;
  actions: DecodedAction[];
  nonce: bigint | number | string;
  maxBlockHeight: bigint | number | string;
  publicKey: unknown;
}

interface DecodedSignedDelegate {
  delegateAction: DecodedDelegateAction;
  signature: unknown;
}

const NAMED_ACCOUNT = /^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/;
const IMPLICIT_ACCOUNT = /^[0-9a-f]{64}$/;

function asBigint(value: bigint | number | string, label: string): bigint {
  try {
    const n = typeof value === "bigint" ? value : BigInt(value);
    if (n < 0n) throw new Error("negative");
    return n;
  } catch {
    throw new RelayValidationError(`${label} is not a valid unsigned integer`);
  }
}

function actionKind(action: DecodedAction): string {
  if (action.enum && action[action.enum] != null) return action.enum;
  const keys = Object.keys(action).filter((key) => key !== "enum" && action[key] != null);
  if (keys.length !== 1) throw new RelayValidationError("unrecognized action");
  return keys[0];
}

function toBytes(value: ArrayLike<number> | Uint8Array, label: string): Uint8Array {
  const bytes = value instanceof Uint8Array ? value : Uint8Array.from(value);
  if (bytes.length > MAX_ARGS_BYTES) {
    throw new RelayValidationError(`${label} is larger than ${MAX_ARGS_BYTES} bytes`);
  }
  return bytes;
}

function assertTestnetSender(senderId: string): void {
  if (typeof senderId !== "string" || senderId.length < 2 || senderId.length > 64) {
    throw new RelayValidationError("sender account id is invalid");
  }
  if (senderId.endsWith(".near") || senderId === "near") {
    throw new RelayValidationError("mainnet account ids are refused");
  }
  if (senderId.endsWith(".testnet")) {
    if (!NAMED_ACCOUNT.test(senderId)) throw new RelayValidationError("sender account id is invalid");
    return;
  }
  if (!IMPLICIT_ACCOUNT.test(senderId)) {
    throw new RelayValidationError("sender must be a testnet named account or an implicit account");
  }
}

function readPublicKey(raw: unknown) {
  let publicKey;
  try {
    publicKey = runtime.PublicKey.from(raw);
  } catch {
    throw new RelayValidationError("public key format is invalid");
  }
  // KeyType.ED25519 is 0. Function-call keys we accept are ed25519 only.
  if (publicKey.keyType !== 0 || publicKey.data.length !== 32) {
    throw new RelayValidationError("public key must be ed25519");
  }
  const text = publicKey.toString();
  if (!text.startsWith("ed25519:")) {
    throw new RelayValidationError("public key must be ed25519");
  }
  return publicKey;
}

function signatureBytes(signature: unknown): Uint8Array {
  if (!signature || typeof signature !== "object") {
    throw new RelayValidationError("signature must be ed25519");
  }
  const record = signature as {
    ed25519Signature?: { data?: ArrayLike<number> };
    data?: ArrayLike<number>;
    enum?: string;
  };
  const data =
    record.ed25519Signature?.data ??
    (record.enum === "ed25519Signature" ? record.data : undefined);
  if (!data) throw new RelayValidationError("signature must be ed25519");
  const bytes = Uint8Array.from(data);
  if (bytes.length !== 64) throw new RelayValidationError("signature must be 64 bytes");
  return bytes;
}

function assertNetwork(networkId: string): void {
  if ((networkId || "").trim().toLowerCase() !== "testnet") {
    throw new RelayValidationError("relayer refuses to run unless networkId is testnet");
  }
}

export function decodeSignedDelegate(bytes: Uint8Array): DecodedSignedDelegate {
  if (!(bytes instanceof Uint8Array) || bytes.length === 0 || bytes.length > 20_000) {
    throw new RelayValidationError("signed delegate payload is empty or too large");
  }
  try {
    return deserialize(runtime.SCHEMA.SignedDelegate as Schema, bytes) as DecodedSignedDelegate;
  } catch {
    throw new RelayValidationError("signed delegate is not valid Borsh");
  }
}

export function encodeSignedDelegateBase64(signedDelegate: unknown): string {
  const bytes = runtime.encodeSignedDelegate(signedDelegate);
  return Buffer.from(bytes).toString("base64");
}

/**
 * Accept an allowlisted function-call delegate. Reject every other action
 * kind, the wrong receiver or method, an expired max_block_height, a bad
 * nonce or public key, and any deposit or gas over the cap.
 */
export function validateSignedDelegate(
  bytes: Uint8Array,
  config: RelayPolicyConfig,
): ValidatedDelegate {
  assertNetwork(config.networkId);
  const decoded = decodeSignedDelegate(bytes);
  const delegate = decoded.delegateAction;
  if (!delegate || !Array.isArray(delegate.actions)) {
    throw new RelayValidationError("delegate action is missing");
  }

  assertTestnetSender(delegate.senderId);
  if (typeof delegate.receiverId !== "string" || !delegate.receiverId) {
    throw new RelayValidationError("receiver is missing");
  }

  const contractId = config.contractId.trim();
  const usdcContractId = config.usdcContractId.trim();
  const toPolicy = Boolean(contractId) && delegate.receiverId === contractId;
  const toToken = Boolean(usdcContractId) && delegate.receiverId === usdcContractId;
  if (!toPolicy && !toToken) {
    throw new RelayValidationError("receiver is not an allowlisted contract");
  }

  if (delegate.actions.length === 0 || delegate.actions.length > MAX_ACTIONS) {
    throw new RelayValidationError("delegate must contain 1 to 8 actions");
  }

  const nonce = asBigint(delegate.nonce, "nonce");
  if (nonce === 0n) throw new RelayValidationError("nonce must be greater than zero");

  const maxBlockHeight = asBigint(delegate.maxBlockHeight, "max_block_height");
  if (maxBlockHeight === 0n) throw new RelayValidationError("max_block_height is missing");
  const current = config.currentBlockHeight;
  if (current > maxBlockHeight) {
    throw new RelayValidationError("delegate max_block_height has expired");
  }
  if (maxBlockHeight > current + MAX_BLOCK_HORIZON) {
    throw new RelayValidationError("delegate max_block_height is too far in the future");
  }

  const publicKey = readPublicKey(delegate.publicKey);
  const signature = signatureBytes(decoded.signature);
  const signedBytes = runtime.encodeDelegateAction(
    new runtime.DelegateAction({
      senderId: delegate.senderId,
      receiverId: delegate.receiverId,
      actions: delegate.actions,
      nonce,
      maxBlockHeight,
      publicKey,
    }),
  );
  const hash = sha256(signedBytes);
  if (!publicKey.verify(hash, signature)) {
    throw new RelayValidationError("delegate signature does not match the public key");
  }

  const calls: ValidatedFunctionCall[] = [];
  let totalDeposit = 0n;
  let needsOwner = false;

  for (const action of delegate.actions) {
    const kind = actionKind(action);
    if (kind !== "functionCall" || !action.functionCall) {
      throw new RelayValidationError(`action type ${kind} is not allowed`);
    }
    const call = action.functionCall;
    const methodName = call.methodName;
    if (typeof methodName !== "string" || !methodName) {
      throw new RelayValidationError("function call is missing a method name");
    }
    if (toPolicy && !isPolicyMethod(methodName)) {
      throw new RelayValidationError(`method ${methodName} is not allowlisted on the policy contract`);
    }
    if (toToken && !isTokenMethod(methodName)) {
      throw new RelayValidationError(`method ${methodName} is not allowlisted on the token contract`);
    }
    const gas = asBigint(call.gas, "gas");
    if (gas === 0n || gas > MAX_GAS_PER_ACTION) {
      throw new RelayValidationError("gas per action exceeds the cap");
    }
    const deposit = asBigint(call.deposit, "deposit");
    if (ONE_YOCTO_METHODS.has(methodName)) {
      if (deposit !== 0n && deposit !== 1n) {
        throw new RelayValidationError("ft_transfer deposit must be 0 or 1 yoctoNEAR");
      }
    } else if (deposit !== 0n) {
      throw new RelayValidationError("attached deposit is above the cap");
    }
    totalDeposit += deposit;
    if (totalDeposit > MAX_TOTAL_DEPOSIT_YOCTO) {
      throw new RelayValidationError("total attached deposit is above 1 yoctoNEAR");
    }
    if (toPolicy && isOwnerOnlyMethod(methodName)) needsOwner = true;
    calls.push({
      methodName,
      args: toBytes(call.args ?? [], "arguments"),
      gas,
      deposit,
    });
  }

  return {
    senderId: delegate.senderId,
    receiverId: delegate.receiverId,
    publicKey: publicKey.toString(),
    nonce,
    maxBlockHeight,
    calls,
    needsOwner,
    signedDelegate: decoded,
  };
}

export function signedDelegateFromBase64(payload: string): Uint8Array {
  if (typeof payload !== "string" || !payload.trim()) {
    throw new RelayValidationError("signedDelegate is required");
  }
  const trimmed = payload.trim();
  if (trimmed.length > 40_000 || !/^[A-Za-z0-9+/_=-]+$/.test(trimmed)) {
    throw new RelayValidationError("signedDelegate must be base64");
  }
  const bytes = Buffer.from(trimmed, "base64");
  if (bytes.length === 0) throw new RelayValidationError("signedDelegate is empty");
  return new Uint8Array(bytes);
}
