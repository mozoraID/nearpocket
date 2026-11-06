import { NextRequest, NextResponse } from "next/server";
import { quoteLocalToUsdc, quoteUsdcTable } from "@/lib/fx/quote";
import { DISPLAY_CURRENCY_CODES } from "@/lib/region/display-currency";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  if (sp.get("table") === "1" || sp.get("all") === "1") {
    const rows = await quoteUsdcTable(DISPLAY_CURRENCY_CODES);
    return NextResponse.json({ base: "USDC", rows, asOf: new Date().toISOString() });
  }
  const currency = (sp.get("currency") || "USD").toUpperCase();
  const amountRaw = sp.get("amount");
  const amount = amountRaw == null || amountRaw === "" ? 1 : parseFloat(amountRaw);
  if (!amount || amount <= 0) {
    return NextResponse.json({ error: "amount must be > 0" }, { status: 400 });
  }
  const quote = await quoteLocalToUsdc(currency, amount);
  return NextResponse.json(quote);
}
