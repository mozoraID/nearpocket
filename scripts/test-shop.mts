/**
 * Delivery-address validation and the shop order-flow receipt timeline.
 * No network, no 1Click, no partner calls.
 */
import assert from "node:assert/strict";
import { attachSavedAddress } from "../src/lib/agent/delivery.ts";
import {
  formatShipTo,
  maskPhone,
  validateDeliveryAddress,
  type DeliveryAddress,
} from "../src/lib/address.ts";
import {
  MERCHANT_CHECKOUT_COMPLIANCE,
  buildMerchantCheckoutTimeline,
  formatFiatLeg,
  isRealTestnetAccount,
  withShopOrder,
} from "../src/lib/settlement/order-flow.ts";
import type { SettlementRequest } from "../src/lib/settlement/types.ts";

const valid = {
  recipientName: "Sari Putri",
  phone: "+62 812-9999-4321",
  street: "Jl. Melati No. 12",
  city: "Jakarta",
  province: "DKI Jakarta",
  postalCode: "10110",
  country: "Indonesia",
  note: "Leave with security",
};

const parsed = validateDeliveryAddress(valid);
assert.equal(parsed.ok, true);
if (!parsed.ok) throw new Error("expected valid address");
assert.equal(parsed.value.recipientName, "Sari Putri");
assert.equal(parsed.value.note, "Leave with security");
assert.equal("id" in parsed.value, false);

const missing = validateDeliveryAddress({});
assert.equal(missing.ok, false);
if (missing.ok) throw new Error("expected issues");
assert.deepEqual(
  missing.issues.map((issue) => issue.field),
  ["recipientName", "phone", "street", "city", "province", "postalCode", "country"],
);
assert.ok(missing.issues.every((issue) => issue.code === "required"));

const shortPhone = validateDeliveryAddress({ ...valid, phone: "12345" });
assert.equal(shortPhone.ok, false);
if (shortPhone.ok) throw new Error("expected short phone");
assert.equal(shortPhone.issues[0].field, "phone");
assert.ok(shortPhone.issues[0].code === "too_short" || shortPhone.issues[0].code === "invalid");

const letters = validateDeliveryAddress({ ...valid, phone: "0812-CALL-4321" });
assert.equal(letters.ok, false);
if (letters.ok) throw new Error("expected letter phone");
assert.equal(letters.issues.some((issue) => issue.field === "phone"), true);

const badPostal = validateDeliveryAddress({ ...valid, postalCode: "1" });
assert.equal(badPostal.ok, false);
if (badPostal.ok) throw new Error("expected postal");
assert.equal(badPostal.issues[0].field, "postalCode");

const longNote = validateDeliveryAddress({ ...valid, note: "x".repeat(201) });
assert.equal(longNote.ok, false);
if (longNote.ok) throw new Error("expected note");
assert.deepEqual(longNote.issues, [{ field: "note", code: "too_long" }]);

const unicode = validateDeliveryAddress({ ...valid, recipientName: "李雷" });
assert.equal(unicode.ok, true);

assert.equal(maskPhone("+62 812-9999-4321"), "+•••• 4321");
assert.equal(maskPhone("081299994321"), "•••• 4321");
assert.equal(maskPhone("12"), "••••");

const address: DeliveryAddress = { ...parsed.value, id: "addr_1", isDefault: true };
const ship = formatShipTo(address);
assert.match(ship, /^Sari Putri · \+•••• 4321 · Jl\. Melati No\. 12/);
assert.equal(ship.includes("812-9999"), false);
assert.equal(ship.includes("9999"), false);

assert.equal(isRealTestnetAccount("demo.local", true), false);
assert.equal(isRealTestnetAccount("demo.local", false), false);
assert.equal(isRealTestnetAccount("alice.testnet", true), false);
assert.equal(isRealTestnetAccount("alice.testnet", false), true);
assert.equal(isRealTestnetAccount("alice.near", false), false);
assert.equal(isRealTestnetAccount("alice.testnet", false, "mainnet"), false);
assert.equal(isRealTestnetAccount(null, false), false);

assert.equal(formatFiatLeg(162500.4, "IDR"), "162,500 IDR");
assert.equal(formatFiatLeg(undefined, "THB"), "THB");

const startedAt = "2026-11-09T00:00:00.000Z";
const demoFlow = buildMerchantCheckoutTimeline({
  startedAt,
  usdcAmount: 18.5,
  fiatCurrency: "IDR",
  fiatAmount: 162500.4,
  shipTo: ship,
  orderId: "demo.ord_test",
  contractId: "nearly-7b1462.testnet",
});
assert.equal(demoFlow.timeline.length, 5);
assert.deepEqual(
  demoFlow.timeline.map((step) => step.stepKey),
  [
    "receipt.stepLockedDemo",
    "receipt.stepApproved",
    "receipt.stepOfframp",
    "receipt.stepMarketplace",
    "receipt.stepPlaced",
  ],
);
const times = demoFlow.timeline.map((step) => Date.parse(step.at));
for (let i = 1; i < times.length; i++) {
  assert.equal(times[i] - times[i - 1], 2000);
}
assert.match(demoFlow.timeline[0].detail, /request_spend/);
assert.match(demoFlow.timeline[0].detail, /nearly-7b1462\.testnet/);
assert.match(demoFlow.timeline[0].detail, /No testnet transaction was sent/);
assert.equal(demoFlow.timeline[0].detail.includes("alice.testnet"), false);
assert.match(demoFlow.timeline[2].detail, /18\.50 USDC/);
assert.match(demoFlow.timeline[2].detail, /162,500 IDR/);
assert.match(demoFlow.timeline[2].detail, /\(demo\)/);
assert.match(demoFlow.timeline[3].detail, /VA\/QRIS/);
assert.match(demoFlow.timeline[3].detail, /buyer protection/);
assert.match(demoFlow.timeline[4].detail, /demo\.ord_test/);
assert.match(demoFlow.timeline[4].detail, /Ship to: Sari Putri/);
assert.equal(demoFlow.timeline[4].detail.includes("812-9999"), false);
assert.match(demoFlow.complianceNote, /NEAR Intents only swaps tokens/);
assert.match(demoFlow.complianceNote, /licensed partner/);
assert.match(demoFlow.complianceNote, /planned/);
assert.equal(demoFlow.complianceNote, MERCHANT_CHECKOUT_COMPLIANCE);

const testnetFlow = buildMerchantCheckoutTimeline({
  startedAt,
  usdcAmount: 10,
  fiatCurrency: "THB",
  fiatAmount: 342,
  shipTo: ship,
  orderId: "demo.ord_chain",
  contractId: "nearly-7b1462.testnet",
  testnetAccountId: "alice.testnet",
});
assert.equal(testnetFlow.timeline[0].stepKey, "receipt.stepLockedTestnet");
assert.match(testnetFlow.timeline[0].detail, /request_spend/);
assert.match(testnetFlow.timeline[0].detail, /approve_spend/);
assert.match(testnetFlow.timeline[0].detail, /alice\.testnet/);
assert.match(testnetFlow.timeline[0].detail, /nearly-7b1462\.testnet/);
assert.equal(/No testnet transaction was sent/.test(testnetFlow.timeline[0].detail), false);
assert.equal(testnetFlow.timeline[1].detail, "Approved by you.");
assert.match(testnetFlow.timeline[2].detail, /342 THB/);
assert.equal(testnetFlow.timeline[0].stepVars?.account, "alice.testnet");
assert.equal(testnetFlow.timeline[4].stepVars?.orderId, "demo.ord_chain");

const baseReq = {
  id: "pay_1",
  rail: {
    id: "card-intl",
    country: "Worldwide",
    countryCode: "WW",
    currency: "USD",
    currencySymbol: "$",
    name: "Card",
    kind: "card",
    tip: "",
  },
  merchantName: "Tokopedia · Demo",
  localAmount: 18.5,
  localCurrency: "USD",
  quote: {
    base: "USDC",
    quote: "USD",
    rate: 1,
    amountLocal: 18.5,
    amountUsdc: 18.5,
    source: "fallback",
    asOf: startedAt,
    feeBps: 35,
    feeUsdc: 0.06,
    totalUsdc: 18.56,
  },
  destinationRef: "https://example.test/item",
  mode: "card",
  note: "Buy now from NearPocket Shop.",
} as SettlementRequest;

const demoCheckout = withShopOrder(baseReq, {
  address,
  fiatCurrency: "IDR",
  fiatAmount: 300000,
  contractId: "nearly-7b1462.testnet",
  accountId: "demo.local",
  demoMode: true,
  orderId: "demo.ord_shop",
});
assert.equal(demoCheckout.mode, "merchant_checkout");
assert.match(demoCheckout.note || "", /Ship to: Sari Putri/);
assert.equal((demoCheckout.note || "").includes("812-9999"), false);
assert.equal(demoCheckout.shopOrder?.orderId, "demo.ord_shop");
assert.equal(demoCheckout.shopOrder?.testnetAccountId, undefined);
assert.equal(demoCheckout.shopOrder?.fiatCurrency, "IDR");

const chainCheckout = withShopOrder(baseReq, {
  address,
  fiatCurrency: "IDR",
  contractId: "nearly-7b1462.testnet",
  accountId: "alice.testnet",
  demoMode: false,
  networkId: "testnet",
  orderId: "demo.ord_liveacct",
});
assert.equal(chainCheckout.shopOrder?.testnetAccountId, "alice.testnet");

const mainnetSkipped = withShopOrder(baseReq, {
  address,
  fiatCurrency: "USD",
  contractId: "nearly-7b1462.testnet",
  accountId: "alice.near",
  demoMode: false,
  networkId: "mainnet",
  orderId: "demo.ord_skip",
});
assert.equal(mainnetSkipped.shopOrder?.testnetAccountId, undefined);

const queued = attachSavedAddress(
  { title: "Earbuds", notes: "under 20" },
  { shipTo: ship, addressId: "addr_1" },
);
assert.equal(queued.needsAddress, false);
assert.equal(queued.item.shipTo, ship);
assert.equal(queued.item.deliveryAddressId, "addr_1");
assert.match(queued.item.notes || "", /Ship to: Sari Putri/);

const blocked = attachSavedAddress({ title: "Earbuds" }, null);
assert.equal(blocked.needsAddress, true);
assert.equal(blocked.item.shipTo, undefined);

console.log("shop order tests ok");
