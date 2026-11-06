import { WalletShell } from "@/components/WalletShell";

export default function WalletLayout({ children }: { children: React.ReactNode }) {
  return <WalletShell>{children}</WalletShell>;
}
