import type { WaitlistItem } from "@/lib/agent/policy";
import type { DisplayCurrencyCode } from "./display-currency";
import { getDisplayCurrency } from "./display-currency";

/** Demo pending approval + sample activity flavor by home currency */
export function demoWaitlistFor(currency: DisplayCurrencyCode): WaitlistItem {
  const meta = getDisplayCurrency(currency);
  const presets: Record<string, { title: string; merchant: string; marketplace: string; price: number; budget: number }> = {
    IDR: { title: "Wireless earbuds", merchant: "Tokopedia", marketplace: "Tokopedia", price: 18.5, budget: 20 },
    THB: { title: "Noise-cancelling buds", merchant: "Shopee TH", marketplace: "Shopee", price: 17.2, budget: 20 },
    MYR: { title: "Wireless earbuds", merchant: "Lazada MY", marketplace: "Lazada", price: 16.8, budget: 20 },
    SGD: { title: "USB-C hub", merchant: "Shopee SG", marketplace: "Shopee", price: 22.0, budget: 25 },
    PHP: { title: "Wireless earbuds", merchant: "Shopee PH", marketplace: "Shopee", price: 15.5, budget: 18 },
    VND: { title: "Bluetooth speaker", merchant: "Shopee VN", marketplace: "Shopee", price: 14.0, budget: 16 },
    JPY: { title: "Mechanical keyboard", merchant: "Amazon JP", marketplace: "Amazon JP", price: 48.0, budget: 55 },
    KRW: { title: "Wireless earbuds", merchant: "Coupang", marketplace: "Coupang", price: 21.0, budget: 25 },
    INR: { title: "USB-C earbuds", merchant: "Amazon IN", marketplace: "Amazon", price: 12.5, budget: 15 },
    EUR: { title: "Wireless earbuds", merchant: "Amazon DE", marketplace: "Amazon", price: 24.0, budget: 28 },
    GBP: { title: "Wireless earbuds", merchant: "Amazon UK", marketplace: "Amazon", price: 23.0, budget: 27 },
    USD: { title: "Wireless earbuds", merchant: "Amazon", marketplace: "Amazon", price: 19.99, budget: 25 },
  };
  const p = presets[meta.code] || presets.USD;
  const now = new Date().toISOString();
  return {
    id: `demo_${meta.code.toLowerCase()}_ok`,
    title: p.title,
    merchant: p.merchant,
    category: "electronics",
    targetPriceUsdc: p.budget,
    currentPriceUsdc: p.price,
    maxBudgetUsdc: p.budget,
    status: "awaiting_approval",
    marketplace: p.marketplace,
    mocked: true,
    agentReason: `Demo · ${meta.flag} ${meta.country} — approve or reject.`,
    notes: "demo",
    createdAt: now,
    updatedAt: now,
  };
}
