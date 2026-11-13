//! Per-account spend policy and USDC escrow (NEAR testnet).
//!
//! Each predecessor gets its own limits, queue, plans, and escrow.
//! A user deposits USDC with NEP-141 `ft_transfer_call`. `request_spend`
//! locks that amount. `approve_spend` by the same account sends it to the
//! settlement account with `ft_transfer`. A failed transfer restores the lock.
//! The contract admin only sets the settlement account and the global pause.

use near_sdk::borsh::{BorshDeserialize, BorshSerialize};
use near_sdk::collections::UnorderedMap;
use near_sdk::json_types::U128;
use near_sdk::serde::{Deserialize, Serialize};
use near_sdk::{
    env, ext_contract, near_bindgen, AccountId, BorshStorageKey, Gas, NearSchema, NearToken,
    PanicOnDefault, Promise, PromiseOrValue, PromiseResult,
};

const VERSION: u32 = 2;
/// 75 USDC, 6 decimals.
const DEFAULT_DAILY_USDC_6: u128 = 75_000_000;
/// 30 USDC, 6 decimals.
const DEFAULT_PER_ITEM_USDC_6: u128 = 30_000_000;
/// Locked requests expire after one UTC day.
const REQUEST_TTL_NS: u64 = 86_400 * 1_000_000_000;
const GAS_FT_TRANSFER: Gas = Gas::from_tgas(20);
const GAS_FT_CALLBACK: Gas = Gas::from_tgas(25);

#[derive(BorshSerialize, BorshStorageKey)]
#[borsh(crate = "near_sdk::borsh")]
enum StorageKey {
    Accounts,
    Items,
    Requests,
    Plans,
}

#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, Clone, NearSchema)]
#[borsh(crate = "near_sdk::borsh")]
#[serde(crate = "near_sdk::serde")]
pub struct Policy {
    pub daily_limit_usdc_6: u128,
    pub per_item_max_usdc_6: u128,
    pub require_approval: bool,
    pub paused: bool,
    pub spent_today_usdc_6: u128,
    pub spent_day: u64,
}

#[derive(BorshDeserialize, BorshSerialize, Clone)]
#[borsh(crate = "near_sdk::borsh")]
struct AccountRecord {
    policy: Policy,
    escrow: u128,
    locked: u128,
    pending_withdraw: u128,
}

#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, Clone, NearSchema)]
#[borsh(crate = "near_sdk::borsh")]
#[serde(crate = "near_sdk::serde")]
pub struct WaitItem {
    pub id: String,
    pub title: String,
    pub category: String,
    pub target_usdc_6: u128,
    pub status: String,
}

#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, Clone, NearSchema)]
#[borsh(crate = "near_sdk::borsh")]
#[serde(crate = "near_sdk::serde")]
pub struct PlanMeta {
    pub id: String,
    pub title: String,
    pub budget_usdc_6: u128,
    pub spent_usdc_6: u128,
    pub deadline_ts: u64,
    pub status: String,
}

#[derive(BorshDeserialize, BorshSerialize, Clone)]
#[borsh(crate = "near_sdk::borsh")]
struct SpendRequest {
    id: String,
    item_id: String,
    amount_usdc_6: u128,
    /// awaiting_approval | transferring | purchased | rejected | expired | failed
    status: String,
    charged_day: u64,
    expires_at_ns: u64,
    plan_id: Option<String>,
}

#[near_bindgen]
#[derive(BorshDeserialize, BorshSerialize, PanicOnDefault)]
#[borsh(crate = "near_sdk::borsh")]
pub struct Contract {
    owner: AccountId,
    usdc_contract: AccountId,
    settlement_account: AccountId,
    global_paused: bool,
    accounts: UnorderedMap<AccountId, AccountRecord>,
    items: UnorderedMap<Vec<u8>, WaitItem>,
    requests: UnorderedMap<Vec<u8>, SpendRequest>,
    plans: UnorderedMap<Vec<u8>, PlanMeta>,
}

#[allow(dead_code)]
#[ext_contract(ext_ft)]
trait ExtFt {
    fn ft_transfer(&mut self, receiver_id: AccountId, amount: U128, memo: Option<String>);
}

#[allow(dead_code)]
#[ext_contract(ext_self)]
trait ExtSelf {
    fn on_ft_transfer(
        &mut self,
        account_id: AccountId,
        amount: U128,
        kind: String,
        request_id: Option<String>,
    );
}

#[near_bindgen]
impl Contract {
    #[init]
    pub fn new(usdc_contract: AccountId, settlement_account: AccountId) -> Self {
        assert!(!usdc_contract.as_str().is_empty(), "usdc");
        assert!(!settlement_account.as_str().is_empty(), "settlement");
        assert_ne!(
            settlement_account,
            env::current_account_id(),
            "settlement must be a separate account"
        );
        Self {
            owner: env::predecessor_account_id(),
            usdc_contract,
            settlement_account,
            global_paused: false,
            accounts: UnorderedMap::new(StorageKey::Accounts),
            items: UnorderedMap::new(StorageKey::Items),
            requests: UnorderedMap::new(StorageKey::Requests),
            plans: UnorderedMap::new(StorageKey::Plans),
        }
    }

    pub fn contract_version(&self) -> u32 {
        VERSION
    }

    pub fn get_config(&self) -> ConfigView {
        ConfigView {
            version: VERSION,
            owner: self.owner.clone(),
            usdc_contract: self.usdc_contract.clone(),
            settlement_account: self.settlement_account.clone(),
            global_paused: self.global_paused,
        }
    }

    /// Admin only. Where released USDC is sent.
    pub fn set_settlement_account(&mut self, account_id: AccountId) {
        self.assert_admin();
        assert!(!account_id.as_str().is_empty(), "settlement");
        assert_ne!(
            account_id,
            env::current_account_id(),
            "settlement must be a separate account"
        );
        self.settlement_account = account_id;
    }

    /// Admin only. Blocks new locks and releases. Deposits and withdrawals stay open.
    pub fn set_global_paused(&mut self, paused: bool) {
        self.assert_admin();
        self.global_paused = paused;
    }

    /// NEP-141 hook. Credits `sender_id`'s escrow. Accepts the whole amount.
    pub fn ft_on_transfer(
        &mut self,
        sender_id: AccountId,
        amount: U128,
        msg: String,
    ) -> PromiseOrValue<U128> {
        assert_eq!(
            env::predecessor_account_id(),
            self.usdc_contract,
            "untrusted token"
        );
        assert!(amount.0 > 0, "amount");
        let _ = msg;
        let mut account = self.load_account(&sender_id);
        account.escrow = account.escrow.checked_add(amount.0).expect("overflow");
        self.save_account(&sender_id, &account);
        env::log_str(&format!("escrow_deposit {} {}", sender_id, amount.0));
        PromiseOrValue::Value(U128(0))
    }

    /// Send unlocked escrow back to the caller. A failed transfer restores it.
    pub fn withdraw(&mut self, amount: U128) -> Promise {
        let user = env::predecessor_account_id();
        let mut account = self.load_account(&user);
        assert!(amount.0 > 0, "amount");
        assert!(account.pending_withdraw == 0, "withdraw in progress");
        assert!(account.escrow >= amount.0, "insufficient escrow");
        account.escrow -= amount.0;
        account.pending_withdraw = amount.0;
        self.save_account(&user, &account);
        self.transfer_out(user, amount.0, "withdraw".into(), None)
    }

    pub fn get_policy(&self, account_id: AccountId) -> PolicyView {
        let stored = self.accounts.get(&account_id);
        let policy = stored
            .as_ref()
            .map(|a| self.refreshed(&a.policy))
            .unwrap_or_else(default_policy);
        PolicyView {
            account_id,
            registered: stored.is_some(),
            daily_limit_usdc_6: U128(policy.daily_limit_usdc_6),
            per_item_max_usdc_6: U128(policy.per_item_max_usdc_6),
            require_approval: policy.require_approval,
            paused: policy.paused,
            global_paused: self.global_paused,
            spent_today_usdc_6: U128(policy.spent_today_usdc_6),
        }
    }

    pub fn get_escrow(&self, account_id: AccountId) -> EscrowView {
        let account = self.accounts.get(&account_id);
        EscrowView {
            account_id,
            available_usdc_6: U128(account.as_ref().map(|a| a.escrow).unwrap_or(0)),
            locked_usdc_6: U128(account.as_ref().map(|a| a.locked).unwrap_or(0)),
            pending_withdraw_usdc_6: U128(account.as_ref().map(|a| a.pending_withdraw).unwrap_or(0)),
        }
    }

    pub fn get_request(&self, account_id: AccountId, id: String) -> Option<SpendRequestView> {
        self.requests
            .get(&pair_key(&account_id, &id))
            .map(|req| SpendRequestView {
                id: req.id,
                item_id: req.item_id,
                amount_usdc_6: U128(req.amount_usdc_6),
                status: req.status,
                charged_day: req.charged_day,
                expires_at_ns: req.expires_at_ns,
                plan_id: req.plan_id,
            })
    }

    pub fn get_item(&self, account_id: AccountId, id: String) -> Option<WaitItem> {
        self.items.get(&pair_key(&account_id, &id))
    }

    pub fn get_plan(&self, account_id: AccountId, id: String) -> Option<PlanMeta> {
        self.plans.get(&pair_key(&account_id, &id))
    }

    /// The caller edits only their own limits and pause.
    pub fn set_policy(
        &mut self,
        daily_limit_usdc_6: Option<U128>,
        per_item_max_usdc_6: Option<U128>,
        require_approval: Option<bool>,
        paused: Option<bool>,
    ) {
        let user = env::predecessor_account_id();
        let mut account = self.load_account(&user);
        if let Some(v) = daily_limit_usdc_6 {
            assert!(v.0 > 0, "daily limit");
            account.policy.daily_limit_usdc_6 = v.0;
        }
        if let Some(v) = per_item_max_usdc_6 {
            assert!(v.0 > 0, "per-item max");
            account.policy.per_item_max_usdc_6 = v.0;
        }
        if let Some(v) = require_approval {
            account.policy.require_approval = v;
        }
        if let Some(v) = paused {
            account.policy.paused = v;
        }
        self.save_account(&user, &account);
    }

    pub fn upsert_plan(
        &mut self,
        id: String,
        title: String,
        budget_usdc_6: U128,
        deadline_ts: u64,
        status: String,
    ) {
        let user = env::predecessor_account_id();
        self.ensure_registered(&user);
        assert_id(&id);
        let key = pair_key(&user, &id);
        let spent = self.plans.get(&key).map(|p| p.spent_usdc_6).unwrap_or(0);
        self.plans.insert(
            &key,
            &PlanMeta {
                id,
                title: clip(&title, 180),
                budget_usdc_6: budget_usdc_6.0,
                spent_usdc_6: spent,
                deadline_ts,
                status: clip(&status, 32),
            },
        );
    }

    pub fn queue_item(&mut self, id: String, title: String, category: String, target_usdc_6: U128) {
        let user = env::predecessor_account_id();
        self.ensure_registered(&user);
        assert_id(&id);
        self.items.insert(
            &pair_key(&user, &id),
            &WaitItem {
                id,
                title: clip(&title, 180),
                category: clip(&category, 64),
                target_usdc_6: target_usdc_6.0,
                status: "queued".into(),
            },
        );
    }

    pub fn set_item_status(&mut self, id: String, status: String) {
        let user = env::predecessor_account_id();
        let key = pair_key(&user, &id);
        let mut item = self.items.get(&key).expect("item");
        item.status = clip(&status, 32);
        self.items.insert(&key, &item);
    }

    /// Lock `amount` from the caller's escrow. Approval still has to release it
    /// unless this account turned `require_approval` off.
    pub fn request_spend(&mut self, id: String, amount_usdc_6: U128) -> String {
        let user = env::predecessor_account_id();
        let mut account = self.load_account(&user);
        self.assert_can_spend(&account);
        assert!(amount_usdc_6.0 > 0, "amount");
        assert!(
            amount_usdc_6.0 <= account.policy.per_item_max_usdc_6,
            "over per-item max"
        );
        assert!(
            account.policy.spent_today_usdc_6 + amount_usdc_6.0 <= account.policy.daily_limit_usdc_6,
            "over daily limit"
        );
        assert!(account.escrow >= amount_usdc_6.0, "insufficient escrow");
        let item_key = pair_key(&user, &id);
        let mut item = self.items.get(&item_key).expect("item");
        let req_key = pair_key(&user, &id);
        if let Some(existing) = self.requests.get(&req_key) {
            assert!(
                !matches!(existing.status.as_str(), "awaiting_approval" | "transferring"),
                "request open"
            );
        }

        account.escrow -= amount_usdc_6.0;
        account.locked = account.locked.checked_add(amount_usdc_6.0).expect("overflow");
        account.policy.spent_today_usdc_6 += amount_usdc_6.0;
        let charged_day = account.policy.spent_day;
        let require_approval = account.policy.require_approval;
        self.save_account(&user, &account);

        item.status = "awaiting_approval".into();
        self.items.insert(&item_key, &item);
        self.requests.insert(
            &req_key,
            &SpendRequest {
                id: id.clone(),
                item_id: id.clone(),
                amount_usdc_6: amount_usdc_6.0,
                status: "awaiting_approval".into(),
                charged_day,
                expires_at_ns: env::block_timestamp().saturating_add(REQUEST_TTL_NS),
                plan_id: None,
            },
        );

        if require_approval {
            return "awaiting_approval".into();
        }
        let _transfer = self.release(user, id, amount_usdc_6.0, None);
        "transferring".into()
    }

    /// The account that locked the funds is the only account that can release them.
    pub fn approve_spend(
        &mut self,
        id: String,
        amount_usdc_6: U128,
        plan_id: Option<String>,
    ) -> Promise {
        let user = env::predecessor_account_id();
        let account = self.load_account(&user);
        self.assert_can_spend(&account);
        let req = self.requests.get(&pair_key(&user, &id)).expect("request");
        assert_eq!(req.status, "awaiting_approval", "not awaiting approval");
        assert_eq!(req.amount_usdc_6, amount_usdc_6.0, "amount mismatch");
        assert!(env::block_timestamp() < req.expires_at_ns, "request expired");
        assert!(
            amount_usdc_6.0 <= account.policy.per_item_max_usdc_6,
            "over per-item max"
        );
        self.release(user, id, amount_usdc_6.0, plan_id)
    }

    pub fn reject_spend(&mut self, id: String) {
        let user = env::predecessor_account_id();
        self.return_lock(&user, &id, "rejected", false);
    }

    pub fn expire_spend(&mut self, id: String) {
        let user = env::predecessor_account_id();
        self.return_lock(&user, &id, "expired", true);
    }

    /// Restores escrow when the token transfer fails. Clears the lock when it succeeds.
    #[private]
    pub fn on_ft_transfer(
        &mut self,
        account_id: AccountId,
        amount: U128,
        kind: String,
        request_id: Option<String>,
    ) {
        let ok = matches!(env::promise_result(0), PromiseResult::Successful(_));
        if kind == "withdraw" {
            let mut account = self.load_account(&account_id);
            if account.pending_withdraw == 0 {
                return;
            }
            let pending = account.pending_withdraw;
            account.pending_withdraw = 0;
            if !ok {
                account.escrow = account.escrow.checked_add(pending).expect("overflow");
            }
            self.save_account(&account_id, &account);
            return;
        }

        let Some(request_id) = request_id else {
            return;
        };
        let req_key = pair_key(&account_id, &request_id);
        let Some(mut req) = self.requests.get(&req_key) else {
            return;
        };
        if req.status != "transferring" {
            return;
        }
        let mut account = self.load_account(&account_id);
        let moving = amount.0.min(req.amount_usdc_6);
        account.locked = account.locked.saturating_sub(moving);
        if ok {
            req.status = "purchased".into();
            self.requests.insert(&req_key, &req);
            self.save_account(&account_id, &account);
            self.set_status(&account_id, &req.item_id, "purchased");
            env::log_str(&format!(
                "escrow_released {} {} {}",
                account_id, moving, self.settlement_account
            ));
            return;
        }

        account.escrow = account.escrow.checked_add(moving).expect("overflow");
        self.refund_daily(&mut account, req.charged_day, moving);
        if let Some(plan_id) = req.plan_id.clone() {
            self.refund_plan(&account_id, &plan_id, moving);
        }
        req.status = "failed".into();
        req.plan_id = None;
        self.requests.insert(&req_key, &req);
        self.save_account(&account_id, &account);
        self.set_status(&account_id, &req.item_id, "failed");
        env::log_str(&format!("escrow_restored {} {}", account_id, moving));
    }
}

impl Contract {
    fn assert_admin(&self) {
        assert_eq!(env::predecessor_account_id(), self.owner, "admin only");
    }

    fn assert_can_spend(&self, account: &AccountRecord) {
        assert!(!self.global_paused, "agent paused");
        assert!(!account.policy.paused, "agent paused");
    }

    fn load_account(&self, account_id: &AccountId) -> AccountRecord {
        let mut account = self
            .accounts
            .get(account_id)
            .unwrap_or_else(default_account);
        account.policy = self.refreshed(&account.policy);
        account
    }

    fn save_account(&mut self, account_id: &AccountId, account: &AccountRecord) {
        self.accounts.insert(account_id, account);
    }

    fn ensure_registered(&mut self, account_id: &AccountId) {
        let account = self.load_account(account_id);
        self.save_account(account_id, &account);
    }

    fn refreshed(&self, policy: &Policy) -> Policy {
        let mut next = policy.clone();
        let day = unix_day();
        if next.spent_day != day {
            next.spent_day = day;
            next.spent_today_usdc_6 = 0;
        }
        next
    }

    fn release(
        &mut self,
        user: AccountId,
        id: String,
        amount: u128,
        plan_id: Option<String>,
    ) -> Promise {
        if let Some(pid) = plan_id.clone() {
            let key = pair_key(&user, &pid);
            let mut plan = self.plans.get(&key).expect("plan");
            assert!(
                plan.spent_usdc_6 + amount <= plan.budget_usdc_6,
                "over plan budget"
            );
            plan.spent_usdc_6 += amount;
            self.plans.insert(&key, &plan);
        }
        let req_key = pair_key(&user, &id);
        let mut req = self.requests.get(&req_key).expect("request");
        assert_eq!(req.status, "awaiting_approval", "not awaiting approval");
        req.status = "transferring".into();
        req.plan_id = plan_id;
        self.requests.insert(&req_key, &req);
        self.set_status(&user, &id, "transferring");
        self.transfer_out(user, amount, "spend".into(), Some(id))
    }

    fn return_lock(&mut self, user: &AccountId, id: &str, status: &str, require_expired: bool) {
        let req_key = pair_key(user, id);
        let mut req = self.requests.get(&req_key).expect("request");
        assert_eq!(req.status, "awaiting_approval", "not awaiting approval");
        if require_expired {
            assert!(
                env::block_timestamp() >= req.expires_at_ns,
                "not expired"
            );
        }
        let mut account = self.load_account(user);
        let amount = req.amount_usdc_6;
        account.locked = account.locked.saturating_sub(amount);
        account.escrow = account.escrow.checked_add(amount).expect("overflow");
        self.refund_daily(&mut account, req.charged_day, amount);
        self.save_account(user, &account);
        req.status = status.into();
        self.requests.insert(&req_key, &req);
        self.set_status(user, &req.item_id, status);
    }

    fn refund_daily(&self, account: &mut AccountRecord, charged_day: u64, amount: u128) {
        if account.policy.spent_day == charged_day {
            account.policy.spent_today_usdc_6 =
                account.policy.spent_today_usdc_6.saturating_sub(amount);
        }
    }

    fn refund_plan(&mut self, user: &AccountId, plan_id: &str, amount: u128) {
        let key = pair_key(user, plan_id);
        if let Some(mut plan) = self.plans.get(&key) {
            plan.spent_usdc_6 = plan.spent_usdc_6.saturating_sub(amount);
            self.plans.insert(&key, &plan);
        }
    }

    fn set_status(&mut self, user: &AccountId, id: &str, status: &str) {
        let key = pair_key(user, id);
        if let Some(mut item) = self.items.get(&key) {
            item.status = status.into();
            self.items.insert(&key, &item);
        }
    }

    fn transfer_out(
        &self,
        account_id: AccountId,
        amount: u128,
        kind: String,
        request_id: Option<String>,
    ) -> Promise {
        let receiver = if kind == "withdraw" {
            account_id.clone()
        } else {
            self.settlement_account.clone()
        };
        ext_ft::ext(self.usdc_contract.clone())
            .with_attached_deposit(NearToken::from_yoctonear(1))
            .with_static_gas(GAS_FT_TRANSFER)
            .ft_transfer(receiver, U128(amount), Some(format!("nearpocket:{kind}")))
            .then(
                ext_self::ext(env::current_account_id())
                    .with_static_gas(GAS_FT_CALLBACK)
                    .on_ft_transfer(account_id, U128(amount), kind, request_id),
            )
    }
}

fn default_policy() -> Policy {
    Policy {
        daily_limit_usdc_6: DEFAULT_DAILY_USDC_6,
        per_item_max_usdc_6: DEFAULT_PER_ITEM_USDC_6,
        require_approval: true,
        paused: false,
        spent_today_usdc_6: 0,
        spent_day: unix_day(),
    }
}

fn default_account() -> AccountRecord {
    AccountRecord {
        policy: default_policy(),
        escrow: 0,
        locked: 0,
        pending_withdraw: 0,
    }
}

fn pair_key(account: &AccountId, id: &str) -> Vec<u8> {
    let name = account.as_bytes();
    let mut key = Vec::with_capacity(2 + name.len() + id.len());
    key.extend_from_slice(&(name.len() as u16).to_le_bytes());
    key.extend_from_slice(name);
    key.extend_from_slice(id.as_bytes());
    key
}

fn assert_id(id: &str) {
    assert!(!id.is_empty() && id.len() <= 80, "id");
}

fn clip(value: &str, max: usize) -> String {
    value.chars().take(max).collect()
}

fn unix_day() -> u64 {
    env::block_timestamp() / 1_000_000_000 / 86_400
}

#[derive(Serialize, Deserialize, NearSchema)]
#[serde(crate = "near_sdk::serde")]
pub struct ConfigView {
    pub version: u32,
    pub owner: AccountId,
    pub usdc_contract: AccountId,
    pub settlement_account: AccountId,
    pub global_paused: bool,
}

#[derive(Serialize, Deserialize, NearSchema)]
#[serde(crate = "near_sdk::serde")]
pub struct PolicyView {
    pub account_id: AccountId,
    pub registered: bool,
    pub daily_limit_usdc_6: U128,
    pub per_item_max_usdc_6: U128,
    pub require_approval: bool,
    pub paused: bool,
    pub global_paused: bool,
    pub spent_today_usdc_6: U128,
}

#[derive(Serialize, Deserialize, NearSchema)]
#[serde(crate = "near_sdk::serde")]
pub struct EscrowView {
    pub account_id: AccountId,
    pub available_usdc_6: U128,
    pub locked_usdc_6: U128,
    pub pending_withdraw_usdc_6: U128,
}

#[derive(Serialize, Deserialize, NearSchema)]
#[serde(crate = "near_sdk::serde")]
pub struct SpendRequestView {
    pub id: String,
    pub item_id: String,
    pub amount_usdc_6: U128,
    pub status: String,
    pub charged_day: u64,
    pub expires_at_ns: u64,
    pub plan_id: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::VMContextBuilder;
    use near_sdk::{test_vm_config, MockedBlockchain, RuntimeFeesConfig, VMContext};
    use std::collections::HashMap;

    const ADMIN: &str = "admin.testnet";
    const ALICE: &str = "alice.testnet";
    const BOB: &str = "bob.testnet";
    const USDC: &str = "usdc.fakes.testnet";
    const SETTLEMENT: &str = "settlement.testnet";
    const CONTRACT_ID: &str = "policy.testnet";
    const DAY_NS: u64 = 86_400 * 1_000_000_000;

    fn context(predecessor: &str, block_timestamp: u64) -> VMContext {
        VMContextBuilder::new()
            .current_account_id(CONTRACT_ID.parse().unwrap())
            .signer_account_id(predecessor.parse().unwrap())
            .predecessor_account_id(predecessor.parse().unwrap())
            .block_timestamp(block_timestamp)
            .prepaid_gas(Gas::from_tgas(300))
            .account_balance(NearToken::from_near(20))
            .build()
    }

    fn switch(predecessor: &str, block_timestamp: u64) {
        switch_with(predecessor, block_timestamp, Vec::new());
    }

    fn switch_with(predecessor: &str, block_timestamp: u64, results: Vec<PromiseResult>) {
        let storage = near_sdk::mock::with_mocked_blockchain(|b| b.take_storage());
        near_sdk::env::set_blockchain_interface(MockedBlockchain::new(
            context(predecessor, block_timestamp),
            test_vm_config(),
            RuntimeFeesConfig::test(),
            results,
            storage,
            HashMap::new(),
            None,
        ));
    }

    fn setup() -> Contract {
        switch(ADMIN, DAY_NS);
        Contract::new(USDC.parse().unwrap(), SETTLEMENT.parse().unwrap())
    }

    fn deposit(contract: &mut Contract, user: &str, amount: u128) {
        switch(USDC, DAY_NS);
        let unused = contract.ft_on_transfer(user.parse().unwrap(), U128(amount), String::new());
        match unused {
            PromiseOrValue::Value(left) => assert_eq!(left.0, 0),
            PromiseOrValue::Promise(_) => panic!("deposit must not return a promise"),
        }
    }

    fn queue(contract: &mut Contract, user: &str, id: &str, amount: u128) {
        switch(user, DAY_NS);
        contract.queue_item(id.into(), format!("item {id}"), "shopping".into(), U128(amount));
    }

    #[test]
    fn first_use_defaults_are_per_account() {
        let contract = setup();
        let alice = contract.get_policy(ALICE.parse().unwrap());
        assert!(!alice.registered);
        assert!(alice.require_approval);
        assert_eq!(alice.daily_limit_usdc_6.0, DEFAULT_DAILY_USDC_6);
        assert_eq!(alice.per_item_max_usdc_6.0, DEFAULT_PER_ITEM_USDC_6);
        let escrow = contract.get_escrow(ALICE.parse().unwrap());
        assert_eq!(escrow.available_usdc_6.0, 0);
        assert_eq!(escrow.locked_usdc_6.0, 0);
    }

    #[test]
    fn deposit_locks_on_request_and_approve_releases_to_settlement() {
        let mut contract = setup();
        deposit(&mut contract, ALICE, 5_000_000);
        queue(&mut contract, ALICE, "earbuds", 1_000_000);

        switch(ALICE, DAY_NS);
        let status = contract.request_spend("earbuds".into(), U128(1_000_000));
        assert_eq!(status, "awaiting_approval");
        let escrow = contract.get_escrow(ALICE.parse().unwrap());
        assert_eq!(escrow.available_usdc_6.0, 4_000_000);
        assert_eq!(escrow.locked_usdc_6.0, 1_000_000);
        assert_eq!(contract.get_policy(ALICE.parse().unwrap()).spent_today_usdc_6.0, 1_000_000);
        assert_eq!(
            contract.get_request(ALICE.parse().unwrap(), "earbuds".into()).unwrap().status,
            "awaiting_approval"
        );

        switch(ALICE, DAY_NS);
        contract.approve_spend("earbuds".into(), U128(1_000_000), None);
        assert_eq!(
            contract.get_request(ALICE.parse().unwrap(), "earbuds".into()).unwrap().status,
            "transferring"
        );

        switch_with(
            CONTRACT_ID,
            DAY_NS,
            vec![PromiseResult::Successful(Vec::new())],
        );
        contract.on_ft_transfer(
            ALICE.parse().unwrap(),
            U128(1_000_000),
            "spend".into(),
            Some("earbuds".into()),
        );
        let escrow = contract.get_escrow(ALICE.parse().unwrap());
        assert_eq!(escrow.available_usdc_6.0, 4_000_000);
        assert_eq!(escrow.locked_usdc_6.0, 0);
        assert_eq!(
            contract.get_request(ALICE.parse().unwrap(), "earbuds".into()).unwrap().status,
            "purchased"
        );
        assert_eq!(contract.get_policy(ALICE.parse().unwrap()).spent_today_usdc_6.0, 1_000_000);
    }

    #[test]
    fn failed_transfer_restores_the_lock_to_escrow() {
        let mut contract = setup();
        deposit(&mut contract, ALICE, 2_000_000);
        queue(&mut contract, ALICE, "earbuds", 1_000_000);
        switch(ALICE, DAY_NS);
        contract.request_spend("earbuds".into(), U128(1_000_000));
        switch(ALICE, DAY_NS);
        contract.approve_spend("earbuds".into(), U128(1_000_000), None);

        switch_with(CONTRACT_ID, DAY_NS, vec![PromiseResult::Failed]);
        contract.on_ft_transfer(
            ALICE.parse().unwrap(),
            U128(1_000_000),
            "spend".into(),
            Some("earbuds".into()),
        );
        let escrow = contract.get_escrow(ALICE.parse().unwrap());
        assert_eq!(escrow.available_usdc_6.0, 2_000_000);
        assert_eq!(escrow.locked_usdc_6.0, 0);
        assert_eq!(contract.get_policy(ALICE.parse().unwrap()).spent_today_usdc_6.0, 0);
        assert_eq!(
            contract.get_request(ALICE.parse().unwrap(), "earbuds".into()).unwrap().status,
            "failed"
        );
    }

    #[test]
    fn reject_and_expire_return_funds_to_escrow() {
        let mut contract = setup();
        deposit(&mut contract, ALICE, 3_000_000);
        queue(&mut contract, ALICE, "keep", 1_000_000);
        queue(&mut contract, ALICE, "wait", 1_000_000);
        switch(ALICE, DAY_NS);
        contract.request_spend("keep".into(), U128(1_000_000));
        switch(ALICE, DAY_NS);
        contract.request_spend("wait".into(), U128(1_000_000));

        switch(ALICE, DAY_NS);
        contract.reject_spend("keep".into());
        assert_eq!(
            contract.get_request(ALICE.parse().unwrap(), "keep".into()).unwrap().status,
            "rejected"
        );

        switch(ALICE, DAY_NS + REQUEST_TTL_NS);
        contract.expire_spend("wait".into());
        let escrow = contract.get_escrow(ALICE.parse().unwrap());
        assert_eq!(escrow.available_usdc_6.0, 3_000_000);
        assert_eq!(escrow.locked_usdc_6.0, 0);
        assert_eq!(
            contract.get_request(ALICE.parse().unwrap(), "wait".into()).unwrap().status,
            "expired"
        );
    }

    #[test]
    fn withdraw_failure_restores_escrow() {
        let mut contract = setup();
        deposit(&mut contract, ALICE, 2_000_000);
        switch(ALICE, DAY_NS);
        contract.withdraw(U128(500_000));
        assert_eq!(contract.get_escrow(ALICE.parse().unwrap()).available_usdc_6.0, 1_500_000);
        assert_eq!(
            contract.get_escrow(ALICE.parse().unwrap()).pending_withdraw_usdc_6.0,
            500_000
        );

        switch_with(CONTRACT_ID, DAY_NS, vec![PromiseResult::Failed]);
        contract.on_ft_transfer(ALICE.parse().unwrap(), U128(500_000), "withdraw".into(), None);
        let escrow = contract.get_escrow(ALICE.parse().unwrap());
        assert_eq!(escrow.available_usdc_6.0, 2_000_000);
        assert_eq!(escrow.pending_withdraw_usdc_6.0, 0);
    }

    #[test]
    fn policies_queues_and_escrow_are_isolated() {
        let mut contract = setup();
        deposit(&mut contract, ALICE, 2_000_000);
        switch(ALICE, DAY_NS);
        contract.set_policy(Some(U128(10_000_000)), Some(U128(4_000_000)), None, None);
        queue(&mut contract, ALICE, "mug", 1_000_000);

        let bob = contract.get_policy(BOB.parse().unwrap());
        assert_eq!(bob.daily_limit_usdc_6.0, DEFAULT_DAILY_USDC_6);
        assert!(contract.get_item(BOB.parse().unwrap(), "mug".into()).is_none());
        assert_eq!(contract.get_escrow(BOB.parse().unwrap()).available_usdc_6.0, 0);
        assert_eq!(
            contract.get_policy(ALICE.parse().unwrap()).daily_limit_usdc_6.0,
            10_000_000
        );
    }

    #[test]
    #[should_panic(expected = "admin only")]
    fn user_cannot_change_settlement_account() {
        let mut contract = setup();
        switch(ALICE, DAY_NS);
        contract.set_settlement_account("elsewhere.testnet".parse().unwrap());
    }

    #[test]
    #[should_panic(expected = "request")]
    fn another_account_cannot_approve() {
        let mut contract = setup();
        deposit(&mut contract, ALICE, 1_000_000);
        queue(&mut contract, ALICE, "earbuds", 1_000_000);
        switch(ALICE, DAY_NS);
        contract.request_spend("earbuds".into(), U128(1_000_000));
        switch(BOB, DAY_NS);
        contract.approve_spend("earbuds".into(), U128(1_000_000), None);
    }

    #[test]
    #[should_panic(expected = "untrusted token")]
    fn deposit_from_the_wrong_token_is_refused() {
        let mut contract = setup();
        switch(ALICE, DAY_NS);
        contract.ft_on_transfer(ALICE.parse().unwrap(), U128(1), String::new());
    }

    #[test]
    #[should_panic(expected = "insufficient escrow")]
    fn request_without_escrow_is_refused() {
        let mut contract = setup();
        queue(&mut contract, ALICE, "earbuds", 1_000_000);
        switch(ALICE, DAY_NS);
        contract.request_spend("earbuds".into(), U128(1_000_000));
    }

    #[test]
    #[should_panic(expected = "over per-item max")]
    fn per_item_max_rejects_the_locked_amount() {
        let mut contract = setup();
        deposit(&mut contract, ALICE, 40_000_000);
        queue(&mut contract, ALICE, "laptop", 31_000_000);
        switch(ALICE, DAY_NS);
        contract.request_spend("laptop".into(), U128(31_000_000));
    }

    #[test]
    #[should_panic(expected = "over daily limit")]
    fn daily_limit_counts_locked_amounts() {
        let mut contract = setup();
        switch(ALICE, DAY_NS);
        contract.set_policy(Some(U128(2_000_000)), Some(U128(2_000_000)), None, None);
        deposit(&mut contract, ALICE, 5_000_000);
        queue(&mut contract, ALICE, "first", 1_000_000);
        queue(&mut contract, ALICE, "second", 1_500_000);
        switch(ALICE, DAY_NS);
        contract.request_spend("first".into(), U128(1_000_000));
        switch(ALICE, DAY_NS);
        contract.approve_spend("first".into(), U128(1_000_000), None);
        switch(ALICE, DAY_NS);
        contract.request_spend("second".into(), U128(1_500_000));
    }

    #[test]
    fn daily_counter_resets_on_the_next_utc_day() {
        let mut contract = setup();
        switch(ALICE, DAY_NS);
        contract.set_policy(Some(U128(2_000_000)), Some(U128(2_000_000)), Some(false), None);
        deposit(&mut contract, ALICE, 5_000_000);
        queue(&mut contract, ALICE, "coffee", 1_000_000);
        switch(ALICE, DAY_NS);
        assert_eq!(
            contract.request_spend("coffee".into(), U128(1_000_000)),
            "transferring"
        );
        assert_eq!(contract.get_policy(ALICE.parse().unwrap()).spent_today_usdc_6.0, 1_000_000);

        switch(ALICE, DAY_NS * 2);
        assert_eq!(contract.get_policy(ALICE.parse().unwrap()).spent_today_usdc_6.0, 0);
        queue(&mut contract, ALICE, "coffee-2", 1_000_000);
        switch(ALICE, DAY_NS * 2);
        assert_eq!(
            contract.request_spend("coffee-2".into(), U128(1_000_000)),
            "transferring"
        );
        assert_eq!(contract.get_policy(ALICE.parse().unwrap()).spent_today_usdc_6.0, 1_000_000);
    }

    #[test]
    #[should_panic(expected = "not expired")]
    fn expire_before_the_deadline_is_refused() {
        let mut contract = setup();
        deposit(&mut contract, ALICE, 1_000_000);
        queue(&mut contract, ALICE, "wait", 1_000_000);
        switch(ALICE, DAY_NS);
        contract.request_spend("wait".into(), U128(1_000_000));
        switch(ALICE, DAY_NS);
        contract.expire_spend("wait".into());
    }

    #[test]
    #[should_panic(expected = "request expired")]
    fn approve_after_the_deadline_is_refused() {
        let mut contract = setup();
        deposit(&mut contract, ALICE, 5_000_000);
        queue(&mut contract, ALICE, "earbuds", 1_000_000);
        switch(ALICE, DAY_NS);
        contract.request_spend("earbuds".into(), U128(1_000_000));
        switch(ALICE, DAY_NS + REQUEST_TTL_NS);
        contract.approve_spend("earbuds".into(), U128(1_000_000), None);
    }

    #[test]
    #[should_panic(expected = "settlement must be a separate account")]
    fn settlement_cannot_be_the_contract_itself() {
        switch(ADMIN, DAY_NS);
        Contract::new(USDC.parse().unwrap(), CONTRACT_ID.parse().unwrap());
    }

    #[test]
    #[should_panic(expected = "agent paused")]
    fn global_pause_blocks_a_new_lock() {
        let mut contract = setup();
        switch(ADMIN, DAY_NS);
        contract.set_global_paused(true);
        deposit(&mut contract, ALICE, 1_000_000);
        queue(&mut contract, ALICE, "earbuds", 1_000_000);
        switch(ALICE, DAY_NS);
        contract.request_spend("earbuds".into(), U128(1_000_000));
    }
}
