//! Sandbox flow against a real fungible-token contract.
use near_workspaces::types::NearToken;
use near_workspaces::{Account, Contract, Worker};
use serde_json::{json, Value};

async fn deploy() -> anyhow::Result<(Worker<near_workspaces::network::Sandbox>, Contract, Contract, Account, Account, Account)> {
    let worker = near_workspaces::sandbox().await?;
    let ft_wasm = std::fs::read(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../test-ft/target/wasm32-unknown-unknown/release/nearpocket_test_ft.wasm"
    ))?;
    let policy_wasm = std::fs::read(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../agent-policy/res/nearly_agent_policy.wasm"
    ))?;
    let ft = worker.dev_deploy(&ft_wasm).await?;
    let policy = worker.dev_deploy(&policy_wasm).await?;
    let alice = worker.dev_create_account().await?;
    let bob = worker.dev_create_account().await?;
    let settle = worker.dev_create_account().await?;
    ft.call("new")
        .args_json(json!({ "owner_id": ft.id() }))
        .transact()
        .await?
        .into_result()?;
    policy
        .call("new")
        .args_json(json!({
            "usdc_contract": ft.id(),
            "settlement_account": settle.id(),
        }))
        .transact()
        .await?
        .into_result()?;
    for account in [policy.id(), settle.id(), alice.id(), bob.id()] {
        ft.call("storage_deposit")
            .args_json(json!({ "account_id": account }))
            .deposit(NearToken::from_millinear(20))
            .transact()
            .await?
            .into_result()?;
    }
    ft.call("mint")
        .args_json(json!({ "account_id": alice.id(), "amount": "5000000" }))
        .transact()
        .await?
        .into_result()?;
    Ok((worker, ft, policy, alice, bob, settle))
}

async fn token_balance(ft: &Contract, account: &near_workspaces::AccountId) -> anyhow::Result<u128> {
    let raw: String = ft
        .view("ft_balance_of")
        .args_json(json!({ "account_id": account }))
        .await?
        .json()?;
    Ok(raw.parse()?)
}

async fn escrow(policy: &Contract, account: &near_workspaces::AccountId) -> anyhow::Result<(u128, u128)> {
    let view: Value = policy
        .view("get_escrow")
        .args_json(json!({ "account_id": account }))
        .await?
        .json()?;
    let available = view["available_usdc_6"].as_str().unwrap_or("0").parse()?;
    let locked = view["locked_usdc_6"].as_str().unwrap_or("0").parse()?;
    Ok((available, locked))
}

async fn deposit(alice: &Account, ft: &Contract, policy: &Contract, amount: &str) -> anyhow::Result<()> {
    alice
        .call(ft.id(), "ft_transfer_call")
        .args_json(json!({
            "receiver_id": policy.id(),
            "amount": amount,
            "msg": "",
        }))
        .deposit(NearToken::from_yoctonear(1))
        .max_gas()
        .transact()
        .await?
        .into_result()?;
    Ok(())
}

#[tokio::test]
async fn deposit_request_approve_reject_expire_withdraw_and_failed_release() -> anyhow::Result<()> {
    let (worker, ft, policy, alice, bob, settle) = deploy().await?;
    deposit(&alice, &ft, &policy, "3000000").await?;
    assert_eq!(token_balance(&ft, alice.id()).await?, 2_000_000);
    assert_eq!(token_balance(&ft, policy.id()).await?, 3_000_000);
    assert_eq!(escrow(&policy, alice.id()).await?, (3_000_000, 0));

    alice
        .call(policy.id(), "queue_item")
        .args_json(json!({ "id": "mug", "title": "mug", "category": "food", "target_usdc_6": "1000000" }))
        .transact()
        .await?
        .into_result()?;
    alice
        .call(policy.id(), "request_spend")
        .args_json(json!({ "id": "mug", "amount_usdc_6": "1000000" }))
        .transact()
        .await?
        .into_result()?;
    assert_eq!(escrow(&policy, alice.id()).await?, (2_000_000, 1_000_000));

    let request: Value = policy
        .view("get_request")
        .args_json(json!({ "account_id": alice.id(), "id": "mug" }))
        .await?
        .json()?;
    assert_eq!(request["settlement_account"], Value::String(settle.id().to_string()));
    assert_eq!(request["status"], "awaiting_approval");

    alice
        .call(policy.id(), "approve_spend")
        .args_json(json!({ "id": "mug", "amount_usdc_6": "1000000", "plan_id": null }))
        .max_gas()
        .transact()
        .await?
        .into_result()?;
    assert_eq!(token_balance(&ft, settle.id()).await?, 1_000_000);
    assert_eq!(escrow(&policy, alice.id()).await?, (2_000_000, 0));
    let second = alice
        .call(policy.id(), "approve_spend")
        .args_json(json!({ "id": "mug", "amount_usdc_6": "1000000", "plan_id": null }))
        .max_gas()
        .transact()
        .await?;
    assert!(second.is_failure());
    assert_eq!(token_balance(&ft, settle.id()).await?, 1_000_000);

    alice
        .call(policy.id(), "queue_item")
        .args_json(json!({ "id": "no", "title": "no", "category": "food", "target_usdc_6": "500000" }))
        .transact()
        .await?
        .into_result()?;
    alice
        .call(policy.id(), "request_spend")
        .args_json(json!({ "id": "no", "amount_usdc_6": "500000" }))
        .transact()
        .await?
        .into_result()?;
    alice
        .call(policy.id(), "reject_spend")
        .args_json(json!({ "id": "no" }))
        .transact()
        .await?
        .into_result()?;
    assert_eq!(escrow(&policy, alice.id()).await?, (2_000_000, 0));

    policy
        .as_account()
        .call(policy.id(), "set_request_ttl_ns")
        .args_json(json!({ "ttl_ns": 1_000_000_000u64 }))
        .transact()
        .await?
        .into_result()?;
    alice
        .call(policy.id(), "queue_item")
        .args_json(json!({ "id": "old", "title": "old", "category": "food", "target_usdc_6": "400000" }))
        .transact()
        .await?
        .into_result()?;
    alice
        .call(policy.id(), "request_spend")
        .args_json(json!({ "id": "old", "amount_usdc_6": "400000" }))
        .transact()
        .await?
        .into_result()?;
    assert_eq!(escrow(&policy, alice.id()).await?, (1_600_000, 400_000));
    let early = alice
        .call(policy.id(), "expire_spend")
        .args_json(json!({ "id": "old" }))
        .transact()
        .await?;
    assert!(early.is_failure());
    assert_eq!(escrow(&policy, alice.id()).await?, (1_600_000, 400_000));
    worker.fast_forward(5).await?;
    alice
        .call(policy.id(), "expire_spend")
        .args_json(json!({ "id": "old" }))
        .transact()
        .await?
        .into_result()?;
    assert_eq!(escrow(&policy, alice.id()).await?, (2_000_000, 0));

    let poor = alice
        .call(policy.id(), "request_spend")
        .args_json(json!({ "id": "old", "amount_usdc_6": "9000000" }))
        .transact()
        .await?;
    assert!(poor.is_failure());
    assert_eq!(escrow(&policy, alice.id()).await?, (2_000_000, 0));

    let stolen = bob
        .call(policy.id(), "withdraw")
        .args_json(json!({ "amount": "1" }))
        .max_gas()
        .transact()
        .await?;
    assert!(stolen.is_failure());
    assert_eq!(escrow(&policy, alice.id()).await?, (2_000_000, 0));

    alice
        .call(policy.id(), "withdraw")
        .args_json(json!({ "amount": "1000000" }))
        .max_gas()
        .transact()
        .await?
        .into_result()?;
    assert_eq!(escrow(&policy, alice.id()).await?, (1_000_000, 0));
    assert_eq!(token_balance(&ft, alice.id()).await?, 3_000_000);

    alice
        .call(policy.id(), "set_policy")
        .args_json(json!({
            "daily_limit_usdc_6": "2000000",
            "per_item_max_usdc_6": "100000",
            "require_approval": true,
            "paused": false
        }))
        .transact()
        .await?
        .into_result()?;
    alice
        .call(policy.id(), "queue_item")
        .args_json(json!({ "id": "cap", "title": "cap", "category": "food", "target_usdc_6": "100000" }))
        .transact()
        .await?
        .into_result()?;
    let over_day = alice
        .call(policy.id(), "request_spend")
        .args_json(json!({ "id": "cap", "amount_usdc_6": "100001" }))
        .transact()
        .await?;
    assert!(over_day.is_failure());
    alice
        .call(policy.id(), "request_spend")
        .args_json(json!({ "id": "cap", "amount_usdc_6": "100000" }))
        .transact()
        .await?
        .into_result()?;
    assert_eq!(escrow(&policy, alice.id()).await?, (900_000, 100_000));
    // A full UTC day is 86400 sandbox blocks and is covered by the contract unit
    // test that sets block_timestamp past midnight. Here the short TTL plus
    // fast_forward is the sandbox clock.

    let unregistered = worker.dev_create_account().await?;
    policy
        .as_account()
        .call(policy.id(), "set_settlement_account")
        .args_json(json!({ "account_id": unregistered.id() }))
        .transact()
        .await?
        .into_result()?;
    alice
        .call(policy.id(), "queue_item")
        .args_json(json!({ "id": "bad", "title": "bad", "category": "food", "target_usdc_6": "100000" }))
        .transact()
        .await?
        .into_result()?;
    alice
        .call(policy.id(), "request_spend")
        .args_json(json!({ "id": "bad", "amount_usdc_6": "100000" }))
        .transact()
        .await?
        .into_result()?;
    let locked_to: Value = policy
        .view("get_request")
        .args_json(json!({ "account_id": alice.id(), "id": "bad" }))
        .await?
        .json()?;
    assert_eq!(locked_to["settlement_account"], Value::String(unregistered.id().to_string()));
    alice
        .call(policy.id(), "approve_spend")
        .args_json(json!({ "id": "bad", "amount_usdc_6": "100000", "plan_id": null }))
        .max_gas()
        .transact()
        .await?
        .into_result()?;
    assert_eq!(token_balance(&ft, unregistered.id()).await?, 0);
    assert_eq!(escrow(&policy, alice.id()).await?, (900_000, 100_000));
    Ok(())
}
