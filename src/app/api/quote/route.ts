import { NextRequest, NextResponse } from "next/server";
import { dryQuoteAnyToUsdc } from "@/lib/near/intents";

export async function GET(req: NextRequest) {
  const fromToken = req.nextUrl.searchParams.get("from") || "NEAR";
  const amount = req.nextUrl.searchParams.get("amount") || "1";
  const quote = await dryQuoteAnyToUsdc(fromToken, amount);
  return NextResponse.json(quote);
}
