"use client";

import { usePrivy } from "@privy-io/react-auth";

/** Renders nothing; exposes logout via render-prop / callback registration. */
export function usePrivyLogoutFn(): () => Promise<void> {
  const { logout } = usePrivy();
  return async () => {
    await logout();
  };
}
