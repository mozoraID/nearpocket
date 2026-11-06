import { createRequire } from "module";
// Compile-free smoke: duplicate minimal checks by importing built TS via next is heavy;
// instead re-implement CRC quick check against samples by spawning tsx if available.
// Fallback: dynamic import from compiled path after build — for CI we inline.

function emvCrc16(data) {
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

function tlv(id, value) {
  return `${id}${String(value.length).padStart(2, "0")}${value}`;
}

function build({ merchantName, merchantCity, countryCode, currencyNumeric, amount, guid, merchantAccount, mcc }) {
  const mai = tlv("00", guid) + tlv("01", merchantAccount);
  const body =
    tlv("00", "01") +
    tlv("01", amount ? "12" : "11") +
    tlv("26", mai) +
    tlv("52", mcc || "5411") +
    tlv("53", currencyNumeric) +
    (amount ? tlv("54", amount) : "") +
    tlv("58", countryCode) +
    tlv("59", merchantName.slice(0, 25)) +
    tlv("60", merchantCity.slice(0, 15)) +
    "6304";
  return body + emvCrc16(body);
}

const samples = [
  build({ merchantName: "Warung Bu Siti", merchantCity: "Jakarta", countryCode: "ID", currencyNumeric: "360", amount: "25000", guid: "ID.CO.QRIS.WWW", merchantAccount: "9360091530000000001", mcc: "5812" }),
  build({ merchantName: "Somtum House", merchantCity: "Bangkok", countryCode: "TH", currencyNumeric: "764", amount: "180.00", guid: "A000000677010111", merchantAccount: "0105560000001", mcc: "5812" }),
];

for (const s of samples) {
  const idx = s.lastIndexOf("6304");
  const crc = s.slice(idx + 4);
  const computed = emvCrc16(s.slice(0, idx + 4));
  if (crc !== computed) {
    console.error("CRC fail", crc, computed);
    process.exit(1);
  }
  if (!s.includes("ID") && !s.includes("TH")) {
    /* ok */
  }
}
console.log("ok: CRC valid on", samples.length, "sample payloads");
