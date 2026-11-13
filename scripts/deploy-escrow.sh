#!/usr/bin/env bash
# Deploy a fresh escrow contract on NEAR testnet.
# Create the account first. Do not deploy this wasm onto pocket.nearpocket.testnet.
set -euo pipefail
cd "$(dirname "$0")/.."

CONTRACT_ID="${CONTRACT_ID:-escrow.nearpocket.testnet}"
USDC_CONTRACT="${USDC_CONTRACT:-usdc.fakes.testnet}"
SETTLEMENT_ACCOUNT="${SETTLEMENT_ACCOUNT:-settle.nearpocket.testnet}"
NETWORK="${NEAR_NETWORK:-testnet}"
if [[ "$NETWORK" != "testnet" ]]; then
  echo "refusing network $NETWORK" >&2
  exit 1
fi

cargo +stable build --manifest-path contracts/agent-policy/Cargo.toml --target wasm32-unknown-unknown --release
cp contracts/agent-policy/target/wasm32-unknown-unknown/release/nearly_agent_policy.wasm contracts/agent-policy/res/nearly_agent_policy.wasm

near deploy "$CONTRACT_ID" contracts/agent-policy/res/nearly_agent_policy.wasm --networkId "$NETWORK"
near call "$CONTRACT_ID" new \
  "{\"usdc_contract\":\"$USDC_CONTRACT\",\"settlement_account\":\"$SETTLEMENT_ACCOUNT\"}" \
  --accountId "$CONTRACT_ID" --networkId "$NETWORK"
near call "$USDC_CONTRACT" storage_deposit \
  "{\"account_id\":\"$CONTRACT_ID\"}" \
  --accountId "$CONTRACT_ID" --deposit 0.0125 --networkId "$NETWORK"
near call "$USDC_CONTRACT" storage_deposit \
  "{\"account_id\":\"$SETTLEMENT_ACCOUNT\"}" \
  --accountId "$CONTRACT_ID" --deposit 0.0125 --networkId "$NETWORK"

echo "Deployed $CONTRACT_ID"
echo "Init: usdc_contract=$USDC_CONTRACT settlement_account=$SETTLEMENT_ACCOUNT"
echo "Set NEXT_PUBLIC_AGENT_POLICY_CONTRACT=$CONTRACT_ID and NEAR_CONTRACT_ID=$CONTRACT_ID"
