import { NextRequest, NextResponse } from "next/server";
import {
  IntentExecutionDisabled,
  prepareIntentExecution,
  quoteAnyToUsdc,
} from "@/lib/near/intents";

export async function GET(req: NextRequest) {
  const fromToken = req.nextUrl.searchParams.get("from") || "NEAR";
  const amount = req.nextUrl.searchParams.get("amount") || "1";
  const accountId = req.nextUrl.searchParams.get("account") || undefined;
  const quote = await quoteAnyToUsdc(fromToken, amount, { accountId });
  return NextResponse.json(quote);
}

/**
 * POST { from, amount, accountId, execute? }
 * execute=false (default) is the same dry quote as GET.
 * execute=true follows the live path only when NEAR_INTENTS_EXECUTE=1,
 * and still does not broadcast the deposit.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const from = String(body.from || "NEAR");
  const amount = String(body.amount || "1");
  const accountId = body.accountId ? String(body.accountId) : undefined;
  if (!body.execute) {
    const quote = await quoteAnyToUsdc(from, amount, { accountId });
    return NextResponse.json(quote);
  }
  try {
    const prepared = await prepareIntentExecution({
      fromToken: from,
      fromAmount: amount,
      accountId: accountId || "",
    });
    return NextResponse.json(prepared);
  } catch (e) {
    const message = e instanceof Error ? e.message : "intent execution unavailable";
    const status = e instanceof IntentExecutionDisabled ? 403 : 400;
    return NextResponse.json({ error: message, executed: false, broadcast: false }, { status });
  }
}
