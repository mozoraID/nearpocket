/**
 * NEAR Intents shaped client (dry-run).
 * Real 1Click API needs mainnet + partner JWT (optional). See docs.near-intents.org.
 * Hackathon Q-007: no Intents testnet — we dry-run quotes and mark them clearly.
 */

export interface IntentQuote {
  id: string;
  fromToken: string;
  toToken: "USDC";
  fromAmount: string;
  toAmount: string;
  dry: true;
  note: string;
}

export async function dryQuoteAnyToUsdc(
  fromToken: string,
  fromAmount: string,
): Promise<IntentQuote> {
  // Placeholder conversion for demo UX
  const amt = parseFloat(fromAmount) || 0;
  const rate =
    fromToken.toUpperCase() === "NEAR"
      ? 5.2
      : fromToken.toUpperCase() === "USDT"
        ? 1
        : 1;
  return {
    id: `dry_${Date.now().toString(36)}`,
    fromToken,
    toToken: "USDC",
    fromAmount,
    toAmount: (amt * rate).toFixed(6),
    dry: true,
    note:
      "Dry-run Intent quote. Production uses NEAR Intents 1Click API on mainnet " +
      "(any chain/token → USDC). No testnet for Intents (hackathon Q-007).",
  };
}
