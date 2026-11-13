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
    "NEAR-native wallet for local QR rails across Asia (QRIS, PromptPay, DuitNow, PayNow, QR Ph, VietQR, JPQR, Korea QR, UPI), worldwide USD card via NEAR Intents, marketplace shopping, and a shopping agent with on-chain approval.",
  /** GitHub / Vercel slug */
  repoSlug: "nearpocket",
  githubUrl: "https://github.com/mozoraID/nearpocket",
  liveUrl: "https://nearpocket.vercel.app",
  liveTeamUrl: "https://nearpocket-ijustabi.vercel.app",
  liveAlias: "https://nearly-ijustabi.vercel.app",
  legacyAlias: "https://nearly-blue.vercel.app",
  /** Current default testnet contract. Override with NEXT_PUBLIC_AGENT_POLICY_CONTRACT. */
  testnetContractId: "pocket.nearpocket.testnet",
} as const;

export type Brand = typeof BRAND;
