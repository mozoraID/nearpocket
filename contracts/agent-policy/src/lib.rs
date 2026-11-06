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
