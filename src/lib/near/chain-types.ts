export interface ChainSpendRequest {
  id: string;
  title: string;
  category: string;
  amountUsdc: number;
  amountUsdc6: string;
  status: string;
  expiresAtNs: string;
  /** Account that receives USDC when this request is approved. */
  settlementAccount: string;
}

export interface WalletBalances {
  walletUsdc: number;
  escrowAvailableUsdc: number;
  escrowLockedUsdc: number;
  registered: boolean;
  minStorageYocto: string;
  usdcContract: string;
  policyContract: string;
  requests?: ChainSpendRequest[];
  requestsLoaded?: boolean;
  settlementAccount?: string;
  /** True when this object is the previous successful read, not a fresh one. */
  stale?: boolean;
}
