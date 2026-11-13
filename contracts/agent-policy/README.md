# NearPocket agent-policy contract

Per-account spend limits and USDC escrow for the shopping agent.

Each predecessor account gets its own policy, queue, plans, spend requests, and escrow. The contract admin only sets the settlement account and the global pause.

## What it enforces

- Defaults on first use: 75 USDC per day, 30 USDC per item, approval required.
- `ft_transfer_call` deposits USDC into that account's escrow.
- `request_spend` locks the amount from escrow and counts it toward the daily and per-item limits.
- `approve_spend` by that same account sends the locked USDC to the settlement account with `ft_transfer`. The callback restores the lock if the transfer fails.
- `reject_spend` and `expire_spend` return the lock to escrow. `withdraw` sends unlocked escrow back to the account.
- `set_global_paused` blocks new locks and releases. Deposits and withdrawals stay open.

There is no migration from the previous single-policy contract. That layout did not hold USDC. Deploy this build to a new account and call `new`.

## Init

```bash
# from contracts/agent-policy, Rust 1.85+
cargo +stable build --target wasm32-unknown-unknown --release
cp target/wasm32-unknown-unknown/release/nearly_agent_policy.wasm res/nearly_agent_policy.wasm

near deploy pocket.nearpocket.testnet res/nearly_agent_policy.wasm --networkId testnet
near call pocket.nearpocket.testnet new \
  '{"usdc_contract":"usdc.fakes.testnet","settlement_account":"pocket.nearpocket.testnet"}' \
  --accountId pocket.nearpocket.testnet --networkId testnet
near call usdc.fakes.testnet storage_deposit \
  '{"account_id":"pocket.nearpocket.testnet"}' \
  --accountId pocket.nearpocket.testnet --deposit 0.0025 --networkId testnet
```

`new` arguments:

| Arg | Example |
| --- | --- |
| `usdc_contract` | `usdc.fakes.testnet` |
| `settlement_account` | `pocket.nearpocket.testnet` |

Then set `NEXT_PUBLIC_AGENT_POLICY_CONTRACT=pocket.nearpocket.testnet`. The app default stays `nearly-7b1462.testnet` until that variable is set. A wallet on the old contract sees an in-app note and does not send these calls.

A user deposits with the token, not with `new`:

```bash
near call usdc.fakes.testnet ft_transfer_call \
  '{"receiver_id":"pocket.nearpocket.testnet","amount":"1000000","msg":""}' \
  --accountId <wallet.testnet> --depositYocto 1 --gas 100000000000000 --networkId testnet
```

`amount` is USDC base units (6 decimals).

## Calls

| Method | Who | Effect |
| --- | --- | --- |
| `ft_on_transfer` | USDC contract | Credits the sender's escrow |
| `set_policy` | that account | Daily limit, per-item max, approval flag, own pause |
| `queue_item` / `set_item_status` / `upsert_plan` | that account | Own queue and plans |
| `request_spend` | that account | Locks escrow, or starts the transfer if approval is off |
| `approve_spend` | that account | `ft_transfer` of the locked amount to the settlement account |
| `reject_spend` / `expire_spend` | that account | Returns the lock to escrow |
| `withdraw` | that account | Sends unlocked escrow back to the account |
| `set_settlement_account` / `set_global_paused` | admin | Payout account and global pause |
| `get_policy` / `get_escrow` / `get_request` / `get_item` / `get_plan` | view | Pass `account_id` |
| `get_config` / `contract_version` | view | Admin, token, settlement, version `2` |

## Tests

```bash
npm run test:contract
```

Unit tests use the near-sdk mock VM. They cover escrow deposit, lock, release, failed-transfer restore, reject, expire, withdraw restore, per-account isolation, admin-only settlement changes, per-item max, and the daily limit. GitHub Actions runs the same `cargo test`.

## Testnet demo script

`npm run testnet:demo` reads `get_policy` and `get_escrow` for the signer. It does not require the contract admin. Without an escrow balance, `request_spend` is refused and the script prints the deposit command. Set `NEAR_CONTRACT_ID` to the new account. Testnet only.
