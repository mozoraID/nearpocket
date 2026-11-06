import deployed from "@/config/deployed.json";
import { BRAND } from "@/config/brand";

export const NEAR_NETWORK = (process.env.NEXT_PUBLIC_NEAR_NETWORK ||
  "testnet") as "testnet" | "mainnet";

export const NEAR_CONFIG = {
  networkId: NEAR_NETWORK,
  nodeUrl:
    NEAR_NETWORK === "mainnet"
      ? "https://rpc.mainnet.near.org"
      : "https://rpc.testnet.near.org",
  /** Meteor Wallet (primary). MyNearWallet is in limited mode — not used. */
  walletUrl:
    NEAR_NETWORK === "mainnet"
      ? "https://wallet.meteorwallet.app"
      : "https://testnet.meteorwallet.app",
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
    BRAND.testnetContractId ||
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
