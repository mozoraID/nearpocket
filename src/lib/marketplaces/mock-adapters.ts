import type {
  MarketplaceAdapter,
  MarketplaceOffer,
  MarketplaceSearchQuery,
  MarketplaceId,
} from "./types";

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
  if (/earbud|headphone|sony|airpod/.test(q)) return { ...CATALOG.earbuds, title: query.slice(0, 60) || CATALOG.earbuds.title };
  if (/coffee|kopi|brew/.test(q)) return { ...CATALOG.coffee, title: query.slice(0, 60) || CATALOG.coffee.title };
  if (/hoodie|baju|shirt/.test(q)) return { ...CATALOG.hoodie, title: query.slice(0, 60) || CATALOG.hoodie.title };
  if (/keyboard|keychron/.test(q)) return { ...CATALOG.keyboard, title: query.slice(0, 60) || CATALOG.keyboard.title };
  return { ...CATALOG.default, title: query.slice(0, 60) || CATALOG.default.title };
}

function makeAdapter(
  id: MarketplaceId,
  label: string,
  region: string,
  priceMul: number,
  mocked: boolean,
): MarketplaceAdapter {
  return {
    id,
    label,
    region,
    mocked,
    async search(q: MarketplaceSearchQuery): Promise<MarketplaceOffer[]> {
      const t = pickTemplate(q.query);
      const now = new Date().toISOString();
      return t.merchants.map((merchant, i) => {
        const jitter = 0.92 + ((i + id.length) % 5) * 0.04 + Math.random() * 0.03;
        const priceUsdc =
          Math.round(t.base * priceMul * jitter * 100) / 100;
        return {
          id: `${id}-${btoa(unescape(encodeURIComponent(q.query))).replace(/[^a-zA-Z0-9]/g, "").slice(0, 8)}-${i}`,
          marketplace: id,
          title: `${t.title} · ${merchant}`,
          merchant,
          priceUsdc,
          url: `https://example.com/${id}/item/${encodeURIComponent(q.query)}-${i}`,
          inStock: i !== 2,
          rating: 3.8 + (i % 3) * 0.4,
          shippingDays: 1 + i,
          mocked,
          scrapedAt: now,
        };
      });
    },
  };
}

/**
 * Public/no-key sources: we use a free DummyJSON products search as a
 * "real" cross-check for Amazon-like results when reachable; others are
 * clearly labeled marketplace mocks (Tokopedia/Shopee/etc. need partner APIs).
 */
export const dummyJsonAmazonish: MarketplaceAdapter = {
  id: "amazon",
  label: "Amazon-like (DummyJSON)",
  region: "US/Global",
  mocked: false,
  async search(q) {
    try {
      const res = await fetch(
        `https://dummyjson.com/products/search?q=${encodeURIComponent(q.query)}&limit=5`,
        { next: { revalidate: 120 } },
      );
      if (!res.ok) throw new Error("dummyjson fail");
      const data = (await res.json()) as {
        products: { id: number; title: string; price: number; brand?: string; rating?: number; stock?: number; thumbnail?: string }[];
      };
      const now = new Date().toISOString();
      return (data.products || []).map((p) => ({
        id: `amazon-${p.id}`,
        marketplace: "amazon" as const,
        title: p.title,
        merchant: p.brand || "Amazon seller",
        priceUsdc: p.price,
        url: `https://dummyjson.com/products/${p.id}`,
        inStock: (p.stock ?? 1) > 0,
        rating: p.rating,
        shippingDays: 3,
        mocked: false,
        scrapedAt: now,
      }));
    } catch {
      return makeAdapter("amazon", "Amazon (fallback mock)", "US/Global", 1.1, true).search(q);
    }
  },
};

export const MARKETPLACE_ADAPTERS: MarketplaceAdapter[] = [
  makeAdapter("tokopedia", "Tokopedia", "Indonesia", 0.95, true),
  makeAdapter("shopee", "Shopee", "SEA", 0.92, true),
  makeAdapter("lazada", "Lazada", "SEA", 1.0, true),
  dummyJsonAmazonish,
  makeAdapter("ebay", "eBay", "Global", 1.05, true),
  makeAdapter("demo-mart", "Demo Mart", "Demo", 0.88, true),
];

export async function searchAllMarketplaces(
  q: MarketplaceSearchQuery,
): Promise<MarketplaceOffer[]> {
  const results = await Promise.all(
    MARKETPLACE_ADAPTERS.map(async (a) => {
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
