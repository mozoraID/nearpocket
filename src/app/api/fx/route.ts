import { NextRequest, NextResponse } from "next/server";
import { quoteLocalToUsdc } from "@/lib/fx/quote";

export async function GET(req: NextRequest) {
  const currency = req.nextUrl.searchParams.get("currency") || "IDR";
  const amount = parseFloat(req.nextUrl.searchParams.get("amount") || "0");
  if (!amount || amount <= 0) {
    return NextResponse.json({ error: "amount must be > 0" }, { status: 400 });
  }
  const quote = await quoteLocalToUsdc(currency, amount);
  return NextResponse.json(quote);
}
