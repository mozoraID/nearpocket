/**
 * NEAR Intents / 1Click client.
 * Public dry quotes work without a partner JWT when depositType is INTENTS.
 * Docs: https://docs.near-intents.org/
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
}

function yoctoFromNear(amount: string): string {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) return "0";
  // 1 NEAR = 10^24 yocto; keep integer string without scientific notation
  const [whole, frac = ""] = String(amount).split(".");
  const fracPadded = (frac + "0".repeat(24)).slice(0, 24);
  const raw = `${whole.replace(/^0+/, "") || "0"}${fracPadded}`.replace(
    /^0+(?=\d)/,
    "",
  );
  return raw || "0";
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

/**
 * Prefer a real 1Click dry quote (no deposit address). Falls back to a labeled local dry-run.
 */
export async function quoteAnyToUsdc(
  fromToken: string,
  fromAmount: string,
  opts?: { accountId?: string },
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

  const originAsset = TOKEN_TO_ASSET[token];
  if (!originAsset) {
    return localDryQuote(fromToken, fromAmount);
  }

  const account =
    opts?.accountId &&
    (opts.accountId.endsWith(".near") || opts.accountId.endsWith(".testnet"))
      ? opts.accountId
      : "nearly-7b1462.testnet";

  const amount =
    token === "NEAR" || token === "WNEAR"
      ? yoctoFromNear(fromAmount)
      : // USDT-like 6 decimals fallback
        String(Math.round((parseFloat(fromAmount) || 0) * 1e6));

  const deadline = new Date(Date.now() + 60 * 60 * 1000).toISOString();

  try {
    const res = await fetch(`${ONECLICK_BASE}/v0/quote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dry: true,
        swapType: "EXACT_INPUT",
        slippageTolerance: 100,
        originAsset,
        depositType: "INTENTS",
        destinationAsset: NEAR_USDC_ASSET,
        amount,
        refundTo: account,
        refundType: "INTENTS",
        recipient: account,
        recipientType: "INTENTS",
        deadline,
      }),
      // Edge / serverless friendly
      cache: "no-store",
    });

    const body = await res.json();
    if (!res.ok || !body?.quote) {
      return {
        ...localDryQuote(fromToken, fromAmount),
        note: `1Click dry quote unavailable (${res.status}). Using labeled local dry-run. ${body?.message || ""}`.trim(),
        correlationId: body?.correlationId,
      };
    }

    const q = body.quote;
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
