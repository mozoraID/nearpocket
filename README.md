# NearPocket — Your NEAR pocket for real-world money

> Product name lives in [`src/config/brand.ts`](src/config/brand.ts).

**NEAR HACKATHON** · tracks: `realworld` (+ `agents`)

A **NEAR-native** wallet that feels like a normal payment app: scan QRIS (and ASEAN QR corridors), pay worldwide via **NEAR Intents / 1Click** → native USDC on NEAR → card/link rails, shop or sell as a merchant, and run **shopping plans** where an agent searches multiple marketplaces — **you approve every purchase** via an on-chain spend-policy contract and function-call access keys.

**Live demo:** https://nearpocket-ijustabi.vercel.app  
**Legacy URL (still works):** https://nearly-ijustabi.vercel.app  
**Repo:** https://github.com/mozoraID/nearpocket

---

## Problem

People hold stablecoins on NEAR but still pay warungs and online stores with local rails (QRIS, PromptPay, cards…). They also want an agent that can **plan** a shopping list across Tokopedia / Shopee / Lazada / Amazon — without giving the agent unlimited keys.

## Solution

| Mode | What you do |
| --- | --- |
| **Pay QR / Scan** | Paste or camera-scan EMVCo QR → detect rail → FX quote → settle via PJP adapter |
| **Worldwide** | Any token via **NEAR Intents 1Click** → USDC on NEAR → mock virtual card / payment link |
| **Shop** | Buyer catalog + merchant QR generator |
| **Shopping plans** | Budget + deadline + item list → agent searches marketplaces → waitlist → approve/reject |
| **Top up (beta)** | Demo USDC credit via QRIS/card/NEAR (mocked until partner creds) |

## Architecture

```mermaid
flowchart LR
  User --> App[NearPocket App]
  App --> QR[EMVCo Parser / Camera]
  App --> Plans[Shopping Planner]
  Plans --> MP[Marketplace Adapters]
  App --> FX[FX Quote]
  App --> Policy[Spend Policy]
  Policy --> Chain[NEAR testnet agent-policy]
  App --> Intents[NEAR Intents 1Click]
  Intents --> USDC[Native USDC on NEAR]
  App --> Settle[Settlement Router]
  Settle --> Xendit[Xendit sandbox]
  Settle --> Mock[Mock PJP]
  Settle --> ZX[0xramp staging optional]
```

### How NEAR is used (hackathon-aligned)

- **Native USDC on NEAR** for balances & settlement denomination.
- **NEAR Intents / 1Click** for any-token → USDC routing (real dry quotes via public 1Click API when reachable; execution labeled until mainnet / partner JWT).
- **On-chain agent-policy** at [`nearly-7b1462.testnet`](https://testnet.nearblocks.io/address/nearly-7b1462.testnet): daily limit, per-item max, approval gate, shopping plan upsert. *(Contract account id kept from pre-rebrand deploy — do not rename.)*
- **Function-call access keys** scoped to policy methods so the agent can queue / request but **cannot spend without user approve**.
- **Meteor Wallet** (primary) via wallet-selector + HOT / Intear / NEAR Mobile; Demo account for zero-setup. MyNearWallet not used (limited mode).

### Sample on-chain txs (testnet)

| Action | Explorer |
| --- | --- |
| Deploy | https://testnet.nearblocks.io/txns/9uz6FqFYDertGpXWQ151ERaxsRzdPQhZkGLZiCAqy3sh |
| set_policy | https://testnet.nearblocks.io/txns/FB7CwPsFg77txpbvdGhC8AqwbeFH3JCmtuuVHUw9Hrf2 |
| queue_item | https://testnet.nearblocks.io/txns/AYg9utitCS6eMatv4QhHqyCGoVYp6QBy5VXnrWAMAPEU |
| request_spend | https://testnet.nearblocks.io/txns/3eFcr6dxLcnLkcYBKJXbAssTQA5ZCnkirQn4GD31q1cw |
| approve_spend | https://testnet.nearblocks.io/txns/Em45x6JBvu58xeVWxQm66hx2r6S4JYYxWbjeYtWoNpvD |
| upsert_plan | https://testnet.nearblocks.io/txns/7nYrj1ECqyxWQXRJTL6a7iXcfdVq6mT81FbFYYN7wuSg |

## Compliance

**Crypto is not a payment instrument in Indonesia (BI / OJK).**  
NearPocket never sends crypto to merchants. Production: user USDC → licensed PJP → IDR/local fiat QRIS/card credit.

## What’s real vs mocked

| Piece | Status |
| --- | --- |
| EMVCo parser + CRC + camera scan | **Real** |
| FX (Frankfurter) | **Real** when reachable |
| Agent-policy contract on testnet | **Real** (see txs above) |
| On-chain policy view in UI | **Real** via RPC |
| NEAR Intents 1Click dry quote | **Real** public dry quote → USDC on NEAR (execution / deposit still dry until mainnet JWT) |
| Marketplace search | **Amazon-like** via DummyJSON when reachable; Tokopedia/Shopee/Lazada/eBay **mocked adapters** (labeled) |
| Xendit QRIS | **Real Test Mode** when `XENDIT_SECRET_KEY` has Money-in / QR Write; else mock / 403 labeled |
| 0xramp | Staging adapter ready; **needs partner credentials** (no public USDC sandbox) |
| Card / top-up settlement | **Mocked** (labeled) |
| Wallet login | **Meteor Wallet** (+ HOT / Intear / NEAR Mobile) via wallet-selector; Demo account for zero secrets |

**Not used (by design):** Onmeta, Alchemy Pay, or other non-NEAR-native ramps — stays aligned with the NEAR Hackathon program (Intents, chain abstraction, on-chain policy).

## How to run (zero secrets)

```bash
npm install
npm run dev
```

Open http://localhost:3000.

### Optional env (see `.env.example`)

| Var | Purpose |
| --- | --- |
| `NEXT_PUBLIC_NEAR_NETWORK` | `testnet` (default) |
| `NEXT_PUBLIC_AGENT_POLICY_CONTRACT` | default `nearly-7b1462.testnet` |
| `XENDIT_SECRET_KEY` | Xendit **test** secret (`xnd_development_…`) — enable Money-in / QR Code Write |
| `ZEROXRAMP_PARTNER_ID` | 0xramp issued partner id |
| `ZEROXRAMP_API_BASE_URL` | staging https origin |
| `ZEROXRAMP_API_KEY` | optional bearer |
| `NEAR_AI_API_KEY` / `OPENAI_API_KEY` | optional agent copy |

### Get a NEAR testnet account

1. Install / open **Meteor Wallet** and create a testnet account, **or**
2. Use faucet helper: create a keypair and `POST https://helper.testnet.near.org/account` with `{ newAccountId, newAccountPublicKey }`, **or**
3. Use `near-cli-rs`: `near account create-account sponsor-by-faucet-service <name>.testnet …`

Then connect in the app via **Meteor Wallet** (or Demo account).

### Deploy the policy contract yourself

```bash
# needs Rust + wasm32 target
cd contracts/agent-policy
cargo build --target wasm32-unknown-unknown --release
# deploy wasm with near-api-js / near-cli to your testnet account, then call new(...)
```

Set `NEXT_PUBLIC_AGENT_POLICY_CONTRACT` to your account.

### Demo script (AI screener)

1. `/` → Meteor Wallet / Demo.
2. `/pay` → Indonesia sample → quote → Sign & pay → receipt.
3. `/scan` → camera QR (mobile) or fall back to paste.
4. `/plans` → create plan → Search marketplaces → Approve buy.
5. `/api/contract` → see live on-chain policy + explorer links.
6. `/api/quote?from=NEAR&amount=1` → real 1Click dry quote (or labeled fallback).
7. `/topup` → demo credit balance.
8. `/shop` → merchant QR.

```bash
npm run test:qris
npm run build
```

## 0xramp note

Per [docs.0xramp.app](https://docs.0xramp.app): partner SDK embeds a pane for **ZEC ↔ local fiat**; environments are `production` / `staging` with issued `partnerId`. Local sandbox pane is host simulation only. There is **no** public keyless USDC→IDR REST sandbox like Xendit Test Mode. Adapter is implemented for when partner credentials arrive (`ZEROXRAMP_*`).

## License

MIT · Built at **NEAR HACKATHON**.
