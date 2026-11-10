/**
 * Prototype abuse limits for the relayer.
 *
 * Stored in process memory. On Vercel a warm instance keeps the counters,
 * a cold start clears them, and two instances do not share them. That is
 * enough to slow a single client during a demo. It is not a global quota.
 */
import { IP_WINDOW_LIMIT, IP_WINDOW_MS, SENDER_DAILY_LIMIT } from "./relay-allowlist";

export interface LimitRejection {
  ok: false;
  retryAfterSec: number;
  reason: string;
}

export type LimitDecision = { ok: true } | LimitRejection;

interface IpBucket {
  windowStart: number;
  count: number;
}

interface SenderBucket {
  day: string;
  count: number;
}

const ipBuckets = new Map<string, IpBucket>();
const senderBuckets = new Map<string, SenderBucket>();

export function resetRelayLimits(): void {
  ipBuckets.clear();
  senderBuckets.clear();
}

function utcDay(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

export function checkIpLimit(ip: string, now = Date.now()): LimitDecision {
  const key = ip || "unknown";
  const bucket = ipBuckets.get(key);
  if (!bucket || now - bucket.windowStart >= IP_WINDOW_MS) {
    ipBuckets.set(key, { windowStart: now, count: 1 });
    return { ok: true };
  }
  if (bucket.count >= IP_WINDOW_LIMIT) {
    const retryAfterSec = Math.max(1, Math.ceil((bucket.windowStart + IP_WINDOW_MS - now) / 1000));
    return {
      ok: false,
      retryAfterSec,
      reason: "too many relay requests from this network",
    };
  }
  bucket.count += 1;
  return { ok: true };
}

export function checkAndRecordSender(accountId: string, now = Date.now()): LimitDecision {
  const day = utcDay(now);
  const bucket = senderBuckets.get(accountId);
  if (!bucket || bucket.day !== day) {
    senderBuckets.set(accountId, { day, count: 1 });
    return { ok: true };
  }
  if (bucket.count >= SENDER_DAILY_LIMIT) {
    return {
      ok: false,
      retryAfterSec: 3600,
      reason: "daily relay limit reached for this account",
    };
  }
  bucket.count += 1;
  return { ok: true };
}
