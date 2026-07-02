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
  isActive: boolean;
  displayOrder: number;
};

export const usdInr = 83.47;

const seedBalances:Record<string,number>={BTC:.0124,BNB:1.84,USDT:1280.5,DOGE:8400,ADA:460,PEPE:32000000,SHIB:12400000};
const seedPrices:Record<string,number>={BTC:67842.18,ETH:3500,BNB:592.36,SOL:152.4,SUI:3.12,XRP:.62,ADA:.4582,DOGE:.1428,SHIB:.0000214,PEPE:.0000126,USDT:1};
const seedChanges:Record<string,number>={BTC:2.84,ETH:1.9,BNB:1.27,SOL:3.4,SUI:4.1,XRP:.8,ADA:-.44,DOGE:-1.62,SHIB:4.91,PEPE:7.32,USDT:.02};

export const coins: Coin[] = coinCatalog.map((coin,index) => {
  const localLogoPath=`/coin-logos/${coin.symbol.toLowerCase()}.png`;
  const base=20+(index%17)*2;
  const change=seedChanges[coin.symbol]??(((index%9)-4)*.72);
  return {
    symbol: coin.symbol,
    name: coin.name,
    pair: coin.pair??`${coin.symbol}USDT`,
    price: seedPrices[coin.symbol]??Math.max(.000001, 1000 / (index + 8)),
    change,
    color: coin.color,
    balance: seedBalances[coin.symbol]??0,
    spark: Array.from({length:9},(_,step)=>base+step*(change>=0?1:-1)+(step%3)),
    logoPath: localLogoPath,
    localLogoPath,
    isActive: coin.enabled!==false,
    displayOrder: index + 1,
  };
});

export const tradeSlots = [
  { utcHour: 8, utcMinute: 30, label: "Window 1", status: "completed" },
  { utcHour: 12, utcMinute: 30, label: "Window 2", status: "active" },
  { utcHour: 14, utcMinute: 30, label: "Window 3", status: "upcoming" },
];

export const incomeRows = [
  { type: "Copy trade income", from: "Trade #T4821", amount: 24.50, time: "Today, 6:30 PM", icon: "chart" },
  { type: "Level income", from: "Rahul S. · L2", amount: 8.40, time: "Today, 2:12 PM", icon: "team" },
  { type: "Direct income", from: "Neha K. joined Pro", amount: 15, time: "Yesterday, 8:42 PM", icon: "user" },
  { type: "Copy trade income", from: "Trade #T4790", amount: 22.75, time: "Yesterday, 6:30 PM", icon: "chart" },
  { type: "Level income", from: "Vikram P. · L3", amount: 4.25, time: "Jun 9, 2026", icon: "team" },
];

export const teamMembers = [
  { name: "Rahul Sharma", initials: "RS", level: 1, package: 250, status: "Active", joined: "2d ago" },
  { name: "Neha Kapoor", initials: "NK", level: 1, package: 100, status: "Active", joined: "4d ago" },
  { name: "Amit Patel", initials: "AP", level: 1, package: 50, status: "Active", joined: "5d ago" },
  { name: "Sara Khan", initials: "SK", level: 2, package: 100, status: "Active", joined: "1w ago" },
  { name: "Vikram Pillai", initials: "VP", level: 3, package: 50, status: "Active", joined: "2w ago" },
];
