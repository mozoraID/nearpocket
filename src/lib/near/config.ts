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
  /**
   * Optional deployed agent-policy contract.
   * Leave empty → UI uses local policy + clearly labeled demo receipts.
   */
  agentPolicyContract:
    process.env.NEXT_PUBLIC_AGENT_POLICY_CONTRACT || "",
};

export const DEMO_ACCOUNT = {
  accountId: "demo.nearly.testnet",
  displayBalanceUsdc: 128.5,
  displayNear: 12.04,
};
