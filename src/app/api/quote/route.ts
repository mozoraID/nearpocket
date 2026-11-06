import { NextRequest, NextResponse } from "next/server";
import { quoteAnyToUsdc } from "@/lib/near/intents";

export async function GET(req: NextRequest) {
  const fromToken = req.nextUrl.searchParams.get("from") || "NEAR";
  const amount = req.nextUrl.searchParams.get("amount") || "1";
  const accountId = req.nextUrl.searchParams.get("account") || undefined;
  const quote = await quoteAnyToUsdc(fromToken, amount, { accountId });
  return NextResponse.json(quote);
}
