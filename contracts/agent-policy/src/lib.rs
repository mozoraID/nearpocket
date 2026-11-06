//! Nearly agent spend policy + waitlist (NEAR contract sketch).
//! Deploy to testnet when you have a testnet account + cargo-near.
//! UI works without deployment using the mirrored TypeScript policy in src/lib/agent.

use near_sdk::borsh::{self, BorshDeserialize, BorshSerialize};
use near_sdk::collections::UnorderedMap;
use near_sdk::json_types::U128;
use near_sdk::{env, near_bindgen, AccountId, PanicOnDefault, BorshStorageKey};

#[derive(BorshSerialize, BorshStorageKey)]
enum StorageKey {
    Waitlist,
}

#[derive(BorshDeserialize, BorshSerialize, Clone)]
pub struct Policy {
    pub daily_limit_usdc_6: u128, // 6 decimals
    pub per_item_max_usdc_6: u128,
    pub require_approval: bool,
    pub paused: bool,
    pub spent_today_usdc_6: u128,
    pub spent_day: u64, // unix day
}

#[derive(BorshDeserialize, BorshSerialize, Clone)]
pub struct WaitItem {
    pub id: String,
    pub title: String,
    pub category: String,
    pub target_usdc_6: u128,
    pub status: String, // queued|watching|awaiting_approval|approved|rejected|purchased
}

#[near_bindgen]
#[derive(BorshDeserialize, BorshSerialize, PanicOnDefault)]
pub struct Contract {
    owner: AccountId,
    policy: Policy,
    waitlist: UnorderedMap<String, WaitItem>,
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
        if let Some(v) = daily_limit_usdc_6 {
            p.daily_limit_usdc_6 = v.0;
        }
        if let Some(v) = per_item_max_usdc_6 {
            p.per_item_max_usdc_6 = v.0;
        }
        if let Some(v) = require_approval {
            p.require_approval = v;
        }
        if let Some(v) = paused {
            p.paused = v;
        }
        self.policy = p;
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

    /// Agent requests a spend. Fails if over limit / paused.
    /// If require_approval, marks awaiting_approval and does NOT debit.
    pub fn request_spend(&mut self, id: String, amount_usdc_6: U128) -> String {
        let mut p = self.refreshed_policy();
        assert!(!p.paused, "agent paused");
        assert!(amount_usdc_6.0 > 0, "amount");
        assert!(
            amount_usdc_6.0 <= p.per_item_max_usdc_6,
            "over per-item max"
        );
        assert!(
            p.spent_today_usdc_6 + amount_usdc_6.0 <= p.daily_limit_usdc_6,
            "over daily limit"
        );
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

    pub fn approve_spend(&mut self, id: String, amount_usdc_6: U128) {
        self.assert_owner();
        let mut p = self.refreshed_policy();
        assert!(!p.paused, "agent paused");
        assert!(
            p.spent_today_usdc_6 + amount_usdc_6.0 <= p.daily_limit_usdc_6,
            "over daily limit"
        );
        assert!(
            amount_usdc_6.0 <= p.per_item_max_usdc_6,
            "over per-item max"
        );
        let mut item = self.waitlist.get(&id).expect("item");
        assert_eq!(item.status, "awaiting_approval");
        p.spent_today_usdc_6 += amount_usdc_6.0;
        item.status = "purchased".into();
        self.waitlist.insert(&id, &item);
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

#[derive(near_sdk::serde::Serialize)]
#[serde(crate = "near_sdk::serde")]
pub struct PolicyView {
    pub daily_limit_usdc_6: U128,
    pub per_item_max_usdc_6: U128,
    pub require_approval: bool,
    pub paused: bool,
    pub spent_today_usdc_6: U128,
}
