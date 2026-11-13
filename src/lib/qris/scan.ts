export type QrIssue = "ok" | "bad-crc" | "invalid";
export type CameraIssue = "permission" | "missing" | "other";

export function classifyQr(input: {
  crcValid: boolean;
  merchantName?: string;
  merchantAccountCount: number;
}): QrIssue {
  if (!input.crcValid) return "bad-crc";
  if (!input.merchantName && input.merchantAccountCount === 0) return "invalid";
  return "ok";
}

export function classifyCameraError(message: string): CameraIssue {
  if (/denied|NotAllowed|Permission/i.test(message)) return "permission";
  if (/NotFound|Requested device|no camera|Overconstrained/i.test(message)) return "missing";
  return "other";
}

/** A reload can finish a signature that left the page before the receipt check. */
export function recoverableTxHash(opts: {
  urlHash?: string | null;
  storedHash?: string | null;
  seenHash?: string | null;
}): string | null {
  const hash = opts.urlHash || opts.storedHash || "";
  if (!hash || hash === opts.seenHash) return null;
  return hash;
}
