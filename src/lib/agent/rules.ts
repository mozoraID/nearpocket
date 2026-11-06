import type { WaitlistItem } from "./policy";

/**
 * Rule-based shopping agent (works with zero API keys).
 * If OPENAI_API_KEY / NEAR_AI_API_KEY is present server-side, /api/agent can enrich reasons.
 */
export function evaluateWaitlistItem(item: WaitlistItem): {
  status: WaitlistItem["status"];
  reason: string;
} {
  const drop =
    ((item.currentPriceUsdc - item.targetPriceUsdc) / item.targetPriceUsdc) *
    100;

  if (item.currentPriceUsdc <= item.targetPriceUsdc) {
    return {
      status: "awaiting_approval",
      reason: `Price hit target: ${item.currentPriceUsdc} ≤ ${item.targetPriceUsdc} USDC. Waiting for your approval.`,
    };
  }

  if (drop <= 5) {
    return {
      status: "ready",
      reason: `Within 5% of target (${drop.toFixed(1)}% above). Watching closely.`,
    };
  }

  return {
    status: "watching",
    reason: `Still ${drop.toFixed(1)}% above target. Agent keeps watching — no spend without you.`,
  };
}

export function simulatePriceTick(item: WaitlistItem): number {
  // Demo: gently drift toward target so waitlist demos feel alive
  const delta = (item.currentPriceUsdc - item.targetPriceUsdc) * 0.15;
  const noise = (Math.random() - 0.4) * 0.4;
  const next = Math.max(
    item.targetPriceUsdc * 0.9,
    item.currentPriceUsdc - delta + noise,
  );
  return Math.round(next * 100) / 100;
}

export function parseUserIntent(text: string): {
  title: string;
  merchant: string;
  category: string;
  targetPriceUsdc: number;
  currentPriceUsdc: number;
} {
  const lower = text.toLowerCase();
  let category = "digital";
  if (/grocery|snack|kopi|coffee|makan|food|nasi/.test(lower))
    category = "groceries";
  else if (/shoe|baju|fashion|hoodie|shirt/.test(lower)) category = "fashion";
  else if (/phone|laptop|earbud|gpu|keyboard|monitor/.test(lower))
    category = "electronics";
  else if (/game|nft|credit|steam|spotify/.test(lower)) category = "digital";
  else if (/ramen|burger|pizza|warung/.test(lower)) category = "food";

  const priceMatch = text.match(/(\d+(?:\.\d+)?)\s*(usdc|usd|\$)?/i);
  const target = priceMatch ? parseFloat(priceMatch[1]) : 20;

  const merchantMatch = text.match(/\b(?:at|from|di)\s+([A-Za-z0-9 ._-]{2,40})/i);
  const merchant = merchantMatch?.[1]?.trim() || "Open web merchant";

  return {
    title: text.trim().slice(0, 80) || "Untitled wish",
    merchant,
    category,
    targetPriceUsdc: target,
    currentPriceUsdc: Math.round(target * (1.08 + Math.random() * 0.2) * 100) / 100,
  };
}
