/**
 * Minimal EMVCo Merchant-Presented Mode QR parser (TLV).
 * Spec: EMV® QR Code Specification for Payment Systems (Merchant-Presented Mode).
 * Used for QRIS (ID), PromptPay (TH), DuitNow (MY), NETS (SG), JPQR (JP), Korea QR.
 */

import { PaymentRail, railFromCurrency, RAILS } from "./countries";

export interface EmvTag {
  id: string;
  length: number;
  value: string;
  children?: EmvTag[];
}

export interface ParsedQrPayment {
  raw: string;
  payloadFormat?: string;
  pointOfInitiation?: string; // 11 static, 12 dynamic
  merchantAccountInformation: EmvTag[];
  merchantCategoryCode?: string;
  transactionCurrency?: string;
  transactionAmount?: string;
  countryCode?: string;
  merchantName?: string;
  merchantCity?: string;
  postalCode?: string;
  additionalData?: EmvTag[];
  crc?: string;
  crcValid: boolean;
  rail: PaymentRail;
  /** Human summary */
  summary: string;
}

function parseTlv(payload: string): EmvTag[] {
  const tags: EmvTag[] = [];
  let i = 0;
  while (i + 4 <= payload.length) {
    const id = payload.slice(i, i + 2);
    const length = parseInt(payload.slice(i + 2, i + 4), 10);
    if (Number.isNaN(length) || i + 4 + length > payload.length) break;
    const value = payload.slice(i + 4, i + 4 + length);
    const tag: EmvTag = { id, length, value };
    // Nested TLV for merchant account info (26-51) and additional data (62)
    if ((id >= "26" && id <= "51") || id === "62" || id === "64") {
      tag.children = parseTlv(value);
    }
    tags.push(tag);
    i += 4 + length;
  }
  return tags;
}

/** CRC-16/CCITT-FALSE used by EMVCo (poly 0x1021, init 0xFFFF). */
export function emvCrc16(data: string): string {
  let crc = 0xffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b++) {
      if (crc & 0x8000) crc = ((crc << 1) ^ 0x1021) & 0xffff;
      else crc = (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

function findTag(tags: EmvTag[], id: string): EmvTag | undefined {
  return tags.find((t) => t.id === id);
}

function detectRail(tags: EmvTag[], currency?: string, country?: string): PaymentRail {
  // Indonesian QRIS GUID often under 26/51: "ID.CO.QRIS.WWW" or similar
  const mai = tags.filter((t) => t.id >= "26" && t.id <= "51");
  const blob = mai.map((t) => t.value).join("|").toUpperCase();
  if (blob.includes("QRIS") || blob.includes("ID.CO")) return RAILS["qris-id"];
  if (blob.includes("PROMPTPAY") || blob.includes("A000000677")) return RAILS["promptpay-th"];
  if (blob.includes("DUITNOW") || blob.includes("MY.QR")) return RAILS["duitnow-my"];
  if (blob.includes("NETS") || blob.includes("SG.")) return RAILS["nets-sg"];
  if (blob.includes("JPQR") || blob.includes("JP.")) return RAILS["jpqr-jp"];
  if (blob.includes("KAKAOPAY") || blob.includes("KR.")) return RAILS["kakaopay-kr"];
  return railFromCurrency(currency, country);
}

export function parseEmvQr(raw: string): ParsedQrPayment {
  // Only strip line breaks: merchant names legitimately contain spaces (tag lengths count them).
  const cleaned = raw.trim().replace(/[\r\n\t]+/g, "");
  const tags = parseTlv(cleaned);

  const currencyTag = findTag(tags, "53");
  const amountTag = findTag(tags, "54");
  const countryTag = findTag(tags, "58");
  const nameTag = findTag(tags, "59");
  const cityTag = findTag(tags, "60");
  const mccTag = findTag(tags, "52");
  const poiTag = findTag(tags, "01");
  const pfTag = findTag(tags, "00");
  const postalTag = findTag(tags, "61");
  const addTag = findTag(tags, "62");
  const crcTag = findTag(tags, "63");

  // CRC covers everything up to and including "6304"
  const crcValid = (() => {
    if (!crcTag) return false;
    const idx = cleaned.lastIndexOf("6304");
    if (idx < 0) return false;
    const computed = emvCrc16(cleaned.slice(0, idx + 4));
    return computed === crcTag.value.toUpperCase();
  })();

  const mai = tags.filter((t) => t.id >= "26" && t.id <= "51");
  const currency = currencyTag?.value;
  const country = countryTag?.value;
  const rail = detectRail(tags, currency, country);

  const amount = amountTag?.value;
  const merchantName = nameTag?.value?.trim();
  const merchantCity = cityTag?.value?.trim();

  const summary = [
    merchantName || "Merchant",
    amount ? `${rail.currencySymbol}${amount}` : "amount open",
    merchantCity,
    rail.name,
  ]
    .filter(Boolean)
    .join(" · ");

  return {
    raw: cleaned,
    payloadFormat: pfTag?.value,
    pointOfInitiation: poiTag?.value,
    merchantAccountInformation: mai,
    merchantCategoryCode: mccTag?.value,
    transactionCurrency: currency,
    transactionAmount: amount,
    countryCode: country,
    merchantName,
    merchantCity,
    postalCode: postalTag?.value,
    additionalData: addTag?.children,
    crc: crcTag?.value,
    crcValid,
    rail,
    summary,
  };
}

/** Build a valid EMVCo QR string with correct CRC (for samples / merchant QR). */
export function buildEmvQr(parts: {
  merchantName: string;
  merchantCity: string;
  countryCode: string;
  currencyNumeric: string;
  amount?: string;
  guid: string;
  merchantAccount: string;
  mcc?: string;
}): string {
  const tlv = (id: string, value: string) =>
    `${id}${value.length.toString().padStart(2, "0")}${value}`;

  const mai = tlv("00", parts.guid) + tlv("01", parts.merchantAccount);
  const body =
    tlv("00", "01") +
    tlv("01", parts.amount ? "12" : "11") +
    tlv("26", mai) +
    tlv("52", parts.mcc || "5411") +
    tlv("53", parts.currencyNumeric) +
    (parts.amount ? tlv("54", parts.amount) : "") +
    tlv("58", parts.countryCode) +
    tlv("59", parts.merchantName.slice(0, 25)) +
    tlv("60", parts.merchantCity.slice(0, 15)) +
    "6304";

  return body + emvCrc16(body);
}
