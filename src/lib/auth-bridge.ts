/** Lightweight pub/sub so landing CTAs can open the WalletButton sign-in sheet. */
type Opener = () => void;
const openers = new Set<Opener>();

export function registerAuthOpener(fn: Opener) {
  openers.add(fn);
  return () => {
    openers.delete(fn);
  };
}

export function openAuthSheet() {
  openers.forEach((fn) => fn());
}
