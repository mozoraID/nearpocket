/**
 * NEAR Intents / 1Click client.
 *
 * Dry quotes (depositType INTENTS) work against the public API with no JWT.
 * Live execution is a separate path: dry=false quote → deposit address →
 * deposit transaction → status poll. 1Click settles on NEAR mainnet and the
 * deposit spends real tokens, so broadcast stays behind extra env flags and
 * this repo never turns those flags on.
 *
 * Docs: https://docs.near-intents.org/integration/distribution-channels/1click-api/quickstart/making-a-request
 */

const ONECLICK_BASE = "https://1click.chaindefuser.com";

/** Native USDC on NEAR (Circle). */
export const NEAR_USDC_ASSET =
  "nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1";

export const WRAP_NEAR_ASSET = "nep141:wrap.near";

const TOKEN_TO_ASSET: Record<string, string> = {
  NEAR: WRAP_NEAR_ASSET,
  WNEAR: WRAP_NEAR_ASSET,
  USDC: NEAR_USDC_ASSET,
};

export interface IntentQuote {
  id: string;
  fromToken: string;
  toToken: "USDC";
  fromAmount: string;
  toAmount: string;
  dry: boolean;
  real: boolean;
  note: string;
  amountInUsd?: string;
  amountOutUsd?: string;
  timeEstimateSec?: number;
  correlationId?: string;
  depositAddress?: string;
  depositMemo?: string;
}

export interface DepositPlan {
  kind: "ft_transfer" | "native_transfer";
  /** NEP-141 contract. Present for ft_transfer. */
  contractId?: string;
  methodName?: "ft_transfer";
  args?: { receiver_id: string; amount: string; memo?: string };
  receiverId: string;
  amount: string;
  /** 1 yoctoNEAR is required on ft_transfer. */
  attachedDepositYocto: string;
  gas: string;
}

export interface IntentStatus {
  status: string;
  correlationId?: string;
  updatedAt?: string;
}

export interface PreparedIntent {
  executed: false;
  broadcast: false;
  dry: false;
  fromToken: string;
  fromAmount: string;
  accountId: string;
  quoteRequest: Record<string, unknown>;
  quote: IntentQuote;
  depositPlan: DepositPlan;
  status: IntentStatus | null;
  note: string;
}

export class IntentExecutionDisabled extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IntentExecutionDisabled";
  }
}

export function yoctoFromNear(amount: string): string {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) return "0";
  const [whole, frac = ""] = String(amount).split(".");
  const fracPadded = (frac + "0".repeat(24)).slice(0, 24);
  const raw = `${whole.replace(/^0+/, "") || "0"}${fracPadded}`.replace(
    /^0+(?=\d)/,
    "",
  );
  return raw || "0";
}

export function smallestUnitAmount(fromToken: string, fromAmount: string): string {
  const token = fromToken.toUpperCase();
  if (token === "NEAR" || token === "WNEAR") return yoctoFromNear(fromAmount);
  return String(Math.round((parseFloat(fromAmount) || 0) * 1e6));
}

/**
 * Shared 1Click body. Dry quotes keep the public INTENTS deposit type
 * (no deposit address). Live execution uses ORIGIN_CHAIN so the response
 * includes a deposit address the caller would fund.
 */
export function buildOneClickQuoteBody(input: {
  dry: boolean;
  fromToken: string;
  fromAmount: string;
  accountId: string;
  deadlineIso: string;
}): Record<string, unknown> | null {
  const token = input.fromToken.toUpperCase();
  const originAsset = TOKEN_TO_ASSET[token];
  if (!originAsset || token === "USDC") return null;
  const live = !input.dry;
  return {
    dry: input.dry,
    swapType: "EXACT_INPUT",
    slippageTolerance: 100,
    originAsset,
    depositType: live ? "ORIGIN_CHAIN" : "INTENTS",
    destinationAsset: NEAR_USDC_ASSET,
    amount: smallestUnitAmount(token, input.fromAmount),
    refundTo: input.accountId,
    refundType: live ? "ORIGIN_CHAIN" : "INTENTS",
    recipient: input.accountId,
    recipientType: live ? "DESTINATION_CHAIN" : "INTENTS",
    deadline: input.deadlineIso,
  };
}

export function buildDepositPlan(input: {
  originAsset: string;
  depositAddress: string;
  amount: string;
  depositMemo?: string;
}): DepositPlan {
  if (input.originAsset.startsWith("nep141:")) {
    const contractId = input.originAsset.slice("nep141:".length);
    const args: { receiver_id: string; amount: string; memo?: string } = {
      receiver_id: input.depositAddress,
      amount: input.amount,
    };
    if (input.depositMemo) args.memo = input.depositMemo;
    return {
      kind: "ft_transfer",
      contractId,
      methodName: "ft_transfer",
      args,
      receiverId: input.depositAddress,
      amount: input.amount,
      attachedDepositYocto: "1",
      gas: "30000000000000",
    };
  }
  return {
    kind: "native_transfer",
    receiverId: input.depositAddress,
    amount: input.amount,
    attachedDepositYocto: "0",
    gas: "30000000000000",
  };
}

/**
 * Why a deposit must not be broadcast. Returns null only when every explicit
 * ack is set. This process never sets those variables.
 */
export function intentBroadcastBlockReason(): string | null {
  if (process.env.NEAR_INTENTS_EXECUTE !== "1") {
    return "Set NEAR_INTENTS_EXECUTE=1 to enable the live 1Click path. The default path is dry quotes only.";
  }
  if (process.env.NEAR_INTENTS_BROADCAST !== "1" || process.env.NEAR_INTENTS_MAINNET_ACK !== "1") {
    return "Deposit broadcast is off. 1Click settles on NEAR mainnet and spends real funds. NearPocket does not set NEAR_INTENTS_BROADCAST or NEAR_INTENTS_MAINNET_ACK.";
  }
  return null;
}

function localDryQuote(fromToken: string, fromAmount: string): IntentQuote {
  const amt = parseFloat(fromAmount) || 0;
  const rate =
    fromToken.toUpperCase() === "NEAR"
      ? 5.2
      : fromToken.toUpperCase() === "USDT"
        ? 1
        : 1;
  return {
    id: `dry_local_${Date.now().toString(36)}`,
    fromToken,
    toToken: "USDC",
    fromAmount,
    toAmount: (amt * rate).toFixed(6),
    dry: true,
    real: false,
    note:
      "Labeled dry-run (1Click unreachable). Production routing uses NEAR Intents 1Click → USDC on NEAR.",
  };
}

type FetchLike = typeof fetch;

/**
 * Prefer a real 1Click dry quote (no deposit address). Falls back to a labeled local dry-run.
 */
export async function quoteAnyToUsdc(
  fromToken: string,
  fromAmount: string,
  opts?: { accountId?: string; fetchImpl?: FetchLike },
): Promise<IntentQuote> {
  const token = fromToken.toUpperCase();
  if (token === "USDC") {
    return {
      id: `passthrough_${Date.now().toString(36)}`,
      fromToken,
      toToken: "USDC",
      fromAmount,
      toAmount: fromAmount,
      dry: true,
      real: true,
      note: "Already USDC on NEAR — no Intent swap needed.",
    };
  }

  const account =
    opts?.accountId &&
    (opts.accountId.endsWith(".near") || opts.accountId.endsWith(".testnet"))
      ? opts.accountId
      : "pocket.nearpocket.testnet";

  const deadline = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const body = buildOneClickQuoteBody({
    dry: true,
    fromToken,
    fromAmount,
    accountId: account,
    deadlineIso: deadline,
  });
  if (!body) return localDryQuote(fromToken, fromAmount);

  const fetchImpl = opts?.fetchImpl ?? fetch;
  try {
    const res = await fetchImpl(`${ONECLICK_BASE}/v0/quote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });

    const payload = await res.json();
    if (!res.ok || !payload?.quote) {
      return {
        ...localDryQuote(fromToken, fromAmount),
        note: `1Click dry quote unavailable (${res.status}). Using labeled local dry-run. ${payload?.message || ""}`.trim(),
        correlationId: payload?.correlationId,
      };
    }

    const q = payload.quote;
    return {
      id: `1click_${Date.now().toString(36)}`,
      fromToken,
      toToken: "USDC",
      fromAmount,
      toAmount: String(q.amountOutFormatted ?? q.amountOut ?? "0"),
      dry: true,
      real: true,
      note:
        "Real NEAR Intents 1Click dry quote (no deposit). Any token → native USDC on NEAR.",
      amountInUsd: q.amountInUsd,
      amountOutUsd: q.amountOutUsd,
      timeEstimateSec: q.timeEstimate,
      correlationId: payload.correlationId,
    };
  } catch {
    return localDryQuote(fromToken, fromAmount);
  }
}

/** @deprecated use quoteAnyToUsdc — kept for older imports */
export async function dryQuoteAnyToUsdc(
  fromToken: string,
  fromAmount: string,
): Promise<IntentQuote> {
  return quoteAnyToUsdc(fromToken, fromAmount);
}

export function statusUrl(depositAddress: string, depositMemo?: string): string {
  const url = new URL(`${ONECLICK_BASE}/v0/status`);
  url.searchParams.set("depositAddress", depositAddress);
  if (depositMemo) url.searchParams.set("depositMemo", depositMemo);
  return url.toString();
}

/** GET /v0/status. Does not move funds. */
export async function pollIntentStatus(
  depositAddress: string,
  opts?: { depositMemo?: string; attempts?: number; intervalMs?: number; fetchImpl?: FetchLike },
): Promise<IntentStatus> {
  const attempts = Math.max(1, opts?.attempts ?? 1);
  const intervalMs = opts?.intervalMs ?? 0;
  const fetchImpl = opts?.fetchImpl ?? fetch;
  let last: IntentStatus = { status: "UNKNOWN" };
  for (let i = 0; i < attempts; i++) {
    const res = await fetchImpl(statusUrl(depositAddress, opts?.depositMemo), { cache: "no-store" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(`1Click status ${res.status}: ${body?.message || "unavailable"}`);
    }
    last = {
      status: String(body.status || "UNKNOWN"),
      correlationId: body.correlationId,
      updatedAt: body.updatedAt,
    };
    const terminal = ["SUCCESS", "REFUNDED", "FAILED"].includes(last.status);
    if (terminal || i === attempts - 1) return last;
    if (intervalMs > 0) await new Promise((r) => setTimeout(r, intervalMs));
  }
  return last;
}

/**
 * Live path, gated by NEAR_INTENTS_EXECUTE=1.
 * Requests a non-dry quote, builds the deposit transaction, and reads status.
 * Does not broadcast. Broadcasting is `broadcastIntentDeposit`.
 */
export async function prepareIntentExecution(input: {
  fromToken: string;
  fromAmount: string;
  accountId: string;
  fetchImpl?: FetchLike;
  deadlineIso?: string;
}): Promise<PreparedIntent> {
  if (process.env.NEAR_INTENTS_EXECUTE !== "1") {
    throw new IntentExecutionDisabled(
      "Live 1Click execution is off. Set NEAR_INTENTS_EXECUTE=1 to request a non-dry quote. Dry quotes stay available without it. Execution was not run: 1Click settles on NEAR mainnet and spends real funds.",
    );
  }
  const accountId = input.accountId.trim();
  if (!accountId.endsWith(".near")) {
    throw new IntentExecutionDisabled(
      "1Click delivers on NEAR mainnet. Pass a .near recipient. Refusing to open a live quote for a testnet account.",
    );
  }
  const token = input.fromToken.toUpperCase();
  const deadlineIso = input.deadlineIso || new Date(Date.now() + 10 * 60 * 1000).toISOString();
  const quoteRequest = buildOneClickQuoteBody({
    dry: false,
    fromToken: token,
    fromAmount: input.fromAmount,
    accountId,
    deadlineIso,
  });
  if (!quoteRequest) {
    throw new IntentExecutionDisabled(
      `No 1Click origin asset for ${token}. Supported live inputs: NEAR, wNEAR.`,
    );
  }

  const fetchImpl = input.fetchImpl ?? fetch;
  const res = await fetchImpl(`${ONECLICK_BASE}/v0/quote`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(quoteRequest),
    cache: "no-store",
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok || !payload?.quote?.depositAddress) {
    throw new Error(
      `1Click non-dry quote failed (${res.status}): ${payload?.message || "no deposit address"}`,
    );
  }
  const q = payload.quote;
  const originAsset = String(quoteRequest.originAsset);
  const depositPlan = buildDepositPlan({
    originAsset,
    depositAddress: String(q.depositAddress),
    amount: String(quoteRequest.amount),
    depositMemo: q.depositMemo ? String(q.depositMemo) : undefined,
  });
  const quote: IntentQuote = {
    id: `1click_live_${Date.now().toString(36)}`,
    fromToken: token,
    toToken: "USDC",
    fromAmount: input.fromAmount,
    toAmount: String(q.amountOutFormatted ?? q.amountOut ?? "0"),
    dry: false,
    real: true,
    note: "Non-dry 1Click quote. Deposit is NOT submitted by NearPocket.",
    amountInUsd: q.amountInUsd,
    amountOutUsd: q.amountOutUsd,
    timeEstimateSec: q.timeEstimate,
    correlationId: payload.correlationId,
    depositAddress: String(q.depositAddress),
    depositMemo: q.depositMemo ? String(q.depositMemo) : undefined,
  };

  let status: IntentStatus | null = null;
  try {
    status = await pollIntentStatus(String(q.depositAddress), {
      depositMemo: quote.depositMemo,
      attempts: 1,
      fetchImpl,
    });
  } catch {
    status = null;
  }

  return {
    executed: false,
    broadcast: false,
    dry: false,
    fromToken: token,
    fromAmount: input.fromAmount,
    accountId,
    quoteRequest,
    quote,
    depositPlan,
    status,
    note: "Quote and deposit plan only. broadcastIntentDeposit was not called.",
  };
}

/**
 * Submit the deposit transaction. Refuses unless NEAR_INTENTS_EXECUTE,
 * NEAR_INTENTS_BROADCAST, and NEAR_INTENTS_MAINNET_ACK are all "1".
 * 1Click deposit addresses are mainnet. The product stays on testnet and does not broadcast this.
 */
export async function broadcastIntentDeposit(
  plan: DepositPlan,
  opts: { accountId: string; privateKey: string },
): Promise<{ txHash: string; explorerUrl: string }> {
  const blocked = intentBroadcastBlockReason();
  if (blocked) throw new IntentExecutionDisabled(blocked);
  if (!opts.accountId.endsWith(".near")) {
    throw new IntentExecutionDisabled("Refusing broadcast: signer is not a mainnet .near account.");
  }
  if (!opts.privateKey.startsWith("ed25519:")) {
    throw new IntentExecutionDisabled("Refusing broadcast: signer key is missing.");
  }

  const { Account, JsonRpcProvider, actions } = await import("near-api-js");
  const provider = new JsonRpcProvider({ url: "https://rpc.mainnet.near.org" });
  const account = new Account(opts.accountId, provider, opts.privateKey as `ed25519:${string}`);

  if (plan.kind === "ft_transfer") {
    if (!plan.contractId || !plan.args) {
      throw new IntentExecutionDisabled("Deposit plan is missing the ft_transfer target.");
    }
    const res = await account.callFunctionRaw({
      contractId: plan.contractId,
      methodName: "ft_transfer",
      args: plan.args,
      deposit: BigInt(plan.attachedDepositYocto),
      gas: BigInt(plan.gas),
    });
    const hash = res.transaction.hash;
    return { txHash: hash, explorerUrl: `https://nearblocks.io/txns/${hash}` };
  }

  const res = await account.signAndSendTransaction({
    receiverId: plan.receiverId,
    actions: [actions.transfer(BigInt(plan.amount))],
  });
  const hash = res.transaction.hash;
  return { txHash: hash, explorerUrl: `https://nearblocks.io/txns/${hash}` };
}
