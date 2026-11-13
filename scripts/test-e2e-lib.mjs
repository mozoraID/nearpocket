import assert from "node:assert/strict";
import { assertTestnet, readKeyFile, redact } from "./e2e-escrow-lib.mjs";

assert.doesNotThrow(() => assertTestnet("testnet"));
assert.throws(() => assertTestnet("mainnet"), /non-testnet/);
const secret = "ed25519:super-secret-key";
assert.equal(redact(`failed with ${secret}`, [secret]), "failed with [redacted]");
assert.equal(redact("plain", [secret]), "plain");
const parsed = readKeyFile(JSON.stringify({ account_id: "alice.testnet", private_key: secret }));
assert.equal(parsed.accountId, "alice.testnet");
assert.equal(parsed.privateKey, secret);
assert.throws(() => readKeyFile("{}"), /account_id/);
console.log("e2e lib ok");
