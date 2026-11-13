# Escrow proof on NEAR testnet

Full cycle of the agent-policy escrow contract on NEAR testnet, run with two independent wallets that are not the contract owner. Every transaction below was read back from the archival RPC (`https://archival-rpc.testnet.fastnear.com`, method `tx`, `wait_until: FINAL`). Positive steps had every receipt succeed. Negative steps failed on chain and left the other wallet's balances unchanged.

Run on 14 Nov 2026 (WIB). Result: all 30 transactions matched the expected outcome.

## Accounts

| Role | Account |
| --- | --- |
| Escrow contract (owner = itself) | [`escrow.nearpocket.testnet`](https://testnet.nearblocks.io/address/escrow.nearpocket.testnet), `contract_version` 3 |
| Token | `usdc.fakes.testnet` (6 decimals) |
| Settlement (payout) | [`settle.nearpocket.testnet`](https://testnet.nearblocks.io/address/settle.nearpocket.testnet) |
| Wallet A | [`uitestunnk.testnet`](https://testnet.nearblocks.io/address/uitestunnk.testnet) |
| Wallet B | [`pocketbuyer-1114.testnet`](https://testnet.nearblocks.io/address/pocketbuyer-1114.testnet), a separate top-level account |

Deployment of `contracts/agent-policy/res/nearly_agent_policy.wasm` from `main` (`4da31cf`):

| Step | Tx |
| --- | --- |
| Create `escrow.nearpocket.testnet` | [`5KGAj4CN…`](https://testnet.nearblocks.io/txns/5KGAj4CNbFKm9PQrvMfV4Uop9oPmNofoxTXfQY9NvPQZ) |
| Deploy wasm | [`EHiUVwy4…`](https://testnet.nearblocks.io/txns/EHiUVwy4woEk521V8HVC9wioGkyvph2RDqA3e1roobvL) |
| `new` (usdc_contract=usdc.fakes.testnet, settlement_account=settle.nearpocket.testnet) | [`DGT2hbBJ…`](https://testnet.nearblocks.io/txns/DGT2hbBJdiEeRsSjXeAtU8FB7WNhCt7rdQ1fWkXZSrkW) |
| Register the contract on the token (`storage_deposit`) | [`EWaDvYfq…`](https://testnet.nearblocks.io/txns/EWaDvYfqTyBhDxDPAui2bYvA83wC1952BRpgEBBh8M28) |
| Create wallet B | [`9u198Sxn…`](https://testnet.nearblocks.io/txns/9u198Sxn96R2Zc4DHVx8yJgTUSXAeVCpWY6U4xABsjAd) |
| Register wallet B on the token | [`7KYTohq3…`](https://testnet.nearblocks.io/txns/7KYTohq3VRBBrKRHKdCrhif8GvH5a2NA95DuWfY6NdKK) |
| Mint 10 test USDC to wallet B | [`HHUahXVu…`](https://testnet.nearblocks.io/txns/HHUahXVuKB8pS7WJkwqbeRXdHDup95xpoWf2xTADoUGs) |

## Cycle

Amounts are USDC. Balances are read with `finality: final` right before and right after each transaction; **bold** marks a change.

| # | Step | Signer | Call | On-chain result | A wallet USDC | A escrow avail / locked | B wallet USDC | B escrow avail / locked | Settlement USDC | Tx |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | A deposits 3.00 | A | `ft_transfer_call` (receiver_id=escrow.nearpocket.testnet, amount=3000000) | ✅ success, 6/6 receipts ok | 9.90 → **6.90** | 0.00 / 0.00 → **3.00 / 0.00** | 10.00 | 0.00 / 0.00 | 2.10 | [`42aT971A…`](https://testnet.nearblocks.io/txns/42aT971AP5A8TQwTcyRQbZtTKnNPhFrmxsdH8Go46Zff) |
| 2 | B deposits 3.00 | B | `ft_transfer_call` (receiver_id=escrow.nearpocket.testnet, amount=3000000) | ✅ success, 6/6 receipts ok | 6.90 | 3.00 / 0.00 | 10.00 → **7.00** | 0.00 / 0.00 → **3.00 / 0.00** | 2.10 | [`5marwd4g…`](https://testnet.nearblocks.io/txns/5marwd4gRYXqUB2G2VdACcdzWHHhfVcTQyu5tSfCSq4h) |
| 3 | A queues item | A | `queue_item` (id=p1-a1, target_usdc_6=1000000) | ✅ success, 2/2 receipts ok | 6.90 | 3.00 / 0.00 | 7.00 | 3.00 / 0.00 | 2.10 | [`G1HmnJMj…`](https://testnet.nearblocks.io/txns/G1HmnJMjVUstk99PXqhp74LyQ4HCMkiexzxNbA9osJH9) |
| 4 | A requests 1.00 (locks) | A | `request_spend` (id=p1-a1, amount_usdc_6=1000000) | ✅ success, 2/2 receipts ok | 6.90 | 3.00 / 0.00 → **2.00 / 1.00** | 7.00 | 3.00 / 0.00 | 2.10 | [`zfRsagRH…`](https://testnet.nearblocks.io/txns/zfRsagRH2CtC3RWLSEt2VSrCpq9HFRy7QbnXL2ZcQ8k) |
| 5 | A approves 1.00 (settlement paid) | A | `approve_spend` (id=p1-a1, amount_usdc_6=1000000) | ✅ success, 6/6 receipts ok | 6.90 | 2.00 / 1.00 → **2.00 / 0.00** | 7.00 | 3.00 / 0.00 | 2.10 → **3.10** | [`8jxPQ2rF…`](https://testnet.nearblocks.io/txns/8jxPQ2rFsVidG9RMGSgyzC8mQzajAj7jNJYFx1Bx9jTG) |
| 6 | A approves same request again | A | `approve_spend` (id=p1-a1, amount_usdc_6=1000000) | ⛔ failed as expected: `not awaiting approval` (src/lib.rs:482:9) | 6.90 | 2.00 / 0.00 | 7.00 | 3.00 / 0.00 | 3.10 | [`DoBEqp5r…`](https://testnet.nearblocks.io/txns/DoBEqp5r3KNetJcY8Yu9hsRzLucrPitqKTn7KhkEAea5) |
| 7 | A queues item 2 | A | `queue_item` (id=p1-a2, target_usdc_6=500000) | ✅ success, 2/2 receipts ok | 6.90 | 2.00 / 0.00 | 7.00 | 3.00 / 0.00 | 3.10 | [`7ujaruqd…`](https://testnet.nearblocks.io/txns/7ujaruqdjNUuHrpnXh4Q5t2uCxP1m2PXvgdbB5mT524m) |
| 8 | A requests 0.50 (locks) | A | `request_spend` (id=p1-a2, amount_usdc_6=500000) | ✅ success, 2/2 receipts ok | 6.90 | 2.00 / 0.00 → **1.50 / 0.50** | 7.00 | 3.00 / 0.00 | 3.10 | [`7VTqhq98…`](https://testnet.nearblocks.io/txns/7VTqhq98DFbTiScS586XjgvQKSVDvZYEXv59SJwZAAAa) |
| 9 | A rejects 0.50 (unlocks) | A | `reject_spend` (id=p1-a2) | ✅ success, 2/2 receipts ok | 6.90 | 1.50 / 0.50 → **2.00 / 0.00** | 7.00 | 3.00 / 0.00 | 3.10 | [`2MKSkcBd…`](https://testnet.nearblocks.io/txns/2MKSkcBdP6UM3i5p3sxW252bbUkj1Lz573DcGtS7ETSx) |
| 10 | B queues item | B | `queue_item` (id=p1-b1, target_usdc_6=750000) | ✅ success, 2/2 receipts ok | 6.90 | 2.00 / 0.00 | 7.00 | 3.00 / 0.00 | 3.10 | [`9AfiVdak…`](https://testnet.nearblocks.io/txns/9AfiVdak7uQjgqkusfvQaQ5HUt3T4cMuMcwT3HhsnyBx) |
| 11 | B requests 0.75 (locks) | B | `request_spend` (id=p1-b1, amount_usdc_6=750000) | ✅ success, 2/2 receipts ok | 6.90 | 2.00 / 0.00 | 7.00 | 3.00 / 0.00 → **2.25 / 0.75** | 3.10 | [`GC6jifpC…`](https://testnet.nearblocks.io/txns/GC6jifpCSVcsDLYvUeHD6ZtpqzSgif8vc7GRxERrsx1G) |
| 12 | A tries to approve B's request | A | `approve_spend` (id=p1-b1, amount_usdc_6=750000) | ⛔ failed as expected: `request` (src/lib.rs:481:52) | 6.90 | 2.00 / 0.00 | 7.00 | 2.25 / 0.75 | 3.10 | [`EPHJJmM8…`](https://testnet.nearblocks.io/txns/EPHJJmM8vVtVAn91wk9tWi9DP37YKDmHcZYSCKkMN85S) |
| 13 | A tries to reject B's request | A | `reject_spend` (id=p1-b1) | ⛔ failed as expected: `request` (src/lib.rs:721:53) | 6.90 | 2.00 / 0.00 | 7.00 | 2.25 / 0.75 | 3.10 | [`HgXpgqjT…`](https://testnet.nearblocks.io/txns/HgXpgqjTJBEwg6SEsF6Zudcd6121Fbd3LCnmsSCBkgG4) |
| 14 | A tries to withdraw more than its own escrow (B's funds) | A | `withdraw` (amount=3000000) | ⛔ failed as expected: `insufficient escrow` (src/lib.rs:221:9) | 6.90 | 2.00 / 0.00 | 7.00 | 2.25 / 0.75 | 3.10 | [`ArXT2QJ2…`](https://testnet.nearblocks.io/txns/ArXT2QJ2G1hqZHKVkRDTYHezpmSL3DBc9zZe9wxTdbGw) |
| 15 | A tries to change settlement account (admin only) | A | `set_settlement_account` (account_id=uitestunnk.testnet) | ⛔ failed as expected: `admin only` (src/lib.rs:655:9) | 6.90 | 2.00 / 0.00 | 7.00 | 2.25 / 0.75 | 3.10 | [`Fz24ysMN…`](https://testnet.nearblocks.io/txns/Fz24ysMNHPFJm1PB5pymzFyHBXapgvebG4aonrBUxFUy) |
| 16 | A tries to change request TTL (admin only) | A | `set_request_ttl_ns` (ttl_ns=1) | ⛔ failed as expected: `admin only` (src/lib.rs:655:9) | 6.90 | 2.00 / 0.00 | 7.00 | 2.25 / 0.75 | 3.10 | [`5VEab1RG…`](https://testnet.nearblocks.io/txns/5VEab1RGKjQTguWuqp2jCVU13vTAxgJsNHPtR3tNx4vD) |
| 17 | A calls set_policy naming B | A | `set_policy` (account_id=pocketbuyer-1114.testnet, daily_limit_usdc_6=1000000, paused=true) | ✅ success, 2/2 receipts ok | 6.90 | 2.00 / 0.00 | 7.00 | 2.25 / 0.75 | 3.10 | [`CshLh5t1…`](https://testnet.nearblocks.io/txns/CshLh5t1iDzBcvoZ5kxkWMu6YCWcugx3xBivgEGAQt6f) |
| 18 | A restores its own policy | A | `set_policy` (daily_limit_usdc_6=75000000, paused=false) | ✅ success, 2/2 receipts ok | 6.90 | 2.00 / 0.00 | 7.00 | 2.25 / 0.75 | 3.10 | [`6rrv2ajy…`](https://testnet.nearblocks.io/txns/6rrv2ajyQwDsFjMkrQ9dhhkdszQQWeq6ksgBQ7Rv7EoZ) |
| 19 | B approves its own 0.75 (settlement paid) | B | `approve_spend` (id=p1-b1, amount_usdc_6=750000) | ✅ success, 6/6 receipts ok | 6.90 | 2.00 / 0.00 | 7.00 | 2.25 / 0.75 → **2.25 / 0.00** | 3.10 → **3.85** | [`GoUWiZzB…`](https://testnet.nearblocks.io/txns/GoUWiZzBfGSv1QPHwm1sskQcFmiqemhMtzxXYnYWrfc1) |
| 20 | admin sets request TTL to 90 s | admin | `set_request_ttl_ns` (ttl_ns=90000000000) | ✅ success, 2/2 receipts ok | 6.90 | 2.00 / 0.00 | 7.00 | 2.25 / 0.00 | 3.85 | [`CbpViHaL…`](https://testnet.nearblocks.io/txns/CbpViHaLQU77z3SQyejSDKgBzAkCU7Pu2JQGauB5UNMv) |
| 21 | A queues item 3 | A | `queue_item` (id=p1-a3, target_usdc_6=250000) | ✅ success, 2/2 receipts ok | 6.90 | 2.00 / 0.00 | 7.00 | 2.25 / 0.00 | 3.85 | [`F4xvgpyh…`](https://testnet.nearblocks.io/txns/F4xvgpyhvAeEwYPRLJrSYZFqt7ZeH3mrtyehtXfS3gFm) |
| 22 | A requests 0.25 (locks, 90 s expiry) | A | `request_spend` (id=p1-a3, amount_usdc_6=250000) | ✅ success, 2/2 receipts ok | 6.90 | 2.00 / 0.00 → **1.75 / 0.25** | 7.00 | 2.25 / 0.00 | 3.85 | [`9929M4sH…`](https://testnet.nearblocks.io/txns/9929M4sHEczpkkBvRRZ7owVvjQ6RoR83x4coCLHBNZwz) |
| 23 | admin restores request TTL to 24 h | admin | `set_request_ttl_ns` (ttl_ns=86400000000000) | ✅ success, 2/2 receipts ok | 6.90 | 1.75 / 0.25 | 7.00 | 2.25 / 0.00 | 3.85 | [`H8wN7Zmx…`](https://testnet.nearblocks.io/txns/H8wN7ZmxPSzYHLNB8qn6RoMggFUXfkgdkwZmAQStsvA2) |
| 24 | A expires before deadline | A | `expire_spend` (id=p1-a3) | ⛔ failed as expected: `not expired` (src/lib.rs:724:13) | 6.90 | 1.75 / 0.25 | 7.00 | 2.25 / 0.00 | 3.85 | [`GVxut4Ke…`](https://testnet.nearblocks.io/txns/GVxut4Kej2dwBURfVvDTyot9PRXJMMUYTkGZeD9HD63k) |
| 25 | A approves after expiry | A | `approve_spend` (id=p1-a3, amount_usdc_6=250000) | ⛔ failed as expected: `request expired` (src/lib.rs:484:9) | 6.90 | 1.75 / 0.25 | 7.00 | 2.25 / 0.00 | 3.85 | [`2T44eD9W…`](https://testnet.nearblocks.io/txns/2T44eD9WGnhkPVBUw3q7AerQrQqfR9b3FDo6XYyJB5Kz) |
| 26 | A expires request (unlocks) | A | `expire_spend` (id=p1-a3) | ✅ success, 2/2 receipts ok | 6.90 | 1.75 / 0.25 → **2.00 / 0.00** | 7.00 | 2.25 / 0.00 | 3.85 | [`9CsQkZEN…`](https://testnet.nearblocks.io/txns/9CsQkZENywqNkq9jrTgw8uYL15trzm2XYfYB3CgqrJoL) |
| 27 | A withdraws all available 2.00 | A | `withdraw` (amount=2000000) | ✅ success, 6/6 receipts ok | 6.90 → **8.90** | 2.00 / 0.00 → **0.00 / 0.00** | 7.00 | 2.25 / 0.00 | 3.85 | [`3q2FHkFb…`](https://testnet.nearblocks.io/txns/3q2FHkFb9xtVxTgyZ4rLJAEPEokExWRBXmtDfp41wFqw) |
| 28 | B withdraws all available 2.25 | B | `withdraw` (amount=2250000) | ✅ success, 6/6 receipts ok | 8.90 | 0.00 / 0.00 | 7.00 → **9.25** | 2.25 / 0.00 → **0.00 / 0.00** | 3.85 | [`Hiv5Gspw…`](https://testnet.nearblocks.io/txns/Hiv5GspwHk4nh6X37oAsxiTjQrh4HxKbq87uRMknZNhr) |

Totals: wallet A paid 1.00 USDC (9.90 → 8.90), wallet B paid 0.75 USDC (10.00 → 9.25), and settlement received exactly 1.75 USDC (2.10 → 3.85). Both escrows end at 0 available and 0 locked.

### Notes

- Step 4: `get_request` right after `request_spend` returned `settlement_account: settle.nearpocket.testnet`, `status: awaiting_approval`.
- Step 17: set_policy has no target argument; it wrote A's own row (A daily=1.00, paused=true). B before daily=75.00 paused=false; after daily=75.00 paused=false.
- `set_policy` takes no account argument. It always writes the caller's own row, so wallet A cannot change wallet B's policy at all. The extra `account_id` in step 17 is ignored, and wallet B's policy is unchanged. Wallet A then restores its own policy.
- `approve_spend` and `reject_spend` look the id up in the caller's own request index. Wallet A naming wallet B's request id finds nothing and panics with `request`.
- `withdraw` only debits the caller's escrow, so wallet A asking for more than its own balance fails with `insufficient escrow` and wallet B's escrow stays the same.
- Expiry: the owner can change the request lifetime for new requests (`set_request_ttl_ns`). It was set to 90 s, one request was opened, and it was set back to 24 h straight away. The open request kept its stored 90 s expiry. Before the deadline `expire_spend` fails with `not expired`. After the deadline `approve_spend` fails with `request expired`, and `expire_spend` returns the lock to escrow.
- The settlement account is copied onto each request when it is created (`get_request` returns `settlement_account`), and `approve_spend` pays that stored account. Only the contract owner can call `set_settlement_account`, and that only affects requests created afterward. Wallet A's attempt to change it failed (step 15).

## Covered in CI

The `agent-policy unit tests` job runs 26 contract unit tests and a sandbox flow (`contracts/escrow-sandbox`) against a real fungible-token contract. The sandbox flow covers deposit, request, approve with settlement receiving the tokens, a second approve that does not pay again, reject, early expiry refused, expiry, insufficient escrow, another wallet's withdraw refused, withdraw, the daily limit, and a failed `ft_transfer` (unregistered settlement) that restores the lock. UTC day rollover, cross-wallet approve and policy isolation, and the settlement stored on the request are unit tests.

## Earlier deployment

`pocket.nearpocket.testnet` is the previous layout and is no longer used by the app. Wallet A's open 1.49 USDC request there was rejected and its escrow withdrawn:

| # | Step | Signer | Call | On-chain result | A wallet USDC | A escrow avail / locked | B wallet USDC | B escrow avail / locked | Settlement USDC | Tx |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | A rejects open 1.49 request | A | `reject_spend` (id=wl_mwf8cyb5) | ✅ success, 2/2 receipts ok | 7.50 | 0.91 / 1.49 → **2.40 / 0.00** | 10.00 | 0.00 / 0.00 | 2.10 | [`GWV2HL1B…`](https://testnet.nearblocks.io/txns/GWV2HL1Bax2d5RyA6Uf1Rx2hsjwR4kFMhkDLfGZTDyQh) |
| 2 | A withdraws all escrow | A | `withdraw` (amount=2400000) | ✅ success, 6/6 receipts ok | 7.50 → **9.90** | 2.40 / 0.00 → **0.00 / 0.00** | 10.00 | 0.00 / 0.00 | 2.10 | [`BNJMTsdq…`](https://testnet.nearblocks.io/txns/BNJMTsdqcw5ABuwv4qQA8ST6Ugqhq4eFmamfutLwi4TB) |
