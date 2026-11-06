import { NextRequest, NextResponse } from "next/server";
import { settle, type SettlementRequest } from "@/lib/settlement";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as SettlementRequest;
    if (!body?.id || !body?.quote || !body?.rail) {
      return NextResponse.json({ error: "invalid settlement request" }, { status: 400 });
    }
    const receipt = await settle(body);
    return NextResponse.json(receipt);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "settle failed" },
      { status: 500 },
    );
  }
}
