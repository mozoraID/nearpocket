# Nearly agent-policy contract

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
