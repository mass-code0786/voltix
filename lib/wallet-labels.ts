import type { WalletType } from "@prisma/client";

type DisplayWalletType = WalletType | "SPOT" | "FUTURES" | "BITEX" | "FEE";

export function displayWalletName(type: DisplayWalletType) {
  if (type === "SPOT") return "Spot Wallet";
  if (type === "FUTURES") return "Futures Wallet";
  if (type === "BITEX") return "AI Wallet";
  if (type === "FEE") return "Treasury Wallet";
  return `${type} Wallet`;
}
