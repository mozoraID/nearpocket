import { NextRequest, NextResponse } from "next/server";
import {
  searchAllMarketplaces,
  MARKETPLACE_ADAPTERS,
  MARKETPLACE_CATALOG,
  type MarketplaceId,
} from "@/lib/marketplaces";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q") || "";
  const max = parseFloat(req.nextUrl.searchParams.get("max") || "");
  const onlyRaw = req.nextUrl.searchParams.get("only") || "";
  const only = onlyRaw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean) as MarketplaceId[];

  if (!q.trim()) {
    return NextResponse.json({
      adapters: MARKETPLACE_ADAPTERS.map((a) => ({
        id: a.id,
        label: a.label,
        region: a.region,
        mocked: a.mocked,
      })),
      catalog: MARKETPLACE_CATALOG,
    });
  }
  const offers = await searchAllMarketplaces({
    query: q,
    maxPriceUsdc: Number.isFinite(max) ? max : undefined,
    only: only.length ? only : undefined,
  });
  return NextResponse.json({ offers, query: q, only });
}
