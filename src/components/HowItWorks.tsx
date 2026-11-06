"use client";

import { Sheet } from "./Sheet";
import { BRAND } from "@/config/brand";
import { NEAR_CONFIG, explorerAccountUrl } from "@/lib/near/config";

const STEPS = [
  { t: "Scan any QR", d: "QRIS in Indonesia, plus PromptPay, DuitNow, NETS, JPQR and Korea QR." },
  { t: "Pay from USDC on NEAR", d: "Hold any token. NEAR Intents converts it to native USDC on NEAR." },
  { t: "A licensed partner pays the merchant", d: "The partner (Xendit sandbox here) pays in local money via QRIS. The merchant never receives crypto." },
  { t: "Agent shops, you approve", d: "Tell the agent your budget. It watches marketplaces, but limits live in a NEAR contract and every buy needs your OK." },
];

const REAL = [
  "EMVCo QR parser + CRC check",
  "Live FX rates",
  "NEAR Intents 1Click quote (live, dry run)",
  "Xendit sandbox QRIS (test mode)",
  `Spending-policy contract on NEAR ${NEAR_CONFIG.networkId}`,
  "Wallet sign-in: Meteor, HOT, Intear, NEAR Mobile",
];
const MOCK = [
  "Balance & top up (demo USDC)",
  "Tokopedia / Shopee / Lazada / eBay results",
  "Intents swap execution (needs mainnet)",
  "Virtual card for worldwide pay",
];

export function HowItWorksSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title={`How ${BRAND.displayName} works`}>
      <ol className="space-y-4">
        {STEPS.map((s, i) => (
          <li key={s.t} className="flex gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink text-sm font-semibold text-cream-100">
              {i + 1}
            </span>
            <div>
              <p className="font-semibold">{s.t}</p>
              <p className="text-sm text-warm-600">{s.d}</p>
            </div>
          </li>
        ))}
      </ol>
      <div className="mt-6 grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-2xl bg-[#e3eedb] p-3">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-[#2f5a1f]">Real</p>
          <ul className="space-y-1 text-[13px] text-ink-soft">
            {REAL.map((r) => (
              <li key={r}>• {r}</li>
            ))}
          </ul>
        </div>
        <div className="rounded-2xl bg-cream-300 p-3">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-warm-600">Demo</p>
          <ul className="space-y-1 text-[13px] text-ink-soft">
            {MOCK.map((r) => (
              <li key={r}>• {r}</li>
            ))}
          </ul>
        </div>
      </div>
      <p className="mt-4 text-xs text-warm-600">
        Crypto is not a payment instrument in Indonesia, so USDC is converted by a licensed PJP before
        the merchant is paid in local fiat. Contract:{" "}
        <a
          className="underline"
          href={explorerAccountUrl(NEAR_CONFIG.agentPolicyContract)}
          target="_blank"
          rel="noreferrer"
        >
          {NEAR_CONFIG.agentPolicyContract}
        </a>
      </p>
    </Sheet>
  );
}
