//! Tiny NEP-141 used only by the sandbox escrow test.
use near_sdk::collections::LookupMap;
use near_sdk::json_types::U128;
use near_sdk::{env, ext_contract, near, AccountId, Gas, PanicOnDefault, Promise, PromiseOrValue, PromiseResult};

#[allow(dead_code)]
#[ext_contract(ext_receiver)]
trait ExtReceiver {
    fn ft_on_transfer(&mut self, sender_id: AccountId, amount: U128, msg: String) -> PromiseOrValue<U128>;
}

#[allow(dead_code)]
#[ext_contract(ext_self)]
trait ExtSelf {
    fn ft_resolve_transfer(&mut self, sender_id: AccountId, receiver_id: AccountId, amount: U128) -> U128;
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Contract {
    owner: AccountId,
    balances: LookupMap<AccountId, u128>,
    registered: LookupMap<AccountId, bool>,
}

#[near]
impl Contract {
    #[init]
    pub fn new(owner_id: AccountId) -> Self {
        Self {
            owner: owner_id,
            balances: LookupMap::new(b"b".to_vec()),
            registered: LookupMap::new(b"r".to_vec()),
        }
    }

    #[payable]
    pub fn storage_deposit(&mut self, account_id: Option<AccountId>) {
        let account = account_id.unwrap_or_else(|| env::predecessor_account_id());
        self.registered.insert(&account, &true);
        if self.balances.get(&account).is_none() {
            self.balances.insert(&account, &0);
        }
    }

    pub fn mint(&mut self, account_id: AccountId, amount: U128) {
        assert_eq!(env::predecessor_account_id(), self.owner, "owner");
        self.registered.insert(&account_id, &true);
        let next = self.balances.get(&account_id).unwrap_or(0).saturating_add(amount.0);
        self.balances.insert(&account_id, &next);
    }

    pub fn ft_balance_of(&self, account_id: AccountId) -> U128 {
        U128(self.balances.get(&account_id).unwrap_or(0))
    }

    #[payable]
    pub fn ft_transfer(&mut self, receiver_id: AccountId, amount: U128, memo: Option<String>) {
        assert_eq!(env::attached_deposit().as_yoctonear(), 1, "1 yocto");
        let _ = memo;
        self.transfer(&env::predecessor_account_id(), &receiver_id, amount.0);
    }

    #[payable]
    pub fn ft_transfer_call(
        &mut self,
        receiver_id: AccountId,
        amount: U128,
        memo: Option<String>,
        msg: String,
    ) -> Promise {
        assert_eq!(env::attached_deposit().as_yoctonear(), 1, "1 yocto");
        let _ = memo;
        let sender = env::predecessor_account_id();
        self.transfer(&sender, &receiver_id, amount.0);
        ext_receiver::ext(receiver_id.clone())
            .with_static_gas(Gas::from_tgas(35))
            .ft_on_transfer(sender.clone(), amount, msg)
            .then(
                ext_self::ext(env::current_account_id())
                    .with_static_gas(Gas::from_tgas(10))
                    .ft_resolve_transfer(sender, receiver_id, amount),
            )
    }

    #[private]
    pub fn ft_resolve_transfer(&mut self, sender_id: AccountId, receiver_id: AccountId, amount: U128) -> U128 {
        let unused = match env::promise_result(0) {
            PromiseResult::Successful(bytes) => {
                near_sdk::serde_json::from_slice::<U128>(&bytes).map(|value| value.0).unwrap_or(amount.0)
            }
            PromiseResult::Failed => amount.0,
        };
        let refund = unused.min(amount.0);
        if refund > 0 {
            let receiver_balance = self.balances.get(&receiver_id).unwrap_or(0);
            let moving = refund.min(receiver_balance);
            self.balances.insert(&receiver_id, &(receiver_balance - moving));
            let sender_balance = self.balances.get(&sender_id).unwrap_or(0);
            self.balances.insert(&sender_id, &(sender_balance + moving));
        }
        U128(amount.0 - refund)
    }
}

impl Contract {
    fn transfer(&mut self, sender: &AccountId, receiver: &AccountId, amount: u128) {
        assert!(self.registered.get(receiver).unwrap_or(false), "receiver not registered");
        let balance = self.balances.get(sender).unwrap_or(0);
        assert!(balance >= amount, "insufficient balance");
        self.balances.insert(sender, &(balance - amount));
        let dest = self.balances.get(receiver).unwrap_or(0);
        self.balances.insert(receiver, &(dest + amount));
    }
}
