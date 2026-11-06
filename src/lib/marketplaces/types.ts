export type MarketplaceId =
  | "tokopedia"
  | "shopee"
  | "lazada"
  | "blibli"
  | "rakuten"
  | "amazon-jp"
  | "coupang"
  | "amazon"
  | "ebay"
  | "aliexpress"
  | "demo-mart";

export interface MarketplaceOffer {
  id: string;
  marketplace: MarketplaceId;
  title: string;
  merchant: string;
  priceUsdc: number;
  currencyLocal?: string;
  priceLocal?: number;
  url: string;
  /** Real product page or marketplace search URL */
  productUrl?: string;
  imageUrl?: string;
  description?: string;
  inStock: boolean;
  rating?: number;
  shippingDays?: number;
  mocked: boolean;
  scrapedAt: string;
}

export interface MarketplaceSearchQuery {
  query: string;
  maxPriceUsdc?: number;
  category?: string;
  /** Only search these marketplace ids (connected) */
  only?: MarketplaceId[];
}

export interface MarketplaceAdapter {
  id: MarketplaceId;
  label: string;
  region: string;
  /** When true, results are synthetic / demo-shaped */
  mocked: boolean;
  search(q: MarketplaceSearchQuery): Promise<MarketplaceOffer[]>;
}
