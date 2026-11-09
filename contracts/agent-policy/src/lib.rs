//! Agent spend policy + shopping-plan waitlist (NEAR testnet).
use near_sdk::borsh::{BorshDeserialize, BorshSerialize};
use near_sdk::collections::UnorderedMap;
use near_sdk::json_types::U128;
use near_sdk::serde::{Deserialize, Serialize};
use near_sdk::{env, near_bindgen, AccountId, PanicOnDefault, NearSchema, BorshStorageKey};

#[derive(BorshSerialize, BorshStorageKey)]
#[borsh(crate = "near_sdk::borsh")]
enum StorageKey {
    Waitlist,
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

#[near_bindgen]
#[derive(BorshDeserialize, BorshSerialize, PanicOnDefault)]
#[borsh(crate = "near_sdk::borsh")]
pub struct Contract {
    owner: AccountId,
    policy: Policy,
    waitlist: UnorderedMap<String, WaitItem>,
    plans: UnorderedMap<String, PlanMeta>,
}

#[near_bindgen]
impl Contract {
    #[init]
    pub fn new(daily_limit_usdc_6: U128, per_item_max_usdc_6: U128) -> Self {
        Self {
            owner: env::predecessor_account_id(),
            policy: Policy {
                daily_limit_usdc_6: daily_limit_usdc_6.0,
                per_item_max_usdc_6: per_item_max_usdc_6.0,
                require_approval: true,
                paused: false,
                spent_today_usdc_6: 0,
                spent_day: unix_day(),
            },
            waitlist: UnorderedMap::new(StorageKey::Waitlist),
            plans: UnorderedMap::new(StorageKey::Plans),
        }
    }

    pub fn get_policy(&self) -> PolicyView {
        let p = self.refreshed_policy();
        PolicyView {
            daily_limit_usdc_6: U128(p.daily_limit_usdc_6),
            per_item_max_usdc_6: U128(p.per_item_max_usdc_6),
            require_approval: p.require_approval,
            paused: p.paused,
            spent_today_usdc_6: U128(p.spent_today_usdc_6),
            owner: self.owner.clone(),
        }
    }

    pub fn set_policy(
        &mut self,
        daily_limit_usdc_6: Option<U128>,
        per_item_max_usdc_6: Option<U128>,
        require_approval: Option<bool>,
        paused: Option<bool>,
    ) {
        self.assert_owner();
        let mut p = self.refreshed_policy();
        if let Some(v) = daily_limit_usdc_6 { p.daily_limit_usdc_6 = v.0; }
        if let Some(v) = per_item_max_usdc_6 { p.per_item_max_usdc_6 = v.0; }
        if let Some(v) = require_approval { p.require_approval = v; }
        if let Some(v) = paused { p.paused = v; }
        self.policy = p;
    }

    pub fn upsert_plan(
        &mut self,
        id: String,
        title: String,
        budget_usdc_6: U128,
        deadline_ts: u64,
        status: String,
    ) {
        self.assert_owner();
        let existing = self.plans.get(&id);
        let spent = existing.map(|p| p.spent_usdc_6).unwrap_or(0);
        self.plans.insert(
            &id,
            &PlanMeta {
                id: id.clone(),
                title,
                budget_usdc_6: budget_usdc_6.0,
                spent_usdc_6: spent,
                deadline_ts,
                status,
            },
        );
    }

    pub fn get_plan(&self, id: String) -> Option<PlanMeta> {
        self.plans.get(&id)
    }

    pub fn queue_item(&mut self, id: String, title: String, category: String, target_usdc_6: U128) {
        self.assert_owner();
        self.waitlist.insert(
            &id,
            &WaitItem {
                id: id.clone(),
                title,
                category,
                target_usdc_6: target_usdc_6.0,
                status: "queued".into(),
            },
        );
    }

    pub fn set_item_status(&mut self, id: String, status: String) {
        self.assert_owner();
        let mut item = self.waitlist.get(&id).expect("item");
        item.status = status;
        self.waitlist.insert(&id, &item);
    }

    pub fn request_spend(&mut self, id: String, amount_usdc_6: U128) -> String {
        let mut p = self.refreshed_policy();
        assert!(!p.paused, "agent paused");
        assert!(amount_usdc_6.0 > 0, "amount");
        assert!(amount_usdc_6.0 <= p.per_item_max_usdc_6, "over per-item max");
        assert!(p.spent_today_usdc_6 + amount_usdc_6.0 <= p.daily_limit_usdc_6, "over daily limit");
        let mut item = self.waitlist.get(&id).expect("item");
        if p.require_approval {
            item.status = "awaiting_approval".into();
            self.waitlist.insert(&id, &item);
            self.policy = p;
            return "awaiting_approval".into();
        }
        p.spent_today_usdc_6 += amount_usdc_6.0;
        item.status = "purchased".into();
        self.waitlist.insert(&id, &item);
        self.policy = p;
        "purchased".into()
    }

    pub fn approve_spend(&mut self, id: String, amount_usdc_6: U128, plan_id: Option<String>) {
        self.assert_owner();
        let mut p = self.refreshed_policy();
        assert!(!p.paused, "agent paused");
        assert!(p.spent_today_usdc_6 + amount_usdc_6.0 <= p.daily_limit_usdc_6, "over daily limit");
        assert!(amount_usdc_6.0 <= p.per_item_max_usdc_6, "over per-item max");
        if let Some(pid) = plan_id {
            let mut plan = self.plans.get(&pid).expect("plan");
            assert!(plan.spent_usdc_6 + amount_usdc_6.0 <= plan.budget_usdc_6, "over plan budget");
            plan.spent_usdc_6 += amount_usdc_6.0;
            self.plans.insert(&pid, &plan);
        }
        if let Some(mut item) = self.waitlist.get(&id) {
            item.status = "purchased".into();
            self.waitlist.insert(&id, &item);
        }
        p.spent_today_usdc_6 += amount_usdc_6.0;
        self.policy = p;
    }

    fn assert_owner(&self) {
        assert_eq!(env::predecessor_account_id(), self.owner, "owner only");
    }

    fn refreshed_policy(&self) -> Policy {
        let mut p = self.policy.clone();
        let day = unix_day();
        if p.spent_day != day {
            p.spent_day = day;
            p.spent_today_usdc_6 = 0;
        }
        p
    }
}

fn unix_day() -> u64 {
    env::block_timestamp() / 1_000_000_000 / 86_400
}

#[derive(Serialize, Deserialize, NearSchema)]
#[serde(crate = "near_sdk::serde")]
pub struct PolicyView {
    pub daily_limit_usdc_6: U128,
    pub per_item_max_usdc_6: U128,
    pub require_approval: bool,
    pub paused: bool,
    pub spent_today_usdc_6: U128,
    pub owner: AccountId,
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::VMContextBuilder;
    use near_sdk::{test_vm_config, MockedBlockchain, RuntimeFeesConfig, VMContext};
    use std::collections::HashMap;

    const OWNER: &str = "owner.testnet";
    const AGENT: &str = "agent.testnet";
    const STRANGER: &str = "stranger.testnet";
    /// Nanoseconds in a UTC day. Matches `unix_day`.
    const DAY_NS: u64 = 86_400 * 1_000_000_000;

    fn context(predecessor: &str, block_timestamp: u64) -> VMContext {
        VMContextBuilder::new()
            .current_account_id("policy.testnet".parse().unwrap())
            .signer_account_id(predecessor.parse().unwrap())
            .predecessor_account_id(predecessor.parse().unwrap())
            .block_timestamp(block_timestamp)
            .build()
    }

    /// Swap predecessor / timestamp without dropping contract storage.
    /// `testing_env!` replaces the mock trie; collections live in that trie.
    fn switch(predecessor: &str, block_timestamp: u64) {
        let storage = near_sdk::mock::with_mocked_blockchain(|b| b.take_storage());
        testing_env_with_storage(context(predecessor, block_timestamp), storage);
    }

    fn testing_env_with_storage(context: VMContext, storage: HashMap<Vec<u8>, Vec<u8>>) {
        near_sdk::env::set_blockchain_interface(MockedBlockchain::new(
            context,
            test_vm_config(),
            RuntimeFeesConfig::test(),
            Vec::new(),
            storage,
            HashMap::new(),
            None,
        ));
    }

    fn setup(daily: u128, per_item: u128) -> Contract {
        switch(OWNER, DAY_NS);
        Contract::new(U128(daily), U128(per_item))
    }

    fn queue(contract: &mut Contract, id: &str, amount: u128) {
        switch(OWNER, DAY_NS);
        contract.queue_item(id.into(), format!("item {id}"), "shopping".into(), U128(amount));
    }

    #[test]
    fn approval_gate_holds_spend_until_owner_approves() {
        let mut contract = setup(5_000_000, 2_000_000);
        queue(&mut contract, "earbuds", 1_000_000);

        switch(AGENT, DAY_NS);
        let status = contract.request_spend("earbuds".into(), U128(1_000_000));
        assert_eq!(status, "awaiting_approval");
        assert_eq!(contract.get_policy().spent_today_usdc_6.0, 0);

        switch(OWNER, DAY_NS);
        contract.approve_spend("earbuds".into(), U128(1_000_000), None);
        let policy = contract.get_policy();
        assert_eq!(policy.spent_today_usdc_6.0, 1_000_000);
        assert!(policy.require_approval);
    }

    #[test]
    #[should_panic(expected = "owner only")]
    fn non_owner_cannot_set_policy() {
        let mut contract = setup(5_000_000, 2_000_000);
        switch(STRANGER, DAY_NS);
        contract.set_policy(Some(U128(9_000_000)), None, Some(false), None);
    }

    #[test]
    #[should_panic(expected = "owner only")]
    fn non_owner_cannot_approve_spend() {
        let mut contract = setup(5_000_000, 2_000_000);
        queue(&mut contract, "earbuds", 1_000_000);
        switch(AGENT, DAY_NS);
        let status = contract.request_spend("earbuds".into(), U128(1_000_000));
        assert_eq!(status, "awaiting_approval");
        switch(AGENT, DAY_NS);
        contract.approve_spend("earbuds".into(), U128(1_000_000), None);
    }

    #[test]
    #[should_panic(expected = "over per-item max")]
    fn per_item_max_rejects_request() {
        let mut contract = setup(5_000_000, 2_000_000);
        queue(&mut contract, "laptop", 3_000_000);
        switch(AGENT, DAY_NS);
        contract.request_spend("laptop".into(), U128(3_000_000));
    }

    #[test]
    fn daily_limit_resets_on_the_next_utc_day() {
        let mut contract = setup(2_000_000, 2_000_000);
        switch(OWNER, DAY_NS);
        contract.set_policy(None, None, Some(false), None);
        queue(&mut contract, "coffee", 1_000_000);

        switch(AGENT, DAY_NS);
        assert_eq!(
            contract.request_spend("coffee".into(), U128(1_000_000)),
            "purchased"
        );
        assert_eq!(contract.get_policy().spent_today_usdc_6.0, 1_000_000);

        switch(AGENT, DAY_NS * 2);
        assert_eq!(contract.get_policy().spent_today_usdc_6.0, 0);
        queue(&mut contract, "coffee-2", 1_000_000);
        // queue() switches back to day 1 via DAY_NS. Re-enter the next day.
        switch(AGENT, DAY_NS * 2);
        assert_eq!(
            contract.request_spend("coffee-2".into(), U128(1_000_000)),
            "purchased"
        );
        assert_eq!(contract.get_policy().spent_today_usdc_6.0, 1_000_000);
    }

    #[test]
    #[should_panic(expected = "over daily limit")]
    fn agent_spend_over_daily_limit_is_refused() {
        let mut contract = setup(2_000_000, 2_000_000);
        queue(&mut contract, "first", 1_000_000);
        switch(AGENT, DAY_NS);
        assert_eq!(
            contract.request_spend("first".into(), U128(1_000_000)),
            "awaiting_approval"
        );
        switch(OWNER, DAY_NS);
        contract.approve_spend("first".into(), U128(1_000_000), None);
        assert_eq!(contract.get_policy().spent_today_usdc_6.0, 1_000_000);

        queue(&mut contract, "second", 1_500_000);
        switch(AGENT, DAY_NS);
        // 1.00 already spent + 1.50 requested > 2.00 daily limit.
        contract.request_spend("second".into(), U128(1_500_000));
    }
}
