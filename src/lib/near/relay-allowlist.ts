/**
 * What the testnet relayer is willing to forward.
 * Kept free of near-api-js so the client and the server share one list.
 *
 * A meta-transaction (NEP-366) does not make the relayer the predecessor.
 * Spend methods run as the signing account and touch only that account's
 * policy, queue, and escrow. Admin methods still require the contract admin.
 */

/** 100 TGas. A NEAR transaction can hold at most 300 TGas. */
export const MAX_GAS_PER_ACTION = 100_000_000_000_000n;

export const DEFAULT_FUNCTION_GAS = 30_000_000_000_000n;

/** request/approve/withdraw may schedule an ft_transfer plus a callback. */
export const SPEND_FUNCTION_GAS = 80_000_000_000_000n;

export const MAX_ACTIONS = 8;

export const MAX_ARGS_BYTES = 4_096;

/** 1 yoctoNEAR. That is the NEP-141 deposit on ft_transfer. Nothing larger is relayed. */
export const MAX_TOTAL_DEPOSIT_YOCTO = 1n;

/** How far ahead of the current block a delegate may set max_block_height. */
export const MAX_BLOCK_HORIZON = 1_000n;

export const BLOCK_HEIGHT_TTL = 100n;

/** Prototype limits. In-memory, per server instance, not shared across instances. */
export const SENDER_DAILY_LIMIT = 40;
export const IP_WINDOW_LIMIT = 12;
export const IP_WINDOW_MS = 60_000;

/** Allowance attached when this app registers a function-call key (0.25 NEAR). */
export const LOCAL_KEY_ALLOWANCE_YOCTO = 250_000_000_000_000_000_000_000n;

export const DEFAULT_USDC_CONTRACT_ID = "usdc.fakes.testnet";

/**
 * Methods a connected wallet may call on its own state.
 * Views are included so a relayed read stays harmless.
 * This list is also the method set on the in-browser function-call key.
 */
export const USER_POLICY_METHODS = [
  "contract_version",
  "get_config",
  "get_policy",
  "get_escrow",
  "get_request",
  "get_item",
  "get_plan",
  "request_spend",
  "approve_spend",
  "reject_spend",
  "expire_spend",
  "withdraw",
  "queue_item",
  "set_item_status",
  "set_policy",
  "upsert_plan",
] as const;

/** Contract admin only: settlement account and the global pause. */
export const ADMIN_POLICY_METHODS = ["set_settlement_account", "set_global_paused"] as const;

export const POLICY_METHODS = [...USER_POLICY_METHODS, ...ADMIN_POLICY_METHODS] as const;

export type PolicyMethod = (typeof POLICY_METHODS)[number];

/**
 * predecessor must be the contract admin. Every other policy method
 * applies to the signing account.
 */
export const OWNER_ONLY_METHODS = ADMIN_POLICY_METHODS;

export type OwnerOnlyMethod = (typeof OWNER_ONLY_METHODS)[number];

export const TOKEN_METHODS = ["ft_transfer", "ft_transfer_call", "storage_deposit"] as const;

/** These two may attach exactly 1 yoctoNEAR. Every other method must attach 0. */
export const ONE_YOCTO_METHODS = new Set<string>(["ft_transfer", "ft_transfer_call"]);

const POLICY_SET = new Set<string>(POLICY_METHODS);
const OWNER_SET = new Set<string>(OWNER_ONLY_METHODS);
const TOKEN_SET = new Set<string>(TOKEN_METHODS);

export function isPolicyMethod(method: string): method is PolicyMethod {
  return POLICY_SET.has(method);
}

export function isOwnerOnlyMethod(method: string): method is OwnerOnlyMethod {
  return OWNER_SET.has(method);
}

export function isTokenMethod(method: string): boolean {
  return TOKEN_SET.has(method);
}
