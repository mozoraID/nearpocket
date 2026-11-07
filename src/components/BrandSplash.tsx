import { BRAND } from "@/config/brand";

/** Centered NP mark used for wallet boot and sign-out. */
export function BrandSplash({ detail }: { detail: string }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-cream-200 text-ink">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-ink text-sm font-bold text-cream-100">
        NP
      </span>
      <p className="text-sm font-medium">{BRAND.displayName}</p>
      <p className="text-xs text-warm-500">{detail}</p>
    </div>
  );
}
