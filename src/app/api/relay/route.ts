import { NextRequest, NextResponse } from "next/server";
import { checkIpLimit } from "@/lib/near/relay-limits";
import { RelayValidationError, signedDelegateFromBase64 } from "@/lib/near/relay-policy";
import {
  RelayHttpError,
  configuredNetworkId,
  relaySignedDelegate,
  relayerIsConfigured,
} from "@/lib/near/relay-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first.slice(0, 80);
  }
  const real = req.headers.get("x-real-ip")?.trim();
  return real ? real.slice(0, 80) : "unknown";
}

/** Whether a relayer key is configured. Does not reveal the key or the account. */
export async function GET() {
  if (configuredNetworkId() !== "testnet") {
    return NextResponse.json(
      { error: "relayer refuses to run unless networkId is testnet", configured: false },
      { status: 403 },
    );
  }
  return NextResponse.json({ configured: relayerIsConfigured(), network: "testnet" });
}

export async function POST(req: NextRequest) {
  try {
    if (configuredNetworkId() !== "testnet") {
      return NextResponse.json(
        { error: "relayer refuses to run unless networkId is testnet" },
        { status: 403 },
      );
    }
    if (!relayerIsConfigured()) {
      return NextResponse.json({ error: "relayer not configured" }, { status: 503 });
    }
    const limit = checkIpLimit(clientIp(req));
    if (!limit.ok) {
      return NextResponse.json(
        { error: limit.reason },
        { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } },
      );
    }
    const body = (await req.json().catch(() => null)) as { signedDelegate?: unknown } | null;
    const bytes = signedDelegateFromBase64(
      typeof body?.signedDelegate === "string" ? body.signedDelegate : "",
    );
    const result = await relaySignedDelegate(bytes);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof RelayHttpError) {
      const headers = error.status === 429 ? { "Retry-After": "60" } : undefined;
      return NextResponse.json({ error: error.message }, { status: error.status, headers });
    }
    if (error instanceof RelayValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : "relay failed";
    const safe = /ed25519:|private key|secret key/i.test(message) ? "relay failed" : message.slice(0, 300);
    return NextResponse.json({ error: safe }, { status: 502 });
  }
}
