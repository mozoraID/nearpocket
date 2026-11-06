export type MarketplaceId =
  | "tokopedia"
  | "shopee"
  | "lazada"
  | "amazon"
  | "ebay"
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
}

export interface MarketplaceAdapter {
  id: MarketplaceId;
  label: string;
  region: string;
  /** When true, results are synthetic / demo-shaped */
  mocked: boolean;
  search(q: MarketplaceSearchQuery): Promise<MarketplaceOffer[]>;
}
