/**
 * Network id for the relayer. Read through a variable key so Next does not
 * inline NEXT_PUBLIC_NEAR_NETWORK at build time. A server started with
 * mainnet set must still refuse, even if the client bundle was built earlier.
 */
export function configuredNetworkId(env: NodeJS.ProcessEnv = process.env): string {
  const read = (name: string) => (env[name] || "").trim().toLowerCase();
  return read("NEAR_NETWORK") || read("NEXT_PUBLIC_NEAR_NETWORK") || "testnet";
}
