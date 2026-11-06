import type { WaitlistItem } from "./policy";

/**
 * Rule-based shopping agent (works with zero API keys).
 * If OPENAI_API_KEY / NEAR_AI_API_KEY is present server-side, /api/agent can enrich reasons.
 */

/** Rough demo FX → USDC for parsing user budgets in local currency */
const TO_USD: Record<string, number> = {
  USD: 1,
  USDC: 1,
  $: 1,
  EUR: 1.09,
  "€": 1.09,
  GBP: 1.27,
  "£": 1.27,
  IDR: 1 / 16250,
  RP: 1 / 16250,
  THB: 1 / 34.2,
  "฿": 1 / 34.2,
  MYR: 1 / 4.45,
  RM: 1 / 4.45,
  SGD: 1 / 1.34,
  PHP: 1 / 58.2,
  "₱": 1 / 58.2,
  VND: 1 / 25400,
  "₫": 1 / 25400,
  JPY: 1 / 151,
  "¥": 1 / 151,
  YEN: 1 / 151,
  KRW: 1 / 1385,
  "₩": 1 / 1385,
  INR: 1 / 83.5,
  "₹": 1 / 83.5,
};

export function evaluateWaitlistItem(item: WaitlistItem): {
  status: WaitlistItem["status"];
  reason: string;
} {
  const drop =
    ((item.currentPriceUsdc - item.targetPriceUsdc) / item.targetPriceUsdc) * 100;

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
  const delta = (item.currentPriceUsdc - item.targetPriceUsdc) * 0.15;
  const noise = (Math.random() - 0.4) * 0.4;
  const next = Math.max(
    item.targetPriceUsdc * 0.9,
    item.currentPriceUsdc - delta + noise,
  );
  return Math.round(next * 100) / 100;
}

/** Parse budgets like "$20", "฿500", "RM50", "300rb", "¥2000", "20 USDC" */
export function parseBudgetToUsdc(text: string): number | null {
  const raw = text.trim();
  // Indonesian "rb" / "ribu" (thousands of IDR)
  const rb = raw.match(/(\d+(?:[.,]\d+)?)\s*(rb|ribu)\b/i);
  if (rb) {
    const n = parseFloat(rb[1].replace(",", "."));
    if (n > 0) return Math.round(((n * 1000) / 16250) * 100) / 100;
  }
  // Symbol-first: $20 ฿500 ¥2000 €15 £10 ₱200 ₹500
  const sym = raw.match(/([$€£฿¥₩₱₹]|RM|Rp|USDC|USD|EUR|GBP|IDR|THB|MYR|SGD|PHP|VND|JPY|KRW|INR)\s*(\d+(?:[.,]\d+)?)/i);
  if (sym) {
    const unit = sym[1].toUpperCase();
    const n = parseFloat(sym[2].replace(",", "."));
    const rate = TO_USD[unit] ?? TO_USD[sym[1]] ?? null;
    if (rate && n > 0) return Math.round(n * rate * 100) / 100;
  }
  // Number-first: 20 USD, 500 THB, 300000 IDR
  const num = raw.match(/(\d+(?:[.,]\d+)?)\s*(USDC|USD|EUR|GBP|IDR|THB|MYR|SGD|PHP|VND|JPY|KRW|INR|RM|Rp|\$|€|£|฿|¥|₩|₱|₹)?/i);
  if (num) {
    const n = parseFloat(num[1].replace(",", "."));
    const unit = (num[2] || "USD").toUpperCase();
    const rate = TO_USD[unit] ?? 1;
    if (n > 0) return Math.round(n * rate * 100) / 100;
  }
  return null;
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
  if (/grocery|snack|kopi|coffee|makan|food|nasi|ramen|burger|pizza|warung/.test(lower))
    category = "food";
  else if (/shoe|baju|fashion|hoodie|shirt/.test(lower)) category = "fashion";
  else if (/phone|laptop|earbud|gpu|keyboard|monitor/.test(lower)) category = "electronics";
  else if (/game|nft|credit|steam|spotify/.test(lower)) category = "digital";

  const target = parseBudgetToUsdc(text) ?? 20;

  const merchantMatch = text.match(/\b(?:at|from|di|@)\s+([A-Za-z0-9 ._-]{2,40})/i);
  const merchant = merchantMatch?.[1]?.trim() || "Open web merchant";

  // Strip price tokens from title for cleaner label
  const title = text
    .replace(/(\d+(?:[.,]\d+)?)\s*(rb|ribu|usdc|usd|eur|gbp|idr|thb|myr|sgd|php|vnd|jpy|krw|inr|rm|rp)?/gi, " ")
    .replace(/[$€£฿¥₩₱₹]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80) || "Untitled wish";

  return {
    title,
    merchant,
    category,
    targetPriceUsdc: target,
    currentPriceUsdc: Math.round(target * (1.08 + Math.random() * 0.2) * 100) / 100,
  };
}
