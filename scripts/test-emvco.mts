/**
 * EMVCo parser checks against the real parser in src/lib/qris/parser.ts.
 * Run via `npm run test:qris` (Node type stripping, no env vars).
 */
import assert from "node:assert/strict";
import { buildEmvQr, emvCrc16, parseEmvQr } from "../src/lib/qris/parser.ts";

function tlv(id: string, value: string) {
  return `${id}${String(value.length).padStart(2, "0")}${value}`;
}

function withCrc(bodyWithoutCrcTag: string) {
  const head = bodyWithoutCrcTag + "6304";
  return head + emvCrc16(head);
}

const qris = buildEmvQr({
  merchantName: "Warung Bu Siti",
  merchantCity: "Jakarta",
  countryCode: "ID",
  currencyNumeric: "360",
  amount: "25000",
  guid: "ID.CO.QRIS.WWW",
  merchantAccount: "9360091530000000001",
  mcc: "5812",
});

const promptpay = buildEmvQr({
  merchantName: "Somtum House",
  merchantCity: "Bangkok",
  countryCode: "TH",
  currencyNumeric: "764",
  amount: "180.00",
  guid: "A000000677010111",
  merchantAccount: "0105560000001",
  mcc: "5812",
});

const duitnow = buildEmvQr({
  merchantName: "Kedai Runcit",
  merchantCity: "KL",
  countryCode: "MY",
  currencyNumeric: "458",
  amount: "12.50",
  guid: "MY.QR.DUITNOW",
  merchantAccount: "123456789",
  mcc: "5411",
});

for (const sample of [qris, promptpay, duitnow]) {
  const parsed = parseEmvQr(sample);
  assert.equal(parsed.crcValid, true, parsed.summary);
  assert.ok(parsed.merchantName);
}

assert.equal(parseEmvQr(qris).rail.id, "qris-id");
assert.equal(parseEmvQr(promptpay).rail.id, "promptpay-th");
assert.equal(parseEmvQr(duitnow).rail.id, "duitnow-my");
assert.equal(parseEmvQr(qris).transactionAmount, "25000");

// Bad CRC: flip the last hex digit. Parser still returns the merchant.
const badCrc = qris.slice(0, -1) + (qris.endsWith("0") ? "1" : "0");
const bad = parseEmvQr(badCrc);
assert.equal(bad.crcValid, false);
assert.equal(bad.merchantName, "Warung Bu Siti");
assert.equal(bad.countryCode, "ID");

// Missing CRC entirely.
const noCrc = qris.slice(0, qris.lastIndexOf("6304"));
const missing = parseEmvQr(noCrc);
assert.equal(missing.crcValid, false);
assert.equal(missing.merchantName, "Warung Bu Siti");

// Optional and less common EMVCo fields: postal (61), additional data (62)
// with bill number, tip indicator (55), fixed convenience fee (56),
// and the language template (64).
const mai = tlv("00", "ID.CO.QRIS.WWW") + tlv("01", "9360091530000000001");
const additional = tlv("01", "INV-99") + tlv("05", "REF1") + tlv("07", "T-01");
const language = tlv("00", "ID") + tlv("01", "Warung Alternatif");
const rich = withCrc(
  tlv("00", "01") +
    tlv("01", "12") +
    tlv("26", mai) +
    tlv("52", "5812") +
    tlv("53", "360") +
    tlv("54", "15000") +
    tlv("55", "02") +
    tlv("56", "500") +
    tlv("58", "ID") +
    tlv("59", "Warung Bu Siti") +
    tlv("60", "Jakarta") +
    tlv("61", "10110") +
    tlv("62", additional) +
    tlv("64", language),
);
const richParsed = parseEmvQr(rich);
assert.equal(richParsed.crcValid, true);
assert.equal(richParsed.postalCode, "10110");
assert.equal(richParsed.tipOrConvenienceIndicator, "02");
assert.equal(richParsed.convenienceFeeFixed, "500");
assert.equal(richParsed.additionalData?.find((t) => t.id === "01")?.value, "INV-99");
assert.equal(richParsed.additionalData?.find((t) => t.id === "05")?.value, "REF1");
assert.equal(richParsed.additionalData?.find((t) => t.id === "07")?.value, "T-01");
assert.equal(richParsed.languagePreference, "ID");
assert.equal(richParsed.merchantNameAlt, "Warung Alternatif");
assert.equal(richParsed.pointOfInitiation, "12");

// Percentage convenience fee (tag 55 = 03, tag 57).
const percent = withCrc(
  tlv("00", "01") +
    tlv("01", "11") +
    tlv("26", mai) +
    tlv("52", "5411") +
    tlv("53", "360") +
    tlv("55", "03") +
    tlv("57", "2.50") +
    tlv("58", "ID") +
    tlv("59", "Open Amount") +
    tlv("60", "Bandung"),
);
const percentParsed = parseEmvQr(percent);
assert.equal(percentParsed.crcValid, true);
assert.equal(percentParsed.transactionAmount, undefined);
assert.equal(percentParsed.tipOrConvenienceIndicator, "03");
assert.equal(percentParsed.convenienceFeePercentage, "2.50");
assert.equal(percentParsed.pointOfInitiation, "11");

// Malformed TLV: non-numeric length, length past the buffer, truncated header.
for (const junk of ["", "   ", "ABCD", "6304", "59XXJakarta", "540499", "26"]) {
  const parsed = parseEmvQr(junk);
  assert.equal(parsed.crcValid, false, JSON.stringify(junk));
  assert.equal(typeof parsed.summary, "string");
}

// A valid prefix followed by a tag whose length overruns the remaining bytes.
const overrun = qris.slice(0, 20) + "59100NOTENOUGH";
const overrunParsed = parseEmvQr(overrun);
assert.equal(overrunParsed.crcValid, false);

// Nested merchant-account template that is not itself TLV stops cleanly.
const brokenNest = withCrc(
  tlv("00", "01") +
    tlv("26", "NOT-TLV") +
    tlv("53", "764") +
    tlv("58", "TH") +
    tlv("59", "Partial") +
    tlv("60", "Bangkok"),
);
const nest = parseEmvQr(brokenNest);
assert.equal(nest.crcValid, true);
assert.equal(nest.merchantName, "Partial");
assert.ok(nest.merchantAccountInformation.length >= 1);

console.log("ok: EMVCo parser (CRC, rails, optional fields, bad CRC, malformed TLV)");
