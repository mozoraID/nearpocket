import { NextRequest, NextResponse } from "next/server";
import { searchAllMarketplaces, MARKETPLACE_ADAPTERS } from "@/lib/marketplaces";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q") || "";
  const max = parseFloat(req.nextUrl.searchParams.get("max") || "");
  if (!q.trim()) {
    return NextResponse.json({
      adapters: MARKETPLACE_ADAPTERS.map((a) => ({
        id: a.id,
        label: a.label,
        region: a.region,
        mocked: a.mocked,
      })),
    });
  }
  const offers = await searchAllMarketplaces({
    query: q,
    maxPriceUsdc: Number.isFinite(max) ? max : undefined,
  });
  return NextResponse.json({ offers, query: q });
}
