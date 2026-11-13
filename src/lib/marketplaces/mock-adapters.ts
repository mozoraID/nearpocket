import type {
  MarketplaceAdapter,
  MarketplaceOffer,
  MarketplaceSearchQuery,
  MarketplaceId,
} from "./types";
import { MARKETPLACE_CATALOG, metaFor } from "./catalog";

const CATALOG: Record<
  string,
  { title: string; base: number; category: string; merchants: string[] }
> = {
  earbuds: {
    title: "Wireless ANC Earbuds",
    base: 22,
    category: "electronics",
    merchants: ["AudioHub", "GadgetPro", "SoundNest"],
  },
  coffee: {
    title: "Arabica Cold Brew Pack",
    base: 8,
    category: "groceries",
    merchants: ["Kopi Lokal", "Bean Bros", "Warung Roast"],
  },
  hoodie: {
    title: "Oversized Hoodie",
    base: 18,
    category: "fashion",
    merchants: ["StreetWear ID", "UrbanFit", "ClothLab"],
  },
  keyboard: {
    title: "Mechanical Keyboard 75%",
    base: 45,
    category: "electronics",
    merchants: ["KeyLab", "TypeFast", "DeskGear"],
  },
  default: {
    title: "Requested item",
    base: 20,
    category: "digital",
    merchants: ["Open Shop", "Best Deal Co", "MegaMart"],
  },
};

function pickTemplate(query: string) {
  const q = query.toLowerCase();
  if (/earbud|headphone|sony|airpod/.test(q))
    return { ...CATALOG.earbuds, title: query.slice(0, 60) || CATALOG.earbuds.title };
  if (/coffee|kopi|brew/.test(q))
    return { ...CATALOG.coffee, title: query.slice(0, 60) || CATALOG.coffee.title };
  if (/hoodie|baju|shirt/.test(q))
    return { ...CATALOG.hoodie, title: query.slice(0, 60) || CATALOG.hoodie.title };
  if (/keyboard|keychron/.test(q))
    return { ...CATALOG.keyboard, title: query.slice(0, 60) || CATALOG.keyboard.title };
  return { ...CATALOG.default, title: query.slice(0, 60) || CATALOG.default.title };
}

function makeAdapter(
  id: MarketplaceId,
  label: string,
  region: string,
  priceMul: number,
  mocked: boolean,
): MarketplaceAdapter {
  const meta = metaFor(id);
  return {
    id,
    label,
    region,
    mocked,
    async search(q: MarketplaceSearchQuery): Promise<MarketplaceOffer[]> {
      const t = pickTemplate(q.query);
      const now = new Date().toISOString();
      const searchUrl = meta?.searchUrl(q.query) || `https://example.com/${id}?q=${encodeURIComponent(q.query)}`;
      const slug = btoa(unescape(encodeURIComponent(q.query))).replace(/[^a-zA-Z0-9]/g, "").slice(0, 8);
      const listed = t.merchants.slice(0, 2).map((merchant, i) => {
        const jitter = 0.92 + ((i + id.length) % 5) * 0.04 + Math.random() * 0.03;
        const priceUsdc = Math.round(t.base * priceMul * jitter * 100) / 100;
        return {
          id: `${id}-${slug}-${i}`,
          marketplace: id,
          title: `${t.title} · ${merchant}`,
          merchant,
          priceUsdc,
          url: searchUrl,
          productUrl: searchUrl,
          description: `Demo listing for “${q.query}” on ${label}. Open the marketplace to see live stock.`,
          inStock: i !== 2,
          rating: 3.8 + (i % 3) * 0.4,
          shippingDays: 1 + i,
          mocked,
          scrapedAt: now,
        };
      });
      // A 1–2 USDC demo deal so a small testnet balance can request approval.
      listed.push({
        id: `${id}-${slug}-deal`,
        marketplace: id,
        title: `${t.title} · Demo deal`,
        merchant: "Demo deal",
        priceUsdc: 1.49,
        url: searchUrl,
        productUrl: searchUrl,
        description: `Demo listing for “${q.query}” on ${label}. Priced so a small USDC balance can try approval.`,
        inStock: true,
        rating: 4.2,
        shippingDays: 2,
        mocked,
        scrapedAt: now,
      });
      return listed;
    },
  };
}

export const dummyJsonAmazonish: MarketplaceAdapter = {
  id: "amazon",
  label: "Amazon (DummyJSON)",
  region: "Worldwide",
  mocked: false,
  async search(q) {
    const meta = metaFor("amazon");
    try {
      const res = await fetch(
        `https://dummyjson.com/products/search?q=${encodeURIComponent(q.query)}&limit=5`,
        { next: { revalidate: 120 } },
      );
      if (!res.ok) throw new Error("dummyjson fail");
      const data = (await res.json()) as {
        products: {
          id: number;
          title: string;
          price: number;
          brand?: string;
          rating?: number;
          stock?: number;
          thumbnail?: string;
          description?: string;
        }[];
      };
      const now = new Date().toISOString();
      return (data.products || []).map((p) => ({
        id: `amazon-${p.id}`,
        marketplace: "amazon" as const,
        title: p.title,
        merchant: p.brand || "Amazon seller",
        priceUsdc: p.price,
        url: `https://dummyjson.com/products/${p.id}`,
        productUrl: meta?.searchUrl(p.title) || `https://www.amazon.com/s?k=${encodeURIComponent(p.title)}`,
        imageUrl: p.thumbnail,
        description: p.description,
        inStock: (p.stock ?? 1) > 0,
        rating: p.rating,
        shippingDays: 3,
        mocked: false,
        scrapedAt: now,
      }));
    } catch {
      return makeAdapter("amazon", "Amazon (fallback mock)", "Worldwide", 1.1, true).search(q);
    }
  },
};

const MOCK_SPECS: { id: MarketplaceId; mul: number }[] = [
  { id: "tokopedia", mul: 0.95 },
  { id: "shopee", mul: 0.92 },
  { id: "lazada", mul: 1.0 },
  { id: "blibli", mul: 0.97 },
  { id: "rakuten", mul: 1.12 },
  { id: "amazon-jp", mul: 1.08 },
  { id: "coupang", mul: 1.05 },
  { id: "ebay", mul: 1.05 },
  { id: "aliexpress", mul: 0.85 },
  { id: "demo-mart", mul: 0.88 },
];

export const MARKETPLACE_ADAPTERS: MarketplaceAdapter[] = [
  ...MOCK_SPECS.map(({ id, mul }) => {
    const m = MARKETPLACE_CATALOG.find((c) => c.id === id)!;
    return makeAdapter(id, m.label, m.region, mul, true);
  }),
  dummyJsonAmazonish,
];

export async function searchAllMarketplaces(
  q: MarketplaceSearchQuery,
): Promise<MarketplaceOffer[]> {
  const adapters = q.only?.length
    ? MARKETPLACE_ADAPTERS.filter((a) => q.only!.includes(a.id))
    : MARKETPLACE_ADAPTERS;
  const results = await Promise.all(
    adapters.map(async (a) => {
      try {
        return await a.search(q);
      } catch {
        return [] as MarketplaceOffer[];
      }
    }),
  );
  const flat = results.flat();
  flat.sort((a, b) => a.priceUsdc - b.priceUsdc);
  if (q.maxPriceUsdc) {
    return flat.filter((o) => o.priceUsdc <= q.maxPriceUsdc! * 1.25);
  }
  return flat;
}
