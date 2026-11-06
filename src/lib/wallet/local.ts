/**
 * Browser-local NEAR wallet: seed phrase + encrypted secret key in localStorage.
 * Keys NEVER leave the client. Testnet faucet is best-effort.
 */
"use client";

import { generateSeedPhrase, parseSeedPhrase } from "near-seed-phrase";

const STORAGE = "nearpocket-local-wallet-v1";

export interface LocalWalletRecord {
  accountId: string;
  publicKey: string;
  /** AES-GCM ciphertext of ed25519 secret key (base64) */
  encSecret: string;
  /** base64 iv */
  iv: string;
  /** base64 salt for passcode KDF */
  salt: string;
  network: "testnet" | "mainnet";
  createdAt: string;
  /** word count of mnemonic (never store the mnemonic itself after confirm) */
  wordCount: number;
}

export interface GeneratedWallet {
  seedPhrase: string;
  secretKey: string;
  publicKey: string;
  /** NEAR implicit account id (hex of public key without ed25519:) */
  accountId: string;
}

function b64(buf: ArrayBuffer | Uint8Array) {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  u8.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s);
}

function fromB64(s: string) {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Implicit account id from ed25519 public key string (hex of 32-byte key). */
export function implicitAccountId(publicKey: string): string {
  try {
    // Prefer near-api-js PublicKey when available (runtime)
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PublicKey } = require("near-api-js") as { PublicKey: { fromString: (s: string) => { data: Uint8Array } } };
    const pk = PublicKey.fromString(publicKey);
    return Buffer.from(pk.data).toString("hex");
  } catch {
    const raw = publicKey.replace(/^ed25519:/, "");
    try {
      const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
      let num = BigInt(0);
      for (const c of raw) {
        const idx = alphabet.indexOf(c);
        if (idx < 0) throw new Error("bad b58");
        num = num * BigInt(58) + BigInt(idx);
      }
      let hex = num.toString(16);
      if (hex.length % 2) hex = "0" + hex;
      while (hex.length < 64) hex = "0" + hex;
      return hex.slice(-64);
    } catch {
      return raw.toLowerCase().replace(/[^a-f0-9]/g, "").slice(0, 64).padEnd(64, "0");
    }
  }
}

export function generateLocalWallet(): GeneratedWallet {
  const { seedPhrase, secretKey, publicKey } = generateSeedPhrase();
  const accountId = implicitAccountId(publicKey);
  return { seedPhrase, secretKey, publicKey, accountId };
}

export function restoreFromSeed(seedPhrase: string): GeneratedWallet {
  const { secretKey, publicKey } = parseSeedPhrase(seedPhrase.trim());
  return {
    seedPhrase: seedPhrase.trim(),
    secretKey,
    publicKey,
    accountId: implicitAccountId(publicKey),
  };
}

async function deriveKey(passcode: string, salt: Uint8Array) {
  const enc = new TextEncoder();
  const base = await crypto.subtle.importKey(
    "raw",
    enc.encode(passcode),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt as BufferSource, iterations: 120_000, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function saveEncryptedWallet(
  w: GeneratedWallet,
  passcode: string,
  network: "testnet" | "mainnet" = "testnet",
): Promise<LocalWalletRecord> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passcode, salt);
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    new TextEncoder().encode(w.secretKey),
  );
  const rec: LocalWalletRecord = {
    accountId: w.accountId,
    publicKey: w.publicKey,
    encSecret: b64(cipher),
    iv: b64(iv),
    salt: b64(salt),
    network,
    createdAt: new Date().toISOString(),
    wordCount: w.seedPhrase.split(/\s+/).length,
  };
  localStorage.setItem(STORAGE, JSON.stringify(rec));
  return rec;
}

export function loadLocalWalletRecord(): LocalWalletRecord | null {
  try {
    const raw = localStorage.getItem(STORAGE);
    if (!raw) return null;
    return JSON.parse(raw) as LocalWalletRecord;
  } catch {
    return null;
  }
}

export async function unlockSecretKey(passcode: string): Promise<string> {
  const rec = loadLocalWalletRecord();
  if (!rec) throw new Error("No local wallet");
  const key = await deriveKey(passcode, fromB64(rec.salt));
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromB64(rec.iv) as BufferSource },
    key,
    fromB64(rec.encSecret) as BufferSource,
  );
  return new TextDecoder().decode(plain);
}

export function clearLocalWallet() {
  localStorage.removeItem(STORAGE);
}

/** Best-effort testnet faucet for implicit accounts. */
export async function requestTestnetFaucet(accountId: string): Promise<{ ok: boolean; detail: string }> {
  try {
    const res = await fetch("https://near-faucet.io/api/v1/testnet/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ account_id: accountId, amount: "10000000000000000000000000" }),
    });
    const text = await res.text();
    if (!res.ok) return { ok: false, detail: text.slice(0, 200) || `HTTP ${res.status}` };
    return { ok: true, detail: text.slice(0, 200) || "ok" };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : "faucet unreachable" };
  }
}

export function pickConfirmIndices(wordCount = 12): number[] {
  const idxs = new Set<number>();
  while (idxs.size < 3) idxs.add(Math.floor(Math.random() * wordCount));
  return [...idxs].sort((a, b) => a - b);
}
