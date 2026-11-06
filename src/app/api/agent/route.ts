import { NextRequest, NextResponse } from "next/server";
import { parseUserIntent, evaluateWaitlistItem, simulatePriceTick } from "@/lib/agent/rules";
import type { WaitlistItem } from "@/lib/agent/policy";

/**
 * POST { action: "parse", text }
 * POST { action: "tick", item }
 * Optional LLM enrichment when OPENAI_API_KEY or NEAR_AI_API_KEY is set.
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const action = body.action as string;

  if (action === "parse") {
    const parsed = parseUserIntent(String(body.text || ""));
    let agentReason = `Queued from your request. Category ${parsed.category}.`;

    const key = process.env.NEAR_AI_API_KEY || process.env.OPENAI_API_KEY;
    if (key) {
      try {
        agentReason = await maybeLlmReason(key, String(body.text || ""), parsed);
      } catch {
        /* keep rule-based */
      }
    }

    const item: WaitlistItem = {
      id: `wl_${Date.now().toString(36)}`,
      title: parsed.title,
      merchant: parsed.merchant,
      category: parsed.category,
      targetPriceUsdc: parsed.targetPriceUsdc,
      currentPriceUsdc: parsed.currentPriceUsdc,
      status: "queued",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      agentReason,
      notes: String(body.text || ""),
    };
    return NextResponse.json(item);
  }

  if (action === "tick") {
    const item = body.item as WaitlistItem;
    const currentPriceUsdc = simulatePriceTick(item);
    const next = { ...item, currentPriceUsdc };
    const ev = evaluateWaitlistItem(next);
    return NextResponse.json({
      ...next,
      status: ev.status,
      agentReason: ev.reason,
      updatedAt: new Date().toISOString(),
    });
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}

async function maybeLlmReason(
  key: string,
  text: string,
  parsed: ReturnType<typeof parseUserIntent>,
): Promise<string> {
  const base =
    process.env.NEAR_AI_BASE_URL ||
    process.env.OPENAI_BASE_URL ||
    "https://api.openai.com/v1";
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.NEAR_AI_MODEL || "gpt-4o-mini",
      temperature: 0.4,
      messages: [
        {
          role: "system",
          content:
            "You are Nearly's shopping agent. One short sentence on why you queued this item. User stays in control — never claim you already bought.",
        },
        {
          role: "user",
          content: `Request: ${text}\nParsed: ${JSON.stringify(parsed)}`,
        },
      ],
    }),
  });
  if (!res.ok) throw new Error("llm failed");
  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() || "Queued.";
}
