import { NextRequest, NextResponse } from "next/server";
import { settle, activeSettlementBackend, type SettlementRequest } from "@/lib/settlement";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const settlement = body as SettlementRequest;
    const preferred = body.adapter as string | undefined;
    if (!settlement?.id || !settlement?.quote || !settlement?.rail) {
      return NextResponse.json({ error: "invalid settlement request" }, { status: 400 });
    }
    const receipt = await settle(settlement, preferred);
    return NextResponse.json({
      ...receipt,
      backend: activeSettlementBackend(),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "settle failed" },
      { status: 500 },
    );
  }
}

export async function GET() {
  return NextResponse.json({ backend: activeSettlementBackend() });
}
