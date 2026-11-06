import { BRAND } from "@/config/brand";

export function DemoBanner() {
  return (
    <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-100">
      <strong className="font-semibold text-amber-50">Sandbox / demo.</strong>{" "}
      Settlement uses mock PJP unless <code>XENDIT_SECRET_KEY</code> is set. Crypto is never
      sent to merchants — in production a regulated partner converts USDC → local fiat, then
      pays QRIS/card. Product name is configurable in <code>src/config/brand.ts</code> ({BRAND.displayName}).
    </div>
  );
}
