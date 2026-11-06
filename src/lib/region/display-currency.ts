/**
 * Home country + display currency for NearPocket.
 * Only currencies the app actually handles (QR rails or card/worldwide).
 */

export type DisplayCurrencyCode =
  | "USD"
  | "EUR"
  | "GBP"
  | "IDR"
  | "THB"
  | "MYR"
  | "SGD"
  | "PHP"
  | "VND"
  | "JPY"
  | "KRW"
  | "INR";

export interface DisplayCurrency {
  code: DisplayCurrencyCode;
  /** ISO country or WW */
  countryCode: string;
  country: string;
  flag: string;
  symbol: string;
  /** Local QR / payout rail label (demo where noted) */
  rail: string;
  /** zero-decimal fiat */
  zeroDecimal?: boolean;
  /** Shown as worldwide card corridor */
  worldwide?: boolean;
  demo?: boolean;
}

/** Order used in Settings picker + FX table */
export const DISPLAY_CURRENCIES: DisplayCurrency[] = [
  {
    code: "USD",
    countryCode: "WW",
    country: "Worldwide",
    flag: "🌐",
    symbol: "$",
    rail: "NearPocket Card · USD",
    worldwide: true,
  },
  {
    code: "EUR",
    countryCode: "EU",
    country: "Europe",
    flag: "🇪🇺",
    symbol: "€",
    rail: "NearPocket Card · EUR",
    worldwide: true,
  },
  {
    code: "GBP",
    countryCode: "GB",
    country: "United Kingdom",
    flag: "🇬🇧",
    symbol: "£",
    rail: "NearPocket Card · GBP",
    worldwide: true,
  },
  {
    code: "IDR",
    countryCode: "ID",
    country: "Indonesia",
    flag: "🇮🇩",
    symbol: "Rp",
    rail: "QRIS",
    zeroDecimal: true,
  },
  {
    code: "THB",
    countryCode: "TH",
    country: "Thailand",
    flag: "🇹🇭",
    symbol: "฿",
    rail: "PromptPay",
  },
  {
    code: "MYR",
    countryCode: "MY",
    country: "Malaysia",
    flag: "🇲🇾",
    symbol: "RM",
    rail: "DuitNow QR",
  },
  {
    code: "SGD",
    countryCode: "SG",
    country: "Singapore",
    flag: "🇸🇬",
    symbol: "S$",
    rail: "PayNow / SGQR",
  },
  {
    code: "PHP",
    countryCode: "PH",
    country: "Philippines",
    flag: "🇵🇭",
    symbol: "₱",
    rail: "QR Ph",
    demo: true,
  },
  {
    code: "VND",
    countryCode: "VN",
    country: "Vietnam",
    flag: "🇻🇳",
    symbol: "₫",
    rail: "VietQR",
    zeroDecimal: true,
    demo: true,
  },
  {
    code: "JPY",
    countryCode: "JP",
    country: "Japan",
    flag: "🇯🇵",
    symbol: "¥",
    rail: "JPQR",
    zeroDecimal: true,
  },
  {
    code: "KRW",
    countryCode: "KR",
    country: "South Korea",
    flag: "🇰🇷",
    symbol: "₩",
    rail: "Korea QR",
    zeroDecimal: true,
  },
  {
    code: "INR",
    countryCode: "IN",
    country: "India",
    flag: "🇮🇳",
    symbol: "₹",
    rail: "UPI (demo)",
    zeroDecimal: true,
    demo: true,
  },
];

export const DISPLAY_CURRENCY_CODES = DISPLAY_CURRENCIES.map((c) => c.code);

export function getDisplayCurrency(code: string | null | undefined): DisplayCurrency {
  const c = (code || "USD").toUpperCase();
  return DISPLAY_CURRENCIES.find((x) => x.code === c) || DISPLAY_CURRENCIES[0];
}

/** Map browser locale / timezone → best guess display currency */
export function detectDisplayCurrency(opts?: {
  locale?: string;
  timeZone?: string;
}): DisplayCurrencyCode {
  const locale = (opts?.locale || (typeof navigator !== "undefined" ? navigator.language : "en-US") || "en-US").toLowerCase();
  let timeZone = opts?.timeZone || "";
  try {
    if (!timeZone && typeof Intl !== "undefined") {
      timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    }
  } catch { /* */ }

  const region =
    locale.split("-")[1]?.toUpperCase() ||
    locale.split("_")[1]?.toUpperCase() ||
    "";

  const byRegion: Record<string, DisplayCurrencyCode> = {
    ID: "IDR",
    TH: "THB",
    MY: "MYR",
    SG: "SGD",
    PH: "PHP",
    VN: "VND",
    JP: "JPY",
    KR: "KRW",
    IN: "INR",
    US: "USD",
    GB: "GBP",
    UK: "GBP",
    DE: "EUR",
    FR: "EUR",
    NL: "EUR",
    ES: "EUR",
    IT: "EUR",
    PT: "EUR",
    IE: "EUR",
    AT: "EUR",
    BE: "EUR",
    FI: "EUR",
  };
  if (region && byRegion[region]) return byRegion[region];

  const tz = timeZone.toLowerCase();
  if (tz.includes("jakarta") || tz.includes("makassar") || tz.includes("jayapura")) return "IDR";
  if (tz.includes("bangkok")) return "THB";
  if (tz.includes("kuala_lumpur")) return "MYR";
  if (tz.includes("singapore")) return "SGD";
  if (tz.includes("manila")) return "PHP";
  if (tz.includes("ho_chi_minh") || tz.includes("saigon") || tz.includes("hanoi")) return "VND";
  if (tz.includes("tokyo")) return "JPY";
  if (tz.includes("seoul")) return "KRW";
  if (tz.includes("kolkata") || tz.includes("calcutta") || tz.includes("mumbai")) return "INR";
  if (tz.includes("london")) return "GBP";
  if (tz.includes("berlin") || tz.includes("paris") || tz.includes("madrid") || tz.includes("rome") || tz.includes("amsterdam"))
    return "EUR";

  if (locale.startsWith("id")) return "IDR";
  if (locale.startsWith("th")) return "THB";
  if (locale.startsWith("ms")) return "MYR";
  if (locale.startsWith("ja")) return "JPY";
  if (locale.startsWith("ko")) return "KRW";
  if (locale.startsWith("vi")) return "VND";
  if (locale.startsWith("hi") || locale.startsWith("en-in")) return "INR";
  if (locale.startsWith("en-gb")) return "GBP";
  if (locale.startsWith("de") || locale.startsWith("fr") || locale.startsWith("es") || locale.startsWith("it") || locale.startsWith("nl"))
    return "EUR";

  return "USD";
}

export function formatDisplayAmount(amount: number, code: string): string {
  const meta = getDisplayCurrency(code);
  const digits = meta.zeroDecimal ? 0 : 2;
  const n = meta.zeroDecimal ? Math.round(amount) : amount;
  return `${meta.symbol}${n.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
}

/** Country codes that prefer local marketplaces first */
export function marketplaceCountryFor(currency: string): string {
  const meta = getDisplayCurrency(currency);
  if (meta.worldwide || meta.countryCode === "EU" || meta.countryCode === "GB") return "WW";
  return meta.countryCode;
}
