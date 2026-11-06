export type RailId =
  | "qris-id"
  | "promptpay-th"
  | "duitnow-my"
  | "nets-sg"
  | "jpqr-jp"
  | "kakaopay-kr"
  | "card-intl";

export interface PaymentRail {
  id: RailId;
  country: string;
  countryCode: string;
  currency: string;
  currencySymbol: string;
  name: string;
  kind: "emvco-qr" | "card" | "link";
  /** ISO 4217 numeric where relevant */
  currencyNumeric?: string;
  tip: string;
}

export const RAILS: Record<RailId, PaymentRail> = {
  "qris-id": {
    id: "qris-id",
    country: "Indonesia",
    countryCode: "ID",
    currency: "IDR",
    currencySymbol: "Rp",
    name: "QRIS",
    kind: "emvco-qr",
    currencyNumeric: "360",
    tip: "Cross-border live: TH, MY, SG, JP, KR (+ CN pending BI listing).",
  },
  "promptpay-th": {
    id: "promptpay-th",
    country: "Thailand",
    countryCode: "TH",
    currency: "THB",
    currencySymbol: "฿",
    name: "PromptPay",
    kind: "emvco-qr",
    currencyNumeric: "764",
    tip: "QRIS–PromptPay corridor via BI / BOT linkage.",
  },
  "duitnow-my": {
    id: "duitnow-my",
    country: "Malaysia",
    countryCode: "MY",
    currency: "MYR",
    currencySymbol: "RM",
    name: "DuitNow QR",
    kind: "emvco-qr",
    currencyNumeric: "458",
    tip: "QRIS–DuitNow corridor via BI / BNM.",
  },
  "nets-sg": {
    id: "nets-sg",
    country: "Singapore",
    countryCode: "SG",
    currency: "SGD",
    currencySymbol: "S$",
    name: "NETS QR / PayNow",
    kind: "emvco-qr",
    currencyNumeric: "702",
    tip: "QRIS–NETS corridor via BI / MAS.",
  },
  "jpqr-jp": {
    id: "jpqr-jp",
    country: "Japan",
    countryCode: "JP",
    currency: "JPY",
    currencySymbol: "¥",
    name: "JPQR",
    kind: "emvco-qr",
    currencyNumeric: "392",
    tip: "QRIS–JPQR corridor via BI / BOJ partners.",
  },
  "kakaopay-kr": {
    id: "kakaopay-kr",
    country: "South Korea",
    countryCode: "KR",
    currency: "KRW",
    currencySymbol: "₩",
    name: "KakaoPay / Zero Pay",
    kind: "emvco-qr",
    currencyNumeric: "410",
    tip: "QRIS–Korea corridor via BI partners.",
  },
  "card-intl": {
    id: "card-intl",
    country: "Worldwide",
    countryCode: "WW",
    currency: "USD",
    currencySymbol: "$",
    name: "Virtual card / payment link",
    kind: "card",
    tip: "Non-QR markets: NEAR Intents → USDC → card/link via partner (demo mocked).",
  },
};

export function railFromCurrency(currency?: string, countryHint?: string): PaymentRail {
  const c = (currency || "").toUpperCase();
  const h = (countryHint || "").toUpperCase();
  if (c === "IDR" || h === "ID" || h.includes("INDONESIA")) return RAILS["qris-id"];
  if (c === "THB" || h === "TH") return RAILS["promptpay-th"];
  if (c === "MYR" || h === "MY") return RAILS["duitnow-my"];
  if (c === "SGD" || h === "SG") return RAILS["nets-sg"];
  if (c === "JPY" || h === "JP") return RAILS["jpqr-jp"];
  if (c === "KRW" || h === "KR") return RAILS["kakaopay-kr"];
  return RAILS["card-intl"];
}
