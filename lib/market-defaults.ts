import { coinCatalog } from "./coin-list";

export type Coin = {
  symbol: string;
  name: string;
  pair: string;
  price: number;
  change: number;
  color: string;
  balance: number;
  spark: number[];
  logoPath: string;
  localLogoPath: string;
  logoUrl?: string | null;
  isActive: boolean;
  displayOrder: number;
};

export const usdInr = 83.47;

const defaultPrices: Record<string, number> = { BTC: 67842.18, ETH: 3500, BNB: 592.36, SOL: 152.4, SUI: 3.12, XRP: .62, ADA: .4582, DOGE: .1428, SHIB: .0000214, PEPE: .0000126, USDT: 1 };
const defaultChanges: Record<string, number> = { BTC: 2.84, ETH: 1.9, BNB: 1.27, SOL: 3.4, SUI: 4.1, XRP: .8, ADA: -.44, DOGE: -1.62, SHIB: 4.91, PEPE: 7.32, USDT: .02 };

export const coins: Coin[] = coinCatalog.map((coin, index) => {
  const localLogoPath = `/coin-logos/${coin.symbol.toLowerCase()}.png`;
  const base = 20 + (index % 17) * 2;
  const change = defaultChanges[coin.symbol] ?? (((index % 9) - 4) * .72);
  return {
    symbol: coin.symbol,
    name: coin.name,
    pair: coin.pair ?? `${coin.symbol}USDT`,
    price: defaultPrices[coin.symbol] ?? Math.max(.000001, 1000 / (index + 8)),
    change,
    color: coin.color,
    balance: 0,
    spark: Array.from({ length: 9 }, (_, step) => base + step * (change >= 0 ? 1 : -1) + (step % 3)),
    logoPath: localLogoPath,
    localLogoPath,
    logoUrl: coin.logoUrl,
    isActive: coin.enabled !== false,
    displayOrder: index + 1,
  };
});
