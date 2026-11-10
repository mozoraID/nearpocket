# NearPocket agent-policy contract

On-chain spend limits + waitlist for the autonomous shopping agent.

## What it enforces

- `daily_limit_usdc_6` / `per_item_max_usdc_6`
- `require_approval` — agent can only mark `awaiting_approval`; owner must `approve_spend`
- `paused` kill switch

## Deploy (testnet)

```bash
# needs Rust + cargo-near + a funded testnet account
cargo near build
cargo near deploy build-non-reproducible-wasm <account.testnet> \
  network-config testnet \
  sign-with-keychain \
  send
```

Then set `NEXT_PUBLIC_AGENT_POLICY_CONTRACT=<account.testnet>` in Vercel / `.env.local`.

The web app mirrors this policy in TypeScript so the demo runs with **zero secrets** and no deployed contract.

## Tests

Unit tests use the near-sdk mock VM (no sandbox binary, no network):

```bash
npm run test:contract
```

That runs `cargo test` in this directory. Rust **1.85+** is required (`near-sys` 0.2.14 uses edition 2024). `rustup` users get `cargo +stable` automatically from `scripts/test-contract.sh`.

Covered:

- approval gate (`request_spend` → `awaiting_approval`, spent stays 0 until `approve_spend`)
- access control (a non-owner cannot `set_policy` or `approve_spend`)
- per-item max
- daily limit reset on the next UTC day
- rejection when a second spend would pass the daily limit

GitHub Actions runs the same `cargo test`. These are not near-workspaces sandbox tests; the mock VM is enough for the policy asserts and runs in CI without downloading a NEAR node.

## Testnet demo

Default target is the deployed contract `nearly-7b1462.testnet` (override with `NEAR_CONTRACT_ID` or `--contract id.testnet`). The signer must be that contract's owner, because `queue_item` and `approve_spend` check `predecessor == owner`. As deployed, the owner is `nearly-7b1462.testnet`.

```bash
# env vars — do not commit the key
NEAR_ACCOUNT_ID=nearly-7b1462.testnet NEAR_PRIVATE_KEY='ed25519:...' npm run testnet:demo

# or a gitignored JSON file: {"account_id","private_key"}
NEAR_CREDENTIALS_FILE=./.nearly-credentials/owner.json npm run testnet:demo
```

The script refuses mainnet account ids and any non-testnet RPC. It reads `get_policy`, requests a spend inside the live limits, approves it, then requests a spend over the limit and expects the contract to reject. Every step prints a testnet explorer link. It does not deploy or replace code.

## Meta-transactions

A relayer can pay gas by submitting a NEP-366 `SignedDelegate`. The contract still uses `env::predecessor_account_id()`, and that predecessor is the account that signed the delegate, not the relayer account. `set_policy`, `approve_spend`, `queue_item`, `set_item_status`, and `upsert_plan` therefore succeed only when the signer is the owner. `request_spend` can be signed by any account and still panics with `item` unless the owner has queued that id. No contract change is required for the owner to use a relayer. The web app does not ask a non-owner to sign the owner-only methods.

`--create-throwaway` is optional: it asks the testnet faucet for a new account, deploys `res/nearly_agent_policy.wasm` onto that account only, and runs the same flow. The key is written to gitignored `.nearly-credentials/testnet-demo.json` and is not printed.
