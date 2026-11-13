/**
 * A function-call key generated in the browser and kept on this device.
 * It is created only for the signed-in testnet account and the agent-policy
 * contract. The secret never goes to the server. The chain accepts signatures
 * from it only after the account has registered this public key, which the
 * gasless client does once with the connected wallet (that registration is
 * a normal transaction, so the user pays gas for it).
 */
import { USER_POLICY_METHODS } from "./relay-allowlist";

const STORAGE = "nearpocket-fc-access-key-v2";

export interface LocalFunctionCallKey {
  accountId: string;
  contractId: string;
  publicKey: string;
  secretKey: string;
  methodNames: readonly string[];
  createdAt: string;
}

export function loadFunctionCallKey(accountId: string, contractId: string): LocalFunctionCallKey | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LocalFunctionCallKey;
    if (parsed.accountId !== accountId || parsed.contractId !== contractId) return null;
    if (!parsed.publicKey?.startsWith("ed25519:") || !parsed.secretKey?.startsWith("ed25519:")) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function getOrCreateFunctionCallKey(
  accountId: string,
  contractId: string,
): Promise<LocalFunctionCallKey> {
  const existing = loadFunctionCallKey(accountId, contractId);
  if (existing) return existing;
  const { KeyPair } = await import("near-api-js");
  const key = KeyPair.fromRandom("ed25519");
  const record: LocalFunctionCallKey = {
    accountId,
    contractId,
    publicKey: key.getPublicKey().toString(),
    secretKey: key.toString(),
    methodNames: USER_POLICY_METHODS,
    createdAt: new Date().toISOString(),
  };
  localStorage.setItem(STORAGE, JSON.stringify(record));
  return record;
}

export function clearFunctionCallKey() {
  try {
    localStorage.removeItem(STORAGE);
  } catch {
    /* ignore */
  }
}
