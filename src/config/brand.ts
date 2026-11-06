/**
 * Single source of product naming. Change DISPLAY_NAME / TAGLINE here —
 * UI, metadata, and README copy should import from this module (or mirror it).
 */
export const BRAND = {
  /** Short product name shown in the UI */
  displayName: "NearPocket",
  /** One-line pitch */
  tagline: "Your NEAR pocket for real-world money",
  /** Longer blurb for metadata / README */
  description:
    "NEAR-native wallet for QRIS & ASEAN QR, worldwide Intents routing to USDC, merchant shopping, and autonomous shopping plans with on-chain spend limits.",
  /** GitHub / Vercel slug */
  repoSlug: "nearpocket",
  githubUrl: "https://github.com/mozoraID/nearpocket",
  liveUrl: "https://nearpocket-ijustabi.vercel.app",
  liveAlias: "https://nearly-ijustabi.vercel.app",
  legacyAlias: "https://nearly-blue.vercel.app",
  hackathonTracks: ["realworld", "agents"] as const,
  /** Deployed testnet contract id (account created before rebrand — keep as-is). */
  testnetContractId: "nearly-7b1462.testnet",
} as const;

export type Brand = typeof BRAND;
