/**
 * Single source of product naming. Change DISPLAY_NAME / TAGLINE here —
 * UI, metadata, and README copy should import from this module (or mirror it).
 * Repo / Vercel project names stay as-is until Abi picks a final name.
 */
export const BRAND = {
  /** Short product name shown in the UI */
  displayName: "Nearly",
  /** One-line pitch */
  tagline: "Pay nearly anywhere",
  /** Longer blurb for metadata / README */
  description:
    "NEAR wallet for QRIS, worldwide payments, merchant shopping & autonomous shopping plans with user-controlled spend limits.",
  /** GitHub / Vercel slug (do not change until rename follow-up) */
  repoSlug: "nearly",
  githubUrl: "https://github.com/mozoraID/nearly",
  liveUrl: "https://nearly-ijustabi.vercel.app",
  liveAlias: "https://nearly-blue.vercel.app",
  hackathonTracks: ["realworld", "agents"] as const,
} as const;

export type Brand = typeof BRAND;
