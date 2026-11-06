/** Short, human label for the header chip — never the full raw address. */
export function shortAccountLabel(accountId: string | null | undefined, _authMethod?: string): string {
  if (!accountId) return "Account";
  // Named NEAR accounts
  if (accountId.endsWith(".near") || accountId.endsWith(".testnet")) {
    const base = accountId.split(".")[0];
    if (base.length <= 10) return accountId.length <= 16 ? accountId : `${base}…`;
    return `${base.slice(0, 8)}…`;
  }
  // Privy email-style
  if (accountId.startsWith("privy:")) {
    const rest = accountId.slice(6);
    if (rest.includes("@")) {
      const name = rest.split("@")[0];
      return name.length > 14 ? `${name.slice(0, 12)}…` : name;
    }
    return "Google";
  }
  // Hex / implicit account
  if (/^[0-9a-fA-F]{40,}$/.test(accountId) || accountId.length > 20) {
    return `${accountId.slice(0, 4)}…${accountId.slice(-4)}`;
  }
  return accountId.length > 14 ? `${accountId.slice(0, 12)}…` : accountId;
}

export function accountInitials(accountId: string | null | undefined): string {
  if (!accountId) return "?";
  if (accountId.startsWith("privy:")) {
    const rest = accountId.slice(6);
    const name = rest.includes("@") ? rest.split("@")[0] : rest;
    return (name.slice(0, 1) || "G").toUpperCase();
  }
  if (accountId.endsWith(".near") || accountId.endsWith(".testnet")) {
    return accountId.slice(0, 1).toUpperCase();
  }
  return accountId.slice(0, 1).toUpperCase();
}

/** Simple deterministic pastel from id for avatar bg */
export function avatarHue(accountId: string): number {
  let h = 0;
  for (let i = 0; i < accountId.length; i++) h = (h * 31 + accountId.charCodeAt(i)) % 360;
  return h;
}
