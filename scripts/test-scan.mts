import assert from "node:assert/strict";
import { classifyCameraError, classifyQr, recoverableTxHash } from "../src/lib/qris/scan.ts";
import { mapSpendRequestView } from "../src/lib/near/request-view.ts";

assert.equal(classifyQr({ crcValid: false, merchantName: "Shop", merchantAccountCount: 1 }), "bad-crc");
assert.equal(classifyQr({ crcValid: true, merchantName: "", merchantAccountCount: 0 }), "invalid");
assert.equal(classifyQr({ crcValid: true, merchantName: "Shop", merchantAccountCount: 1 }), "ok");
assert.equal(classifyCameraError("Permission denied"), "permission");
assert.equal(classifyCameraError("Requested device not found"), "missing");
assert.equal(classifyCameraError("boom"), "other");
assert.equal(recoverableTxHash({ urlHash: "abc", storedHash: "old", seenHash: "old" }), "abc");
assert.equal(recoverableTxHash({ storedHash: "abc", seenHash: "abc" }), null);
assert.equal(recoverableTxHash({ storedHash: "abc", seenHash: null }), "abc");

const card = mapSpendRequestView(
  {
    id: "mug",
    status: "awaiting_approval",
    amount_usdc_6: "1490000",
    title: "a coffee mug",
    category: "food",
    expires_at_ns: "1794676092932118896",
    settlement_account: "settle.nearpocket.testnet",
  },
  "other.testnet",
);
assert.equal(card?.amountUsdc, 1.49);
assert.equal(card?.settlementAccount, "settle.nearpocket.testnet");
assert.equal(card?.title, "a coffee mug");

console.log("scan and request view ok");
