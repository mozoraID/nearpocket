/** Helpers for the testnet escrow proof. Secrets passed in are never returned. */
export function assertTestnet(network) {
  if (network && network !== "testnet") {
    throw new Error("refusing a non-testnet network");
  }
}

export function redact(text, secrets) {
  let out = String(text ?? "");
  for (const secret of secrets) {
    if (typeof secret === "string" && secret.length > 0) out = out.split(secret).join("[redacted]");
  }
  return out;
}

export function readKeyFile(raw) {
  const parsed = JSON.parse(raw);
  const accountId = parsed.account_id || parsed.accountId;
  const privateKey = parsed.private_key || parsed.privateKey;
  if (!accountId || !privateKey) throw new Error("key file needs account_id and private_key");
  return { accountId, privateKey };
}
