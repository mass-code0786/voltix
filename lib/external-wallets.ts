export const supportedExternalWalletNetworks = [
  { id: "BEP20", label: "BEP20 (BNB Smart Chain)", family: "evm" },
  { id: "ERC20", label: "ERC20 (Ethereum)", family: "evm" },
  { id: "TRC20", label: "TRC20 (Tron)", family: "tron" },
  { id: "POLYGON", label: "Polygon", family: "evm" },
  { id: "SOLANA", label: "Solana", family: "solana" },
] as const;

export type ExternalWalletNetwork = typeof supportedExternalWalletNetworks[number]["id"];

const base58Pattern = /^[1-9A-HJ-NP-Za-km-z]+$/;

export function isSupportedExternalWalletNetwork(value: string): value is ExternalWalletNetwork {
  return supportedExternalWalletNetworks.some(network => network.id === value);
}

export function externalWalletNetworkLabel(value: string) {
  return supportedExternalWalletNetworks.find(network => network.id === value)?.label ?? value;
}

export function validateExternalWalletAddress(network: string, address: string) {
  const trimmed = address.trim();
  if (!isSupportedExternalWalletNetwork(network)) return "Unsupported network";
  if (network === "BEP20" || network === "ERC20" || network === "POLYGON") {
    return /^0x[a-fA-F0-9]{40}$/.test(trimmed) ? null : "Enter a valid 0x wallet address for this network";
  }
  if (network === "TRC20") {
    return /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(trimmed) ? null : "Enter a valid TRC20 wallet address";
  }
  if (network === "SOLANA") {
    return trimmed.length >= 32 && trimmed.length <= 44 && base58Pattern.test(trimmed) ? null : "Enter a valid Solana wallet address";
  }
  return "Unsupported network";
}

export function normalizeExternalWalletAddress(network: string, address: string) {
  const trimmed = address.trim();
  return network === "BEP20" || network === "ERC20" || network === "POLYGON" ? trimmed.toLowerCase() : trimmed;
}
