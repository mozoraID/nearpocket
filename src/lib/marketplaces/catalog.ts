import type { MarketplaceId } from "./types";

export interface MarketplaceMeta {
  id: MarketplaceId;
  label: string;
  /** 1–2 letter badge */
  mark: string;
  /** badge bg */
  color: string;
  textColor?: string;
  countries: string[]; // ISO or "WW"
  region: string;
  searchUrl: (q: string) => string;
  defaultConnected?: boolean;
}

export const MARKETPLACE_CATALOG: MarketplaceMeta[] = [
  {
    id: "tokopedia",
    label: "Tokopedia",
    mark: "Tp",
    color: "#42b549",
    countries: ["ID"],
    region: "Indonesia",
    searchUrl: (q) => `https://www.tokopedia.com/search?q=${encodeURIComponent(q)}`,
    defaultConnected: true,
  },
  {
    id: "shopee",
    label: "Shopee",
    mark: "Sh",
    color: "#ee4d2d",
    countries: ["ID", "SG", "MY", "TH"],
    region: "SEA",
    searchUrl: (q) => `https://shopee.co.id/search?keyword=${encodeURIComponent(q)}`,
    defaultConnected: true,
  },
  {
    id: "lazada",
    label: "Lazada",
    mark: "Lz",
    color: "#0f146d",
    countries: ["ID", "SG", "MY", "TH"],
    region: "SEA",
    searchUrl: (q) => `https://www.lazada.co.id/catalog/?q=${encodeURIComponent(q)}`,
    defaultConnected: true,
  },
  {
    id: "blibli",
    label: "Blibli",
    mark: "Bl",
    color: "#0095da",
    countries: ["ID"],
    region: "Indonesia",
    searchUrl: (q) => `https://www.blibli.com/cari/${encodeURIComponent(q)}`,
  },
  {
    id: "rakuten",
    label: "Rakuten",
    mark: "Rk",
    color: "#bf0000",
    countries: ["JP"],
    region: "Japan",
    searchUrl: (q) => `https://search.rakuten.co.jp/search/mall/${encodeURIComponent(q)}/`,
  },
  {
    id: "amazon-jp",
    label: "Amazon JP",
    mark: "A+",
    color: "#232f3e",
    countries: ["JP"],
    region: "Japan",
    searchUrl: (q) => `https://www.amazon.co.jp/s?k=${encodeURIComponent(q)}`,
  },
  {
    id: "coupang",
    label: "Coupang",
    mark: "Cp",
    color: "#e4312d",
    countries: ["KR"],
    region: "Korea",
    searchUrl: (q) => `https://www.coupang.com/np/search?q=${encodeURIComponent(q)}`,
  },
  {
    id: "amazon",
    label: "Amazon",
    mark: "Am",
    color: "#ff9900",
    textColor: "#111",
    countries: ["WW", "US"],
    region: "Worldwide",
    searchUrl: (q) => `https://www.amazon.com/s?k=${encodeURIComponent(q)}`,
    defaultConnected: true,
  },
  {
    id: "ebay",
    label: "eBay",
    mark: "eB",
    color: "#e53238",
    countries: ["WW"],
    region: "Worldwide",
    searchUrl: (q) => `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(q)}`,
  },
  {
    id: "aliexpress",
    label: "AliExpress",
    mark: "Ali",
    color: "#ff4747",
    countries: ["WW"],
    region: "Worldwide",
    searchUrl: (q) => `https://www.aliexpress.com/wholesale?SearchText=${encodeURIComponent(q)}`,
  },
  {
    id: "demo-mart",
    label: "Demo Mart",
    mark: "Dm",
    color: "#111111",
    countries: ["WW"],
    region: "Demo",
    searchUrl: (q) => `https://example.com/search?q=${encodeURIComponent(q)}`,
  },
];

export const COUNTRY_GROUPS: { code: string; label: string; flag: string }[] = [
  { code: "ID", label: "Indonesia", flag: "🇮🇩" },
  { code: "SG", label: "Singapore", flag: "🇸🇬" },
  { code: "MY", label: "Malaysia", flag: "🇲🇾" },
  { code: "TH", label: "Thailand", flag: "🇹🇭" },
  { code: "JP", label: "Japan", flag: "🇯🇵" },
  { code: "KR", label: "Korea", flag: "🇰🇷" },
  { code: "WW", label: "Worldwide", flag: "🌍" },
];

export function metaFor(id: string): MarketplaceMeta | undefined {
  return MARKETPLACE_CATALOG.find((m) => m.id === id);
}

export function defaultConnectedIds(): MarketplaceId[] {
  return MARKETPLACE_CATALOG.filter((m) => m.defaultConnected).map((m) => m.id);
}
