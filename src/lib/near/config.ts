import deployed from "@/config/deployed.json";

export const NEAR_NETWORK = (process.env.NEXT_PUBLIC_NEAR_NETWORK ||
  "testnet") as "testnet" | "mainnet";

export const NEAR_CONFIG = {
  networkId: NEAR_NETWORK,
  nodeUrl:
    NEAR_NETWORK === "mainnet"
      ? "https://rpc.mainnet.near.org"
      : "https://rpc.testnet.near.org",
  walletUrl:
    NEAR_NETWORK === "mainnet"
      ? "https://app.mynearwallet.com"
      : "https://testnet.mynearwallet.com",
  helperUrl:
    NEAR_NETWORK === "mainnet"
      ? "https://helper.mainnet.near.org"
      : "https://helper.testnet.near.org",
  explorerUrl:
    NEAR_NETWORK === "mainnet"
      ? "https://nearblocks.io"
      : "https://testnet.nearblocks.io",
  /** Deployed agent-policy contract (override with NEXT_PUBLIC_AGENT_POLICY_CONTRACT). */
  agentPolicyContract:
    process.env.NEXT_PUBLIC_AGENT_POLICY_CONTRACT ||
    deployed.contractId ||
    "",
};

export const DEMO_ACCOUNT = {
  accountId: "demo.local",
  displayBalanceUsdc: 128.5,
  displayNear: 12.04,
};

export function explorerTxUrl(hash: string) {
  return `${NEAR_CONFIG.explorerUrl}/txns/${hash}`;
}

export function explorerAccountUrl(accountId: string) {
  return `${NEAR_CONFIG.explorerUrl}/address/${accountId}`;
}
