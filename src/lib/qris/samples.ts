import { buildEmvQr } from "./parser";

/** Realistic-shaped sample EMVCo payloads (demo merchants). CRC is computed. */
export const SAMPLE_QRS = {
  indonesia: buildEmvQr({
    merchantName: "Warung Bu Siti",
    merchantCity: "Jakarta",
    countryCode: "ID",
    currencyNumeric: "360",
    amount: "25000",
    guid: "ID.CO.QRIS.WWW",
    merchantAccount: "9360091530000000001",
    mcc: "5812",
  }),
  thailand: buildEmvQr({
    merchantName: "Somtum House",
    merchantCity: "Bangkok",
    countryCode: "TH",
    currencyNumeric: "764",
    amount: "180.00",
    guid: "A000000677010111",
    merchantAccount: "0105560000001",
    mcc: "5812",
  }),
  malaysia: buildEmvQr({
    merchantName: "Nasi Lemak Corner",
    merchantCity: "KL",
    countryCode: "MY",
    currencyNumeric: "458",
    amount: "18.50",
    guid: "MY.QR.DUITNOW",
    merchantAccount: "1234567890",
    mcc: "5812",
  }),
  singapore: buildEmvQr({
    merchantName: "Hawker Channel",
    merchantCity: "Singapore",
    countryCode: "SG",
    currencyNumeric: "702",
    amount: "12.80",
    guid: "SG.COM.NETS",
    merchantAccount: "888812345678",
    mcc: "5814",
  }),
  japan: buildEmvQr({
    merchantName: "Tokyo Ramen",
    merchantCity: "Tokyo",
    countryCode: "JP",
    currencyNumeric: "392",
    amount: "1200",
    guid: "JP.QR.JPQR",
    merchantAccount: "jpqr00012345",
    mcc: "5812",
  }),
  korea: buildEmvQr({
    merchantName: "Seoul Kimbap",
    merchantCity: "Seoul",
    countryCode: "KR",
    currencyNumeric: "410",
    amount: "8500",
    guid: "KR.KAKAOPAY.QR",
    merchantAccount: "kakao000987",
    mcc: "5812",
  }),
} as const;

export type SampleKey = keyof typeof SAMPLE_QRS;
