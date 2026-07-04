"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowDownLeft, ArrowDownToLine, ArrowLeftRight, ArrowUpRight, BarChart3, Bell,
  ChevronDown, ChevronRight, CircleDollarSign, Copy, FileClock, Grid2X2,
  Headphones, Home, Landmark, LineChart, Menu, Network, Plus, QrCode, Search,
  Send, Settings, Share2, ShieldCheck,
  Trophy, Users, Wallet, X, Zap,
} from "lucide-react";
import { CoinMark } from "./coin-mark";
import { Sparkline } from "./sparkline";
import { CandlestickChart } from "./candlestick-chart";
import { OrderBookPanel } from "./order-book";
import { BrandLogo } from "./brand-logo";
import { coins } from "@/lib/demo-data";
import { compact, inr, usd } from "@/lib/format";
import { useLiveTickers } from "@/lib/use-market-data";
import { currencyConfigForCountry, formatLocalCurrency } from "@/lib/local-currency";

type Tab = "home" | "markets" | "trade" | "bitex" | "team" | "wallet";
type TradeCategory = "spot" | "futures" | "grid" | "margin" | "copy";
type WalletSection = "overview" | "assets" | "ledger";
type WalletAction = "deposit" | null;
type UserWallet = "SPOT" | "FUTURES" | "BITEX";
type WalletActivity = readonly [typeof ArrowDownLeft, string, string, string];
type WithdrawalInput = { walletType: "SPOT" | "BITEX"; amount: number; address: string; network: string };
type DepositInput = { amount: number; network: string; txHash?: string };
type DepositRecord = { id: string; amount: number; asset: string; network: string; txHash?: string | null; status: string; createdAt: string };
type WithdrawalRecord = { id: string; walletType: "SPOT" | "BITEX"; amount: number; fee: number; receivable: number; asset: string; address: string; network: string; txHash?: string | null; status: string; rejectionReason?: string | null; createdAt: string };
type ActiveCopyTrade = { code: string; amount: number; returnPercent: number; profit: number; remainingTime?: number; status?: string; date?: string };
type CopyTradeHistory = ActiveCopyTrade & { date: string; status: string };
type AppCoin = typeof coins[number];
type MarketCoin = AppCoin & { volume?: number; quoteVolume?: number; live?: boolean };
type CoinSetting = Partial<Omit<AppCoin,"localLogoPath">> & { localLogoPath?: string | null };
type CurrentUser = { id?: string | null; uid?: string | null; name?: string | null; email?: string | null; country?: string | null; vipRank?: string | null; role?: string | null };
type AuthMode = "login" | "register";
type WalletSnapshot = {
  balances?: {
    spot?: number;
    funding?: number;
    futures?: number;
    bitex?: number;
  };
  bitex?: {
    principal?: number;
    incomeEarned?: number;
    targetAmount?: number;
    unlocked?: boolean;
  };
};
type AssetTotals = {
  available?: {
    spot?: number;
    futures?: number;
    bitex?: number;
  };
  locked?: {
    spot?: number;
    futures?: number;
    bitex?: number;
  };
  total?: {
    spot?: number;
    futures?: number;
    bitex?: number;
  };
  portfolio?: number;
  bitex?: {
    principal?: number;
    incomeEarned?: number;
    targetAmount?: number;
    unlocked?: boolean;
  };
};
type AssetRecord = {
  accountId: string;
  walletType: UserWallet;
  symbol: string;
  name: string;
  balance: number;
  enabled: boolean;
};
type WalletHistoryRecord = {
  id: string;
  walletType: UserWallet;
  asset: string;
  direction: "DEBIT" | "CREDIT";
  amount: number;
  signedAmount: number;
  title: string;
  status: string;
  createdAt: string;
};
type TeamMember = {
  id: string;
  uid?: string | null;
  name: string;
  initials: string;
  level: number;
  packageAmount: number;
  status: string;
  joinedAt: string;
};
type TeamSnapshot = {
  referralUid?: string | null;
  referralLink?: string | null;
  stats?: {
    directTeamCount?: number;
    totalNetworkCount?: number;
    activeUsersCount?: number;
    teamVolume?: number;
  };
  members?: TeamMember[];
};
type DashboardSnapshot = {
  user?: {
    name?: string | null;
    uid?: string | null;
    vipRank?: string | null;
  };
  summary?: {
    totalPortfolio?: number;
    todaysProfit?: number;
    totalIncome?: number;
    activePackageAmount?: number;
  };
  wallet?: WalletSnapshot;
  team?: TeamSnapshot;
};
type AiSubscription = {
  id: string;
  amount: number;
  startsAt: string;
  expiresAt: string;
  active: boolean;
  remainingDays: number;
};
type AiSubscriptionStatus = {
  price: number;
  validityDays: number;
  subscription: AiSubscription | null;
};
type KycSnapshot = {
  status: "NOT_SUBMITTED" | "PENDING" | "APPROVED" | "REJECTED";
  request: { id: string; name: string; documentType: string; documentNumber: string; documentImagePath?: string | null; rejectionReason?: string | null; createdAt: string } | null;
};
type SupportTicket = {
  id: string;
  subject: string;
  message: string;
  status: "OPEN" | "PENDING" | "CLOSED";
  adminReply?: string | null;
  createdAt: string;
};
type NotificationItem = {
  id: string;
  type: string;
  title: string;
  message: string;
  readAt: string | null;
  createdAt: string;
  unread: boolean;
};

const tabs: { id: Tab; label: string; icon: typeof Home }[] = [
  { id: "home", label: "Home", icon: Home },
  { id: "markets", label: "Markets", icon: BarChart3 },
  { id: "trade", label: "Trade", icon: LineChart },
  { id: "bitex", label: "AI", icon: Zap },
  { id: "wallet", label: "Asset", icon: Wallet },
];

const mobileTabs: { id: Tab; label: string; icon: typeof Home; section?: WalletSection }[] = [
  { id: "home", label: "Home", icon: Home },
  { id: "markets", label: "Markets", icon: BarChart3 },
  { id: "trade", label: "Trade", icon: LineChart },
  { id: "bitex", label: "AI", icon: Zap },
  { id: "wallet", label: "Asset", icon: Wallet, section: "overview" },
];

const card = "rounded-2xl border border-line bg-panel/80";
const coinSettingsKey = "voltix.coin-settings";
const topCopyTraders: { country: string; name: string; monthlyReturn: number; message: string }[] = [];
const homeMarketPulseSymbols = ["BTC","ETH","BNB","SOL","SUI","XRP","DOGE","ADA","TRX","AVAX","DOT","LINK","TON","SHIB","LTC","BCH","ATOM","APT","ARB","OP","PEPE","NEAR","INJ","SEI","FIL"];
const emptyAssetTotals: AssetTotals = { available: { spot: 0, futures: 0, bitex: 0 }, locked: { spot: 0, futures: 0, bitex: 0 }, total: { spot: 0, futures: 0, bitex: 0 }, portfolio: 0, bitex: { principal: 0, incomeEarned: 0, targetAmount: 0, unlocked: false } };

function applyCoinSettings(baseCoins: AppCoin[]): AppCoin[] {
  if (typeof window === "undefined") return baseCoins;
  try {
    const settings = JSON.parse(window.localStorage.getItem(coinSettingsKey) ?? "{}") as Record<string,CoinSetting>;
    return baseCoins
      .map(coin => {
        const setting=settings[coin.symbol] ?? {};
        return { ...coin, ...setting, localLogoPath: setting.localLogoPath ?? coin.localLogoPath, logoPath: setting.localLogoPath ?? coin.logoPath };
      })
      .sort((a,b)=>(a.displayOrder??9999)-(b.displayOrder??9999));
  } catch {
    return baseCoins;
  }
}

function mergeCoinSettings(baseCoins: AppCoin[], settings: Record<string,CoinSetting>): AppCoin[] {
  const bySymbol = new Map(baseCoins.map(coin => [coin.symbol, coin]));
  const merged = baseCoins.map(coin => {
    const setting=settings[coin.symbol] ?? {};
    return { ...coin, ...setting, localLogoPath: setting.localLogoPath ?? coin.localLogoPath, logoPath: setting.localLogoPath ?? coin.logoPath };
  });
  for (const [symbol, setting] of Object.entries(settings)) {
    if (bySymbol.has(symbol) || !setting.name) continue;
    merged.push({
      symbol,
      name: setting.name,
      pair: setting.pair ?? `${symbol}USDT`,
      price: 0,
      change: 0,
      color: "#94a3b8",
      balance: 0,
      spark: [20,21,20,22,21,23,22,24,23],
      logoPath: setting.localLogoPath ?? `/coin-logos/${symbol.toLowerCase()}.png`,
      localLogoPath: setting.localLogoPath ?? `/coin-logos/${symbol.toLowerCase()}.png`,
      isActive: setting.isActive ?? true,
      displayOrder: setting.displayOrder ?? 9999,
    });
  }
  return merged.sort((a,b)=>(a.displayOrder??9999)-(b.displayOrder??9999));
}

function mergeAssetRecords(baseCoins: AppCoin[], assets: AssetRecord[]): AppCoin[] {
  const bySymbol = new Map(baseCoins.map(coin => [coin.symbol, coin]));
  const grouped = new Map<string, AssetRecord>();
  for (const asset of assets) {
    const current = grouped.get(asset.symbol);
    grouped.set(asset.symbol, current ? { ...current, balance: current.balance + Number(asset.balance ?? 0), enabled: current.enabled || asset.enabled } : { ...asset, balance: Number(asset.balance ?? 0) });
  }
  return Array.from(grouped.values()).map((asset, index) => {
    const base = bySymbol.get(asset.symbol);
    return {
      ...(base ?? {
        symbol: asset.symbol,
        name: asset.name,
        pair: `${asset.symbol}USDT`,
        price: asset.symbol === "USDT" ? 1 : 0,
        change: 0,
        color: "#94a3b8",
        spark: [20,21,20,22,21,23,22,24,23],
        logoPath: `/coin-logos/${asset.symbol.toLowerCase()}.png`,
        localLogoPath: `/coin-logos/${asset.symbol.toLowerCase()}.png`,
        isActive: asset.enabled,
        displayOrder: 9999 + index,
      }),
      name: base?.name ?? asset.name,
      balance: Number(asset.balance ?? 0),
      isActive: asset.enabled,
    };
  }).sort((a,b)=>(a.displayOrder??9999)-(b.displayOrder??9999));
}

function mapLedgerHistory(rows: WalletHistoryRecord[]): WalletActivity[] {
  return rows.map(row => [
    row.direction === "CREDIT" ? ArrowDownLeft : ArrowUpRight,
    row.title || `${row.walletType} wallet movement`,
    `${row.signedAmount >= 0 ? "+" : "-"}${Math.abs(Number(row.amount)).toFixed(2)} ${row.asset}`,
    row.status,
  ] as WalletActivity);
}

export default function AppShell() {
  const [tab, setTab] = useState<Tab>("home");
  const [tradeCategory, setTradeCategory] = useState<TradeCategory>("spot");
  const [walletSection, setWalletSection] = useState<WalletSection>("overview");
  const [walletAction, setWalletAction] = useState<WalletAction>(null);
  const [menu, setMenu] = useState(false);
  const [tradeMenuOpen, setTradeMenuOpen] = useState(false);
  const [balanceVisible, setBalanceVisible] = useState(true);
  const [toast, setToast] = useState("");
  const [activeCopyTrade, setActiveCopyTrade] = useState<ActiveCopyTrade | null>(null);
  const [copyTradeHistory, setCopyTradeHistory] = useState<CopyTradeHistory[]>([]);
  const [marketCoins, setMarketCoins] = useState(() => applyCoinSettings(coins).map((coin) => ({ ...coin, balance: 0 })));
  const [walletAssets, setWalletAssets] = useState<AppCoin[]>([]);
  const [assetTotals, setAssetTotals] = useState<AssetTotals>(emptyAssetTotals);
  const [futuresBalance, setFuturesBalance] = useState(0);
  const [bitexBalance, setBitexBalance] = useState(0);
  const [bitexTransferred, setBitexTransferred] = useState(0);
  const [bitexPrincipalLocked, setBitexPrincipalLocked] = useState(0);
  const [bitexIncomeEarned, setBitexIncomeEarned] = useState(0);
  const [transferOpen, setTransferOpen] = useState<{ from: UserWallet; to: UserWallet } | null>(null);
  const [withdrawalOpen, setWithdrawalOpen] = useState(false);
  const [verificationOpen, setVerificationOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [authMode, setAuthMode] = useState<AuthMode | null>(null);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [dashboard, setDashboard] = useState<DashboardSnapshot | null>(null);
  const [aiSubscription, setAiSubscription] = useState<AiSubscriptionStatus | null>(null);
  const [walletActivity, setWalletActivity] = useState<WalletActivity[]>([]);
  const [userCountry, setUserCountry] = useState("United States");

  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
  };

  const applyAuthenticatedUser = useCallback((user: CurrentUser | null) => {
    setCurrentUser(user);
    if (user?.country?.trim()) setUserCountry(user.country);
  }, []);

  const refreshMe = useCallback(async () => {
    const response = await fetch("/api/me");
    const data = await response.json();
    const user = data?.authenticated ? data.user as CurrentUser : null;
    applyAuthenticatedUser(user);
    return user;
  }, [applyAuthenticatedUser]);

  const applyWalletSnapshot = useCallback((wallet: WalletSnapshot | null) => {
    if (!wallet) {
      setFuturesBalance(0);
      setBitexBalance(0);
      setBitexTransferred(0);
      setBitexPrincipalLocked(0);
      setBitexIncomeEarned(0);
      return;
    }

    const balances = wallet.balances ?? {};
    const spotBalance = Number(balances.spot ?? 0);
    const fundingBalance = Number(balances.funding ?? balances.futures ?? 0);
    const realBitexBalance = Number(balances.bitex ?? 0);
    const bitexPrincipal = Number(wallet.bitex?.principal ?? 0);
    const bitexIncome = Number(wallet.bitex?.incomeEarned ?? 0);

    setFuturesBalance(fundingBalance);
    setBitexBalance(realBitexBalance);
    setBitexTransferred(bitexPrincipal);
    setBitexPrincipalLocked(bitexPrincipal);
    setBitexIncomeEarned(bitexIncome);
  }, []);

  const refreshWallet = useCallback(async (user: CurrentUser | null) => {
    if (!user) {
      applyWalletSnapshot(null);
      return;
    }
    const response = await fetch("/api/wallet");
    if (!response.ok) throw new Error("Wallet request failed");
    const data = await response.json();
    applyWalletSnapshot(data?.authenticated ? data.wallet as WalletSnapshot : null);
  }, [applyWalletSnapshot]);

  const refreshDashboard = useCallback(async (user: CurrentUser | null) => {
    if (!user) {
      setDashboard(null);
      return;
    }
    const response = await fetch("/api/dashboard");
    if (!response.ok) throw new Error("Dashboard request failed");
    const data = await response.json();
    setDashboard(data?.authenticated ? data.dashboard as DashboardSnapshot : null);
  }, []);

  const refreshCopyTradeStatus = useCallback(async (user: CurrentUser | null) => {
    if (!user) {
      setActiveCopyTrade(null);
      setCopyTradeHistory([]);
      return;
    }
    const response = await fetch("/api/copy-trade/status");
    if (!response.ok) throw new Error("Copy trade status request failed");
    const data = await response.json();
    const status = data?.status;
    setActiveCopyTrade(status?.activeTrade ? normalizeTrade(status.activeTrade) : null);
    setCopyTradeHistory(Array.isArray(status?.history) ? status.history.map(normalizeTrade) : []);
  }, []);

  const refreshAiSubscription = useCallback(async (user: CurrentUser | null) => {
    if (!user) {
      setAiSubscription(null);
      return null;
    }
    const response = await fetch("/api/ai/subscription");
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "AI request failed");
    const status = data as AiSubscriptionStatus;
    setAiSubscription(status);
    return status;
  }, []);

  const refreshAssets = useCallback(async (user: CurrentUser | null) => {
    if (!user) {
      setWalletAssets([]);
      setAssetTotals(emptyAssetTotals);
      setWalletActivity([]);
      return;
    }
    const response = await fetch("/api/assets");
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Assets request failed");
    const assets = Array.isArray(data.assets) ? data.assets as AssetRecord[] : [];
    const totals = data.totals as AssetTotals;
    const history = Array.isArray(data.history) ? data.history as WalletHistoryRecord[] : [];
    setWalletAssets(mergeAssetRecords(marketCoins, assets));
    setAssetTotals(totals ?? emptyAssetTotals);
    setFuturesBalance(Number(totals?.total?.futures ?? 0));
    setBitexBalance(Number(totals?.total?.bitex ?? 0));
    setBitexTransferred(Number(totals?.bitex?.principal ?? 0));
    setBitexPrincipalLocked(Number(totals?.bitex?.principal ?? 0));
    setBitexIncomeEarned(Number(totals?.bitex?.incomeEarned ?? 0));
    setWalletActivity(mapLedgerHistory(history));
  }, [marketCoins]);

  const refreshNotifications = useCallback(async (user: CurrentUser | null) => {
    if (!user) {
      setNotifications([]);
      setUnreadNotifications(0);
      setNotificationOpen(false);
      return;
    }
    const response = await fetch("/api/notifications");
    if (!response.ok) throw new Error("Notifications request failed");
    const data = await response.json();
    setNotifications(Array.isArray(data.notifications) ? data.notifications as NotificationItem[] : []);
    setUnreadNotifications(Number(data.unreadCount ?? 0));
  }, []);

  useEffect(() => {
    fetch("/api/coins")
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(data => {
        if (!Array.isArray(data.coins) || !data.coins.length) return;
        const settings = Object.fromEntries(data.coins.map((coin: CoinSetting & {symbol:string}) => [coin.symbol, coin])) as Record<string,CoinSetting>;
        window.localStorage.setItem(coinSettingsKey, JSON.stringify(settings));
        setMarketCoins(current => mergeCoinSettings(current, settings).map(coin => ({ ...coin, balance: 0 })));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    refreshMe()
      .catch(() => setUserCountry("United States"));
  }, [refreshMe]);

  useEffect(() => {
    refreshWallet(currentUser)
      .catch(() => {
        if (!currentUser) applyWalletSnapshot(null);
      });
  }, [applyWalletSnapshot, currentUser, refreshWallet]);

  useEffect(() => {
    refreshDashboard(currentUser)
      .catch(() => {
        if (!currentUser) setDashboard(null);
      });
  }, [currentUser, refreshDashboard]);

  useEffect(() => {
    refreshCopyTradeStatus(currentUser)
      .catch(() => {
        if (!currentUser) {
          setActiveCopyTrade(null);
          setCopyTradeHistory([]);
        }
      });
  }, [currentUser, refreshCopyTradeStatus]);

  useEffect(() => {
    refreshAiSubscription(currentUser)
      .catch(() => {
        if (!currentUser) setAiSubscription(null);
      });
  }, [currentUser, refreshAiSubscription]);

  useEffect(() => {
    refreshAssets(currentUser)
      .catch(() => {
        if (!currentUser) {
          setWalletAssets([]);
          setAssetTotals(emptyAssetTotals);
          setWalletActivity([]);
        }
      });
  }, [currentUser, refreshAssets]);

  useEffect(() => {
    refreshNotifications(currentUser)
      .catch(() => {
        if (!currentUser) {
          setNotifications([]);
          setUnreadNotifications(0);
        }
      });
  }, [currentUser, refreshNotifications]);

  const syncNavigation = useCallback(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedTab = params.get("view");
    const requestedTrade = params.get("trade");
    const requestedSection = params.get("wallet");
    if(requestedTab==="copy"||requestedTab==="bitex"||requestedTrade==="copy"){setTab("bitex");setTradeCategory("copy");}
    else setTab([...tabs,{id:"team" as Tab,label:"Team",icon:Network}].some(({ id }) => id === requestedTab) ? requestedTab as Tab : "home");
    if(["spot","futures","grid","margin","copy"].includes(requestedTrade??""))setTradeCategory(requestedTrade as TradeCategory);
    setWalletSection(
      ["overview", "assets", "ledger"].includes(requestedSection ?? "")
        ? requestedSection as WalletSection
        : "overview",
    );
    setWalletAction(params.get("action") === "deposit" ? "deposit" : null);
    setMenu(false);
    setTradeMenuOpen(false);
  }, []);

  useEffect(() => {
    syncNavigation();
    window.addEventListener("popstate", syncNavigation);
    return () => window.removeEventListener("popstate", syncNavigation);
  }, [syncNavigation]);

  const updateUrl = useCallback((nextTab: Tab, section?: WalletSection, action?: WalletAction, replace = false) => {
    const url = new URL(window.location.href);
    if (nextTab === "home") url.searchParams.delete("view");
    else url.searchParams.set("view", nextTab);
    if(nextTab!=="trade")url.searchParams.delete("trade");
    if (nextTab === "wallet" && section && section !== "overview") url.searchParams.set("wallet", section);
    else url.searchParams.delete("wallet");
    if (nextTab === "wallet" && action) url.searchParams.set("action", action);
    else url.searchParams.delete("action");
    window.history[replace ? "replaceState" : "pushState"]({}, "", url);
  }, []);

  const navigate = useCallback((nextTab: Tab, section?: WalletSection, action?: WalletAction) => {
    setTab(nextTab);
    setWalletSection(section ?? "overview");
    setWalletAction(action ?? null);
    setMenu(false);
    setNotificationOpen(false);
    updateUrl(nextTab, section, action);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [updateUrl]);

  const selectTab = useCallback((nextTab: Tab, section?: WalletSection) => {
    if (nextTab === "trade") {
      setTradeMenuOpen(true);
      return;
    }
    navigate(nextTab, section);
  }, [navigate]);

  const openTrade = useCallback((category: TradeCategory) => {
    if(category==="copy"){
      setTradeMenuOpen(false);
      setTab("bitex");
      updateUrl("bitex");
      window.scrollTo({top:0,behavior:"smooth"});
      return;
    }
    setTradeCategory(category);
    setTab("trade");
    setMenu(false);
    setTradeMenuOpen(false);
    const url=new URL(window.location.href);
    url.searchParams.set("view","trade");
    url.searchParams.set("trade",category);
    url.searchParams.delete("wallet");
    url.searchParams.delete("action");
    window.history.pushState({},"",url);
    window.scrollTo({top:0,behavior:"smooth"});
  },[updateUrl]);

  const changeWalletSection = useCallback((section: WalletSection) => {
    setWalletSection(section);
    setWalletAction(null);
    updateUrl("wallet", section);
  }, [updateUrl]);

  const transferWallet = useCallback(async (from: UserWallet, to: UserWallet, amount: number) => {
    const spotBalance = Number(assetTotals.total?.spot ?? 0);
    const balances = { SPOT: spotBalance, FUTURES: futuresBalance, BITEX: bitexBalance };
    if (from === "BITEX" || amount <= 0 || amount > balances[from]) return false;
    const response = await fetch("/api/wallet", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fromWallet: from, toWallet: to, amount }) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      notify(data.error || "Transfer could not be completed");
      return false;
    }
    await Promise.all([refreshWallet(currentUser), refreshAssets(currentUser), refreshDashboard(currentUser)]);
    setTransferOpen(null);
    notify(`${amount.toFixed(2)} USDT transferred to ${to}`);
    return true;
  }, [assetTotals, bitexBalance, currentUser, futuresBalance, notify, refreshAssets, refreshDashboard, refreshWallet]);

  const createDeposit = useCallback(async ({ amount, network, txHash }: DepositInput) => {
    const response = await fetch("/api/deposits", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ amount, network, txHash }) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return { ok: false, message: data.error || "Deposit request failed" };
    await refreshAssets(currentUser);
    notify("Deposit request submitted");
    setWalletAction(null);
    updateUrl("wallet", walletSection, null, true);
    return { ok: true, message: "" };
  }, [currentUser, notify, refreshAssets, updateUrl, walletSection]);

  const createWithdrawal = useCallback(async ({ walletType, amount, address, network }: WithdrawalInput) => {
    const spotBalance = Number(assetTotals.total?.spot ?? 0);
    const bitexUnlocked = bitexPrincipalLocked > 0 && bitexIncomeEarned >= bitexPrincipalLocked * 2;
    if (walletType === "SPOT" && (amount <= 0 || amount > spotBalance)) return { ok: false, message: "Insufficient Spot wallet balance" };
    if (walletType === "BITEX" && (!bitexUnlocked || amount <= 0 || amount > bitexBalance)) return { ok: false, message: !bitexUnlocked ? "AI withdrawal will unlock after completing 2x copy trade income." : "Insufficient AI wallet balance" };
    const fee = walletType === "SPOT" ? 2 + amount * .05 : 0;
    const received = amount - fee;
    if (received <= 0) return { ok: false, message: "Withdrawal amount must exceed the total fee" };
    const response = await fetch("/api/withdrawals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ walletType, amount, address, network }) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return { ok: false, message: data.error || "Withdrawal request failed" };
    await refreshAssets(currentUser);
    notify("Withdrawal request sent to admin");
    setWithdrawalOpen(false);
    return { ok: true, message: "" };
  }, [assetTotals, bitexBalance, bitexIncomeEarned, bitexPrincipalLocked, currentUser, notify, refreshAssets]);

  const startCopyTrade = useCallback(async (rawCode: string) => {
    const response = await fetch("/api/copy-trade/execute", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: rawCode.toUpperCase() }) });
    const data = await response.json();
    if (!response.ok) return { ok: false, message: data.error || "Copy trade failed" };
    await refreshCopyTradeStatus(currentUser);
    await refreshWallet(currentUser);
    await refreshAssets(currentUser);
    notify(`Strategy ${data.trade.code} verified. ${Number(data.trade.amount).toFixed(2)} USDT locked from AI.`);
    return { ok: true, message: "" };
  }, [currentUser, notify, refreshAssets, refreshCopyTradeStatus, refreshWallet]);

  const purchaseAi = useCallback(async () => {
    if (!currentUser) {
      setAuthMode("login");
      return { ok: false, message: "Login required" };
    }
    try {
      await refreshAiSubscription(currentUser);
      const response = await fetch("/api/ai/subscription/purchase", { method: "POST" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 401) setAuthMode("login");
        return { ok: false, message: data.error || "AI purchase failed" };
      }
      await Promise.all([
        refreshWallet(currentUser),
        refreshAiSubscription(currentUser),
        refreshDashboard(currentUser),
        refreshCopyTradeStatus(currentUser),
      ]);
      notify("AI active");
      return { ok: true, message: "" };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : "AI purchase failed" };
    }
  }, [currentUser, notify, refreshAiSubscription, refreshCopyTradeStatus, refreshDashboard, refreshWallet]);

  const completeActiveCopyTrade = useCallback(() => {
    refreshCopyTradeStatus(currentUser).catch(() => {});
    refreshWallet(currentUser).catch(() => {});
  }, [currentUser, refreshCopyTradeStatus, refreshWallet]);

  const markNotificationsRead = useCallback(async () => {
    if (!currentUser || !unreadNotifications) return;
    const response = await fetch("/api/notifications/read", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
    const data = await response.json().catch(() => ({}));
    if (response.ok) {
      setUnreadNotifications(Number(data.unreadCount ?? 0));
      setNotifications(current => current.map(notification => ({ ...notification, readAt: notification.readAt ?? new Date().toISOString(), unread: false })));
    }
  }, [currentUser, unreadNotifications]);

  const screen = {
    home: <HomeScreen onNavigate={navigate} onOpenCopyTrade={()=>navigate("bitex")} assets={marketCoins} dashboard={dashboard} balanceVisible={balanceVisible} setBalanceVisible={setBalanceVisible} activeCopyTrade={activeCopyTrade} bitexBalance={bitexBalance} userCountry={userCountry} />,
    markets: <MarketsScreen coins={marketCoins} userCountry={userCountry} />,
    trade: <TradeWorkspace category={tradeCategory} />,
    bitex: <AiCopyTradePage currentUser={currentUser} subscription={aiSubscription} activeTrade={activeCopyTrade} bitexBalance={bitexBalance} history={copyTradeHistory} startTrade={startCopyTrade} completeTrade={completeActiveCopyTrade} purchaseAi={purchaseAi} openLogin={()=>setAuthMode("login")} />,
    team: <TeamScreen notify={notify} currentUser={currentUser} />,
    wallet: <WalletScreen notify={notify} assets={walletAssets} futuresBalance={futuresBalance} bitexBalance={bitexBalance} bitexIncomeEarned={bitexIncomeEarned} bitexTarget={bitexPrincipalLocked*2} activity={walletActivity} section={walletSection} action={walletAction} onSectionChange={changeWalletSection} onOpenTransfer={()=>setTransferOpen({from:"SPOT",to:"FUTURES"})} onOpenWithdrawal={()=>setWithdrawalOpen(true)} onOpenDeposit={() => { setWalletAction("deposit"); updateUrl("wallet", walletSection, "deposit"); }} onCloseAction={() => { setWalletAction(null); updateUrl("wallet", walletSection, null, true); }} onCreateDeposit={createDeposit} />,
  }[tab];

  return (
    <div className="min-h-screen pb-32 lg:pb-8">
      <div className="mx-auto flex min-h-screen max-w-[1500px]">
        <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 border-r border-line bg-[#09120f] p-5 lg:block">
          <Brand />
          <nav className="mt-9 space-y-1.5">
            {tabs.map(({ id, label, icon: Icon }) => (
              <button key={id} onClick={() => selectTab(id)} aria-current={tab === id ? "page" : undefined} className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold transition ${tab === id ? "bg-lime text-ink" : "text-slate-400 hover:bg-white/5 hover:text-white"}`}>
                <Icon size={19} />{label}
              </button>
            ))}
          </nav>
          <div className="absolute inset-x-5 bottom-5 rounded-2xl border border-lime/20 bg-lime/[.06] p-4">
            <div className="flex items-center gap-2 text-xs font-bold text-lime"><ShieldCheck size={15} /> ACCOUNT VERIFIED</div>
            <p className="mt-2 text-xs leading-5 text-slate-500">2FA enabled · KYC level 2</p>
            <Link href="/admin" className="mt-3 block text-xs font-bold text-white hover:text-lime">Open admin demo</Link>
          </div>
        </aside>

        <main className="min-w-0 flex-1 lg:ml-64">
          <header className="sticky top-0 z-30 border-b border-line/80 bg-ink/90 px-4 py-3 backdrop-blur-xl sm:px-6 lg:px-8">
            <div className="mx-auto flex max-w-6xl items-center justify-between">
              <div className="lg:hidden"><Brand compact /></div>
              <div className="hidden lg:block">
                <p className="text-xs text-slate-500">Welcome back</p>
                <h1 className="font-bold">{tab==="team"?"Team":tabs.find((item) => item.id === tab)?.label}</h1>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => { if (!currentUser) { setAuthMode("login"); return; } setNotificationOpen(value => !value); setMenu(false); refreshNotifications(currentUser).catch(() => {}); }} className="relative rounded-full border border-line bg-panel p-2.5 text-slate-300" aria-label="Notifications"><Bell size={18} />{unreadNotifications > 0 && <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-lime px-1 text-[10px] font-black text-ink">{unreadNotifications > 9 ? "9+" : unreadNotifications}</span>}</button>
                <button onClick={() => { setMenu(!menu); setNotificationOpen(false); }} className="grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br from-lime to-mint text-sm font-black text-ink">{initials(currentUser?.name)}</button>
              </div>
            </div>
          </header>
          {notificationOpen && <NotificationMenu close={() => setNotificationOpen(false)} notifications={notifications} unreadCount={unreadNotifications} markRead={markNotificationsRead} />}
          {menu && <ProfileMenu close={() => setMenu(false)} notify={notify} user={currentUser} openLogin={()=>{setMenu(false);setAuthMode("login");}} openRegister={()=>{setMenu(false);setAuthMode("register");}} logout={async()=>{await fetch("/api/auth/logout",{method:"POST"});await refreshMe();setMenu(false);notify("Logged out");}} openVerification={()=>{setMenu(false);setVerificationOpen(true);}} openHelp={()=>{setMenu(false);setHelpOpen(true);}} />}
          <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 lg:px-8 lg:py-8">{screen}</div>
        </main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-line bg-[#09120f]/95 px-1 pb-[max(.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-xl lg:hidden">
        <div className="mx-auto flex max-w-lg justify-around">
          {mobileTabs.map(({ id, label, icon: Icon, section }) => {
            const active = tab === id && (id !== "wallet" || walletSection === section);
            return (
            <button key={`${id}-${section ?? label}`} onClick={() => selectTab(id, section)} aria-current={active ? "page" : undefined} className={`flex min-w-0 flex-1 flex-col items-center gap-1 text-[9px] font-semibold ${active ? "text-lime" : "text-slate-500"}`}>
              <span className={`rounded-xl px-3 py-1 ${active ? "bg-lime/10" : ""}`}><Icon size={19} strokeWidth={active ? 2.5 : 1.8} /></span>
              <span className="truncate text-[10px]">{label}</span>
            </button>
          )})}
        </div>
      </nav>
      {tradeMenuOpen&&<TradeMenu close={()=>setTradeMenuOpen(false)} select={openTrade}/>} 
      {transferOpen&&<WalletTransferModal initialFrom={transferOpen.from} initialTo={transferOpen.to} balances={{SPOT:Number(assetTotals.total?.spot??0),FUTURES:futuresBalance,BITEX:bitexBalance}} close={()=>setTransferOpen(null)} transfer={transferWallet}/>} 
      {withdrawalOpen&&<WithdrawalModal balances={{SPOT:Number(assetTotals.total?.spot??0),BITEX:bitexBalance}} bitexUnlocked={bitexPrincipalLocked>0&&bitexIncomeEarned>=bitexPrincipalLocked*2} close={()=>setWithdrawalOpen(false)} withdraw={createWithdrawal}/>} 
      {verificationOpen&&<VerificationRequestModal close={()=>setVerificationOpen(false)} notify={notify} user={currentUser}/>} 
      {helpOpen&&<HelpCenterModal close={()=>setHelpOpen(false)} notify={notify}/>} 
      {authMode&&<AuthModal mode={authMode} setMode={setAuthMode} close={()=>setAuthMode(null)} authenticated={async()=>{await refreshMe();setAuthMode(null);notify(authMode==="register"?"Registration complete":"Logged in");}}/>}
      {toast && <div className="fixed bottom-24 left-1/2 z-[60] -translate-x-1/2 whitespace-nowrap rounded-full border border-lime/20 bg-[#17231e] px-5 py-3 text-xs font-bold shadow-2xl lg:bottom-8"><span className="mr-2 text-lime">?</span>{toast}</div>}
    </div>
  );
}

function Brand({ compact = false }: { compact?: boolean }) {
  return <BrandLogo compact={compact} />;
}

function initials(name?: string | null) {
  const parts = name?.trim().split(/\s+/).filter(Boolean) ?? [];
  return parts.length ? parts.slice(0, 2).map(part => part[0]).join("").toUpperCase() : "AC";
}

function normalizeTrade(raw: ActiveCopyTrade & { startedAt?: string; remainingTime?: number; status?: string }): CopyTradeHistory {
  return {
    code: raw.code,
    amount: Number(raw.amount ?? 0),
    returnPercent: Number(raw.returnPercent ?? 0),
    profit: Number(raw.profit ?? 0),
    remainingTime: Number(raw.remainingTime ?? 0),
    status: raw.status ?? "Completed",
    date: raw.date ?? (raw.startedAt ? new Date(raw.startedAt).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) : ""),
  };
}

function NotificationMenu({ close, notifications, unreadCount, markRead }: { close: () => void; notifications: NotificationItem[]; unreadCount: number; markRead: () => void }) {
  return <><button aria-label="Close notifications" onClick={close} className="fixed inset-0 z-30 bg-black/30" /><div className="fixed right-4 top-16 z-40 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-line bg-[#111c18] shadow-2xl"><div className="flex items-center justify-between border-b border-line p-4"><div><p className="font-bold">Notifications</p><p className="mt-1 text-[10px] text-slate-500">{unreadCount ? `${unreadCount} unread` : "All caught up"}</p></div>{unreadCount > 0 && <button onClick={markRead} className="rounded-lg border border-line px-3 py-1.5 text-[10px] font-bold text-lime hover:bg-white/5">Mark read</button>}</div><div className="max-h-[60vh] overflow-y-auto p-2">{notifications.length ? notifications.map(notification => <div key={notification.id} className={`rounded-xl p-3 ${notification.unread ? "bg-lime/[.06]" : "hover:bg-white/[.03]"}`}><div className="flex items-start gap-3"><span className={`mt-1 h-2 w-2 rounded-full ${notification.unread ? "bg-lime" : "bg-slate-700"}`} /><div className="min-w-0 flex-1"><p className="text-sm font-bold text-white">{notification.title}</p><p className="mt-1 text-xs leading-5 text-slate-400">{notification.message}</p><p className="mt-2 text-[10px] text-slate-600">{new Date(notification.createdAt).toLocaleString()}</p></div></div></div>) : <p className="p-8 text-center text-xs text-slate-500">No records available</p>}</div></div></>;
}

function ProfileMenu({ close,notify,user,openLogin,openRegister,logout,openVerification,openHelp }: { close: () => void;notify:(message:string)=>void;user:CurrentUser|null;openLogin:()=>void;openRegister:()=>void;logout:()=>void;openVerification:()=>void;openHelp:()=>void }) {
  const uid=user?.uid?.trim();
  const copyUid=()=>{if(!uid){notify("UID unavailable");return;}navigator.clipboard?.writeText(uid);notify("UID copied");};
  return <><button aria-label="Close menu" onClick={close} className="fixed inset-0 z-30 bg-black/30" /><div className="fixed right-4 top-16 z-40 w-72 rounded-2xl border border-line bg-[#111c18] p-3 shadow-2xl"><div className="border-b border-line p-3"><p className="font-bold">{user?.name?.trim() || "Account"}</p><div className="mt-1 flex items-center gap-2 text-xs text-slate-500"><span>{uid?`UID ${uid}`:"Not logged in"}</span>{uid&&<button onClick={copyUid} aria-label="Copy UID" className="rounded p-1 text-slate-400 hover:bg-white/5 hover:text-lime"><Copy size={13}/></button>}<span>· {user?.vipRank || "Pro"} member</span></div></div>{user?<button onClick={logout} className="mt-2 flex w-full items-center gap-3 rounded-xl p-3 text-sm text-slate-300 hover:bg-white/5"><ShieldCheck size={17}/> Logout</button>:<><button onClick={openLogin} className="mt-2 flex w-full items-center gap-3 rounded-xl p-3 text-sm text-slate-300 hover:bg-white/5"><ShieldCheck size={17}/> Login</button><button onClick={openRegister} className="flex w-full items-center gap-3 rounded-xl p-3 text-sm text-slate-300 hover:bg-white/5"><Users size={17}/> Register</button></>}<button onClick={openVerification} className="flex w-full items-center gap-3 rounded-xl p-3 text-sm text-slate-300 hover:bg-white/5"><ShieldCheck size={17}/> Verification Request</button><button onClick={openHelp} className="flex w-full items-center gap-3 rounded-xl p-3 text-sm text-slate-300 hover:bg-white/5"><Headphones size={17}/> Help Center</button><Link href="/admin" className="flex items-center gap-3 rounded-xl p-3 text-sm text-slate-400 hover:bg-white/5"><Settings size={17} /> Admin console</Link></div></>;
}

function AuthModal({mode,setMode,close,authenticated}:{mode:AuthMode;setMode:(mode:AuthMode)=>void;close:()=>void;authenticated:()=>Promise<void>}) {
  const [name,setName]=useState("");
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");
  const [confirmPassword,setConfirmPassword]=useState("");
  const [country,setCountry]=useState("United States");
  const [referralCode,setReferralCode]=useState("");
  const [error,setError]=useState("");
  const [loading,setLoading]=useState(false);
  const countries=["United States","India","UAE","Bangladesh","Pakistan","Saudi Arabia","Nepal"];
  const register=mode==="register";
  const submit=async()=>{
    setError("");
    setLoading(true);
    try{
      const response=await fetch(register?"/api/auth/register":"/api/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(register?{name,email,password,confirmPassword,country,referralCode}:{email,password})});
      const data=await response.json();
      if(!response.ok)throw new Error(data.error||"Authentication failed");
      await authenticated();
    }catch(err){setError(err instanceof Error?err.message:"Authentication failed");}
    finally{setLoading(false);}
  };
  return <div className="fixed inset-0 z-[90] grid place-items-end bg-black/70 backdrop-blur-sm sm:place-items-center sm:p-4"><div className="w-full max-w-md rounded-t-3xl border border-line bg-[#111c18] p-6 sm:rounded-3xl"><div className="flex items-start justify-between"><div><h3 className="text-xl font-black">{register?"Create account":"Login"}</h3><p className="mt-1 text-xs text-slate-500">{register?"Register with your details":"Access your Voltix account"}</p></div><button onClick={close}><X/></button></div><div className="mt-5 space-y-4">{register&&<FormField label="Full name" value={name} onChange={setName}/>}<FormField label="Email" value={email} onChange={setEmail}/><label className="block text-xs font-bold text-slate-400">Password<input type="password" value={password} onChange={e=>setPassword(e.target.value)} className="mt-2 w-full rounded-xl border border-line bg-ink p-3 text-white outline-none focus:border-lime/50"/></label>{register&&<><label className="block text-xs font-bold text-slate-400">Confirm password<input type="password" value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} className="mt-2 w-full rounded-xl border border-line bg-ink p-3 text-white outline-none focus:border-lime/50"/></label><label className="block text-xs font-bold text-slate-400">Country<select value={country} onChange={e=>setCountry(e.target.value)} className="mt-2 w-full rounded-xl border border-line bg-ink p-3 text-white outline-none">{countries.map(item=><option key={item}>{item}</option>)}</select></label><FormField label="Referral UID" value={referralCode} onChange={setReferralCode} placeholder="Optional"/></>}{error&&<p className="text-xs text-danger">{error}</p>}</div><button disabled={loading} onClick={submit} className="mt-6 w-full rounded-xl bg-lime py-3.5 text-sm font-black text-ink disabled:opacity-60">{loading?"Please wait...":register?"Create account":"Login"}</button><button onClick={()=>{setError("");setMode(register?"login":"register");}} className="mt-3 w-full text-center text-xs font-bold text-lime">{register?"Already have an account? Login":"Create a new account"}</button></div></div>;
}

function HomeScreen({ onNavigate, onOpenCopyTrade, assets, dashboard, balanceVisible, setBalanceVisible, activeCopyTrade, bitexBalance, userCountry }: { onNavigate: (tab: Tab, section?: WalletSection, action?: WalletAction) => void; onOpenCopyTrade: () => void; assets: AppCoin[]; dashboard: DashboardSnapshot | null; balanceVisible: boolean; setBalanceVisible: (v: boolean) => void; activeCopyTrade: ActiveCopyTrade | null; bitexBalance: number; userCountry: string }) {
  const total = dashboard?.summary?.totalPortfolio ?? 0;
  const todaysProfit = dashboard?.summary?.todaysProfit ?? 0;
  const live=useLiveTickers();
  const tickerMap=useMemo(()=>new Map(live.map(ticker=>[ticker.symbol,ticker])),[live]);
  const localCurrency=useMemo(()=>currencyConfigForCountry(userCountry),[userCountry]);
  const marketPulseAssets=useMemo<MarketCoin[]>(()=>homeMarketPulseSymbols.flatMap(symbol=>{
    const coin=assets.find(item=>item.symbol===symbol);
    if(!coin)return [];
    const ticker=tickerMap.get(coin.pair??`${coin.symbol}USDT`);
    return [{...coin,price:ticker?.price??0,change:ticker?.changePercent??0,volume:ticker?.volume,quoteVolume:ticker?.quoteVolume,live:Boolean(ticker?.price)}];
  }),[assets,tickerMap]);
  const shortcuts: { icon: typeof Home; label: string; onClick: () => void }[] = [
    { icon: ArrowDownToLine, label: "Add Fund", onClick: () => onNavigate("wallet", "overview", "deposit") },
    { icon: Send, label: "Transfer", onClick: () => onNavigate("wallet") },
    { icon: Zap, label: "Copy Trade", onClick: onOpenCopyTrade },
    { icon: Users, label: "Team", onClick: () => onNavigate("team") },
  ];
  return <div className="space-y-5">
    <section className="relative overflow-hidden rounded-3xl border border-lime/20 bg-gradient-to-br from-[#172a20] via-[#101d18] to-[#0a120f] p-5 shadow-glow sm:p-7">
      <div className="absolute -right-16 -top-20 h-56 w-56 rounded-full border-[34px] border-lime/[.04]" />
      <div className="relative flex items-start justify-between"><div><div className="flex items-center gap-2 text-xs font-medium text-slate-400">Total portfolio <button onClick={() => setBalanceVisible(!balanceVisible)} className="text-slate-500">{balanceVisible ? "Hide" : "Show"}</button></div><div className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">{balanceVisible ? usd(total) : "$ ••••••"}</div><div className="mt-1 text-sm text-slate-400">{balanceVisible ? inr(total) : "? ••••••"} <span className="ml-2 font-bold text-mint">{usd(todaysProfit)} today</span></div></div><div className="rounded-xl bg-lime/10 p-3 text-lime"><LineChart size={24} /></div></div>
      <div className="relative mt-7 grid grid-cols-4 gap-2">{shortcuts.map(({icon:Icon,label,onClick}) => <button key={label} onClick={onClick} className="flex flex-col items-center gap-2 rounded-xl bg-white/[.045] px-1 py-3 text-xs font-semibold hover:bg-white/[.08]"><Icon size={19} className="text-lime" />{label}</button>)}</div>
    </section>

    <div className="grid gap-5 xl:grid-cols-[1.35fr_.65fr]">
      <div className="space-y-5">
        <section className={card}><div className="flex items-center justify-between px-5 pb-2 pt-5"><div><h2 className="font-bold">Market pulse</h2></div><button onClick={() => onNavigate("markets")} className="text-xs font-bold text-lime">View all</button></div><div className="divide-y divide-line/70">{marketPulseAssets.map(c => <CoinRow key={c.symbol} coin={c} localCurrency={localCurrency} />)}</div></section>
      </div>
      <div className="space-y-5">
        <TradeActiveCard onClick={onOpenCopyTrade} trade={activeCopyTrade} previewAmount={bitexBalance * 0.01} />
        <TopCopyTraders />
      </div>
    </div>
  </div>;
}

function TradeActiveCard({ onClick, trade, previewAmount }: { onClick: () => void; trade: ActiveCopyTrade | null; previewAmount: number }) {
  const code=trade?.code??"Paste code";
  const amount=trade?.amount??previewAmount;
  return <button onClick={onClick} className="relative w-full overflow-hidden rounded-2xl border border-lime/25 bg-lime/[.07] p-5 text-left"><div className="absolute right-0 top-0 h-24 w-24 rounded-full bg-lime/10 blur-2xl"/><div className="relative flex items-center gap-4"><div className="pulse-ring grid h-12 w-12 place-items-center rounded-full bg-lime text-ink"><Zap size={22} fill="currentColor" /></div><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><h3 className="font-bold">Trade Active</h3><span className="rounded-full bg-lime/10 px-2 py-0.5 text-[9px] font-black text-lime">LIVE</span></div><p className="mt-1 text-xs text-slate-400">BTC/USDT · Strategy code {code}</p></div><ChevronRight className="text-slate-500" /></div><div className="relative mt-4 grid grid-cols-2 gap-3"><div><p className="text-[10px] uppercase tracking-widest text-slate-500">Trade amount</p><p className="mt-1 text-lg font-black text-white">${amount.toFixed(2)}</p></div><div className="text-right"><p className="text-[10px] uppercase tracking-widest text-slate-500">Remaining</p><p className="mt-1 text-xl font-black text-lime">{trade?formatRemaining(trade.remainingTime??0):"--:--"}</p></div></div><div className="relative mt-3 h-1.5 overflow-hidden rounded-full bg-black/30"><div className={`h-full rounded-full bg-lime ${trade?"w-[38%]":"w-[8%]"}`} /></div></button>;
}

function formatRemaining(seconds:number) {
  const safe=Math.max(0,Math.floor(seconds));
  return `${String(Math.floor(safe/60)).padStart(2,"0")}:${String(safe%60).padStart(2,"0")}`;
}

function TopCopyTraders() {
  return <section className={`${card} overflow-hidden`}><div className="border-b border-line px-5 py-4"><h2 className="font-bold">Top Copy Traders</h2></div><div className="divide-y divide-line/60">{topCopyTraders.length?topCopyTraders.map((trader,index)=>{const assetIndex=index+1;return <div key={`${trader.country}-${trader.name}`} className="flex items-center gap-2 px-3 py-3 sm:gap-3 sm:px-5"><img src={`/trader-flags/flag-${assetIndex}.png`} alt={`${trader.country} flag`} className="h-5 w-7 shrink-0 rounded object-cover ring-1 ring-white/10 sm:h-6 sm:w-8" /><img src={`/traders/trader-${assetIndex}.png`} alt={`${trader.name} profile`} className="h-9 w-9 shrink-0 rounded-full object-cover ring-1 ring-lime/25 sm:h-10 sm:w-10" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{trader.name}</p><p className="mt-0.5 line-clamp-2 text-[10px] leading-snug text-slate-500">{trader.message}</p></div><div className="w-[42px] shrink-0 text-right sm:w-[54px]"><p className="text-xs font-black text-lime sm:text-sm">+{trader.monthlyReturn}%</p><p className="text-[9px] text-slate-500 sm:text-[10px]">/ month</p></div><img src={`/trader-charts/chart-${assetIndex}.png`} alt={`${trader.name} monthly profit chart`} className="h-[34px] w-[54px] shrink-0 rounded-md border border-line bg-black/20 object-cover" /></div>;}):<div className="px-5 py-10 text-center text-xs text-slate-500">No copy trader records available</div>}</div></section>;
}

function CoinRow({ coin, action, localCurrency=currencyConfigForCountry() }: { coin: AppCoin&{volume?:number;live?:boolean}; action?: () => void; localCurrency?: ReturnType<typeof currencyConfigForCountry> }) {
  const shown = coin.price < .001 ? coin.price.toFixed(8) : coin.price < 1 ? coin.price.toFixed(4) : coin.price.toLocaleString("en-US", { maximumFractionDigits: 2 });
  return <button onClick={action} className="grid w-full grid-cols-[1fr_auto_auto] items-center gap-3 px-5 py-4 text-left hover:bg-white/[.025]"><div className="flex min-w-0 items-center gap-3"><CoinMark symbol={coin.symbol} color={coin.color} logoPath={coin.localLogoPath} /><div><div className="font-bold">{coin.symbol}<span className="ml-1.5 text-[10px] font-normal text-slate-500">/USDT</span></div><p className="mt-1 text-xs text-slate-500">{coin.name}</p><p className="mt-1 text-[9px] text-slate-600">24h vol {coin.live&&coin.volume!==undefined?compact(coin.volume):"--"}</p></div></div><div className="hidden sm:block"><Sparkline data={coin.spark} positive={coin.change >= 0} /></div><div className="min-w-[88px] text-right"><p className="text-sm font-bold">{coin.live?`$${shown}`:"--"}</p>{coin.live&&<p className="mt-1 text-[11px] text-slate-500">{formatLocalCurrency(coin.price, localCurrency)}</p>}<p className={`mt-1 text-xs font-bold ${coin.change >= 0 ? "text-mint" : "text-danger"}`}>{coin.live?`${coin.change >= 0 ? "+" : ""}${coin.change.toFixed(2)}%`:"Live"}</p></div></button>;
}

function MarketsScreen({coins:marketBase,userCountry}:{coins:AppCoin[];userCountry:string}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All");
  const live=useLiveTickers();
  const tickerMap=useMemo(()=>new Map(live.map(ticker=>[ticker.symbol,ticker])),[live]);
  const localCurrency=useMemo(()=>currencyConfigForCountry(userCountry),[userCountry]);
  const marketCoins=useMemo(()=>marketBase.filter(coin=>coin.isActive).map(coin=>{const ticker=tickerMap.get(coin.pair);return {...coin,price:ticker?.price??0,change:ticker?.changePercent??0,volume:ticker?.volume,quoteVolume:ticker?.quoteVolume,live:Boolean(ticker?.price)};}),[marketBase,tickerMap]);
  const list = marketCoins.filter(c => (filter === "Gainers" ? c.change > 2 : filter === "Losers" ? c.change < 0 : true) && `${c.symbol}${c.name}`.toLowerCase().includes(query.toLowerCase()));
  return <div className="space-y-5"><div><h2 className="text-2xl font-black">Markets</h2></div><div className="relative"><Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search coin" className="w-full rounded-2xl border border-line bg-panel py-3.5 pl-11 pr-4 text-sm outline-none focus:border-lime/50" /></div><div className="flex gap-2 overflow-auto no-scrollbar">{["All","Gainers","Losers","Favorites"].map(item=><button key={item} onClick={()=>setFilter(item)} className={`whitespace-nowrap rounded-full px-4 py-2 text-xs font-bold ${filter===item?"bg-lime text-ink":"border border-line bg-panel text-slate-400"}`}>{item}</button>)}</div><section className={`${card} overflow-hidden`}><div className="grid grid-cols-[1fr_auto] border-b border-line px-5 py-3 text-[10px] uppercase tracking-wider text-slate-600 sm:grid-cols-[1fr_84px_auto]"><span>Asset / volume</span><span className="hidden text-center sm:block">24h trend</span><span className="text-right">Price / change</span></div>{list.map(c=><CoinRow key={c.symbol} coin={c} localCurrency={localCurrency} action={()=>{window.location.href=`/markets/${c.pair}`;}}/>)}</section></div>;
}

function TradeWorkspace({category}:{category:TradeCategory}) {
  return <div className="space-y-5"><div><h2 className="text-2xl font-black">Trade</h2></div><TradingCategoryPage category={category==="copy"?"spot":category}/></div>;
}

function AiCopyTradePage({currentUser,subscription,activeTrade,bitexBalance,history,startTrade,completeTrade,purchaseAi,openLogin}:{currentUser:CurrentUser|null;subscription:AiSubscriptionStatus|null;activeTrade:ActiveCopyTrade|null;bitexBalance:number;history:CopyTradeHistory[];startTrade:(code:string)=>Promise<{ok:boolean;message:string}>;completeTrade:()=>void;purchaseAi:()=>Promise<{ok:boolean;message:string}>;openLogin:()=>void}) {
  return <div className="space-y-5"><div><h2 className="text-2xl font-black">AI</h2></div><CandlestickChart/><AiPurchaseCard currentUser={currentUser} status={subscription} purchaseAi={purchaseAi} openLogin={openLogin}/><CopyTradeScreen activeTrade={activeTrade} bitexBalance={bitexBalance} history={history} startTrade={startTrade} completeTrade={completeTrade}/></div>;
}

function AiPurchaseCard({currentUser,status,purchaseAi,openLogin}:{currentUser:CurrentUser|null;status:AiSubscriptionStatus|null;purchaseAi:()=>Promise<{ok:boolean;message:string}>;openLogin:()=>void}) {
  const [error,setError]=useState("");
  const [loading,setLoading]=useState(false);
  const active=Boolean(status?.subscription?.active);
  const price=status?.price ?? 15;
  const validityDays=status?.validityDays ?? 30;
  const expiry=status?.subscription?.expiresAt ? new Date(status.subscription.expiresAt) : null;
  const purchase=async()=>{
    setError("");
    if(!currentUser){
      setError("Login required");
      openLogin();
      return;
    }
    setLoading(true);
    const result=await purchaseAi();
    setLoading(false);
    if(!result.ok)setError(result.message || "AI purchase failed");
  };
  return <section className={`${card} p-4 sm:p-5`}>
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <div className="flex items-center gap-2"><span className="grid h-9 w-9 place-items-center rounded-xl bg-lime/10 text-lime"><Zap size={18}/></span><h3 className="font-bold">AI</h3></div>
        {!currentUser&&<p className="mt-2 text-xs text-slate-500">Login required</p>}
      </div>
    </div>
    <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
      <AiDetail label="Price" value={`${price.toFixed(0)} USDT`} />
      <AiDetail label="Validity" value={`${validityDays} days`} />
      <AiDetail label="Current status" value={active?"Active":"Inactive"} />
      <AiDetail label="Expiry date" value={active&&expiry?formatDate(expiry):"--"} />
    </div>
    {error&&<p className="mt-3 text-xs text-danger">{error}</p>}
    <button onClick={purchase} disabled={loading} className="mt-5 w-full rounded-xl bg-lime py-3 text-xs font-black text-ink disabled:opacity-60 sm:w-auto sm:px-7">{loading?"Please wait...":"Purchase AI"}</button>
  </section>;
}

function AiDetail({label,value}:{label:string;value:string}) {
  return <div className="rounded-xl border border-line bg-ink px-3 py-3"><p className="text-[10px] uppercase tracking-wider text-slate-500">{label}</p><p className="mt-1 text-sm font-black">{value}</p></div>;
}

function formatDate(value:Date) {
  return value.toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"});
}

function TradeMenu({close,select}:{close:()=>void;select:(category:TradeCategory)=>void}) {
  const options: {id:TradeCategory;label:string;description:string;icon:typeof Home}[] = [
    {id:"futures",label:"Futures",description:"Trade perpetual contracts",icon:LineChart},
    {id:"spot",label:"Spot",description:"Buy and sell crypto instantly",icon:CircleDollarSign},
    {id:"grid",label:"Grid",description:"Automated range strategies",icon:Grid2X2},
    {id:"margin",label:"Margin",description:"Leveraged asset trading",icon:Landmark},
    {id:"copy",label:"Copy Trading",description:"Open AI copy strategies",icon:Zap},
  ];
  return <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/75 px-3 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Choose trading category"><button onClick={close} className="absolute inset-0" aria-label="Close trade menu"/><div className="relative w-full max-w-md rounded-[28px] border border-line bg-[#101916] p-4 shadow-2xl"><div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/15"/><div className="mb-4 px-1"><h3 className="text-xl font-black">Choose Trade</h3><p className="mt-1 text-xs text-slate-500">Select a trading category to continue</p></div><div className="space-y-2">{options.map(({id,label,description,icon:Icon})=><button key={id} onClick={()=>select(id)} className="flex w-full items-center gap-4 rounded-2xl border border-line bg-white/[.035] p-3.5 text-left transition hover:border-lime/30 hover:bg-white/[.07]"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-lime/10 text-lime"><Icon size={21}/></span><span className="min-w-0 flex-1"><span className="block text-sm font-black">{label}</span><span className="mt-1 block text-[11px] text-slate-500">{description}</span></span><ChevronRight size={18} className="text-slate-600"/></button>)}</div><button onClick={close} aria-label="Close" className="mx-auto mt-5 grid h-14 w-14 place-items-center rounded-full border border-white/10 bg-white/[.07] text-white shadow-xl"><X size={27}/></button></div></div>;
}

function TradingCategoryPage({category: _category}:{category:Exclude<TradeCategory,"copy">}) {
  const [symbol,setSymbol]=useState("BTCUSDT");
  const pairOptions=coins.filter(coin=>coin.symbol!=="USDT").slice(0,8).map(coin=>`${coin.symbol}USDT`);
  return <div className="space-y-5"><label className="flex w-fit items-center gap-2 rounded-xl border border-line bg-panel px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">Pair<select value={symbol} onChange={event=>setSymbol(event.target.value)} className="bg-transparent text-xs font-black text-white outline-none">{pairOptions.map(pair=><option key={pair} value={pair} className="bg-ink">{pair.replace("USDT","/USDT")}</option>)}</select></label><CandlestickChart symbol={symbol}/><OrderBookPanel symbol={symbol}/><section className={`${card} p-5`}><div className="flex items-center justify-between"><h3 className="font-bold">Order entry</h3><span className="rounded-full bg-white/5 px-3 py-1 text-[10px] font-bold text-slate-400">{symbol.replace("USDT","/USDT")}</span></div><div className="mt-5 grid grid-cols-2 gap-3"><button className="rounded-xl bg-mint py-3 text-xs font-black text-ink">Buy</button><button className="rounded-xl bg-danger py-3 text-xs font-black text-white">Sell</button></div></section></div>;
}

function CopyTradeScreen({activeTrade,bitexBalance,history,startTrade,completeTrade}:{activeTrade:ActiveCopyTrade|null;bitexBalance:number;history:CopyTradeHistory[];startTrade:(code:string)=>Promise<{ok:boolean;message:string}>;completeTrade:()=>void}) {
  const [code,setCode]=useState(""); const [error,setError]=useState("");
  const nextStake=bitexBalance*.01;
  const start=async()=>{ if(!/^[A-Z0-9]{6}$/.test(code.toUpperCase())) { setError("Enter a valid 6-character code"); return; } const result=await startTrade(code); if(!result.ok){setError(result.message);return;} setError(""); setCode(""); };
  return <div className="space-y-5"><section className={`${card} p-4 sm:p-5`}><div className="flex items-center justify-between"><label htmlFor="copy-trade-code" className="text-[11px] lowercase text-slate-500">paste copy trade code</label><ShieldCheck size={20} className="text-lime"/></div>{activeTrade?<div className="mt-4"><TradeActiveCard onClick={()=>{}} trade={activeTrade} previewAmount={activeTrade.amount}/></div>:<div className="mt-3"><div className={`flex items-center overflow-hidden rounded-xl border bg-ink ${error?"border-danger/60":"border-line focus-within:border-lime/50"}`}><input id="copy-trade-code" maxLength={6} value={code} onChange={e=>setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,""))} placeholder="paste copy trade code" className="min-w-0 flex-1 bg-transparent px-4 py-3 text-xs text-slate-200 outline-none placeholder:text-slate-600"/><button onClick={start} className="m-1 rounded-lg bg-lime px-5 py-2.5 text-xs font-black text-ink">Verify</button></div>{error&&<p className="mt-2 text-xs text-danger">{error}</p>}</div>}</section>
    <section className={`${card} overflow-hidden`}><div className="border-b border-line px-5 py-4"><h3 className="font-bold">Previous Copy Trade History</h3></div><div className="divide-y divide-line/70">{history.map(item=><div key={`${item.code}-${item.date}`} className="grid grid-cols-[auto_1fr_auto] gap-3 px-4 py-4 sm:px-5"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-lime/10 text-lime"><LineChart size={18}/></div><div className="min-w-0"><div className="flex items-center gap-2"><p className="text-sm font-black tracking-wider">{item.code}</p><span className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${item.status==="Credited"?"bg-mint/10 text-mint":"bg-white/5 text-slate-400"}`}>{item.status}</span></div><p className="mt-1 text-[10px] text-slate-500">Trade amount: ${item.amount.toFixed(2)} · Return: {item.returnPercent}%</p><p className="mt-1 truncate text-[10px] text-slate-500">{item.date}</p></div><p className="shrink-0 text-sm font-black text-mint">+${item.profit.toFixed(4)}</p></div>)}</div></section>
  </div>;
}

function WalletScreen({notify,assets,futuresBalance,bitexBalance,bitexIncomeEarned,bitexTarget,activity,section,action,onSectionChange,onOpenTransfer,onOpenWithdrawal,onOpenDeposit,onCloseAction,onCreateDeposit}:{notify:(s:string)=>void;assets:AppCoin[];futuresBalance:number;bitexBalance:number;bitexIncomeEarned:number;bitexTarget:number;activity:WalletActivity[];section:WalletSection;action:WalletAction;onSectionChange:(section:WalletSection)=>void;onOpenTransfer:()=>void;onOpenWithdrawal:()=>void;onOpenDeposit:()=>void;onCloseAction:()=>void;onCreateDeposit:(input:DepositInput)=>Promise<{ok:boolean;message:string}>}) {
 const live=useLiveTickers(); const tickerMap=useMemo(()=>new Map(live.map(ticker=>[ticker.symbol,ticker])),[live]); const activeAssets=useMemo(()=>assets.filter(coin=>coin.isActive).map(coin=>{const ticker=tickerMap.get(coin.pair);return ticker?{...coin,price:ticker.price,change:ticker.changePercent}:coin;}),[assets,tickerMap]); const spotBalance=assets.find(c=>c.symbol==="USDT")?.balance??0; const spotAssetsValue=activeAssets.reduce((sum,c)=>sum+c.price*c.balance,0); const total=spotAssetsValue+futuresBalance+bitexBalance;
return <div className="space-y-5"><div><h2 className="text-2xl font-black">Asset</h2></div><div className="flex gap-1 overflow-x-auto rounded-xl border border-line bg-panel p-1 no-scrollbar">{(["overview","assets","ledger"] as const).map(item=><button key={item} onClick={()=>onSectionChange(item)} aria-current={section===item?"page":undefined} className={`min-w-[76px] flex-1 rounded-lg px-3 py-2.5 text-xs font-bold capitalize ${section===item?"bg-lime text-ink":"text-slate-500 hover:text-white"}`}>{item}</button>)}</div>
 {section==="overview"&&<><section className="rounded-2xl border border-lime/20 bg-gradient-to-br from-[#193024] to-panel px-3 py-3 sm:p-5"><p className="text-[11px] text-slate-400">Est. Total Value</p><h3 className="mt-1 text-2xl font-black sm:text-3xl">{total.toFixed(2)} USDT</h3><p className="mt-0.5 text-xs text-slate-400">{inr(total)}</p><div className="mt-3 flex w-full gap-[6px]"><button onClick={onOpenDeposit} className="flex h-9 min-w-0 flex-1 items-center justify-center gap-1 whitespace-nowrap rounded-[10px] bg-lime px-2 py-1 text-[11px] font-black leading-none text-ink"><Plus size={12}/>Add Funds</button><button onClick={onOpenWithdrawal} className="flex h-9 min-w-0 flex-1 items-center justify-center gap-1 whitespace-nowrap rounded-[10px] border border-line bg-white/5 px-2 py-1 text-[11px] font-bold leading-none"><Send size={12} className="text-lime"/>Send</button><button onClick={onOpenTransfer} className="flex h-9 min-w-0 flex-1 items-center justify-center gap-1 whitespace-nowrap rounded-[10px] border border-line bg-white/5 px-2 py-1 text-[11px] font-bold leading-none"><ArrowLeftRight size={12} className="text-lime"/>Transfer</button></div></section><section className={`${card} divide-y divide-line/70 overflow-hidden`}><WalletBalanceRow label="Spot Wallet" balance={spotBalance}/><WalletBalanceRow label="Futures Wallet" balance={futuresBalance}/><WalletBalanceRow label="AI Wallet" balance={bitexBalance}/></section><section className={`${card} p-5`}><div className="flex justify-between"><h3 className="font-bold">Recent activity</h3><button onClick={()=>onSectionChange("ledger")} className="text-xs text-lime">Full ledger</button></div><ActivityRows rows={activity.slice(0,3)}/></section></>}
 {section==="assets"&&<section className={`${card} overflow-hidden`}><div className="flex items-center justify-between border-b border-line p-5"><h3 className="font-bold">Your assets</h3><span className="text-xs text-slate-500">{activeAssets.length} coins</span></div>{activeAssets.length?activeAssets.map(c=><div key={c.symbol} className="flex items-center gap-3 border-b border-line/60 px-5 py-4 last:border-0"><CoinMark symbol={c.symbol} color={c.color} logoPath={c.localLogoPath}/><div className="flex-1"><p className="font-bold">{c.symbol}</p><p className="text-xs text-slate-500">{c.name}</p></div><div className="text-right"><p className="text-sm font-bold">{compact(c.balance)}</p><p className="mt-1 text-xs text-slate-500">{usd(c.balance*c.price)} · {inr(c.balance*c.price)}</p></div></div>):<p className="px-5 py-10 text-center text-xs text-slate-500">No records available</p>}</section>}
 {section==="ledger"&&<section className={`${card} p-5`}><div className="flex justify-between"><div><h3 className="font-bold">Wallet ledger</h3><p className="mt-1 text-xs text-slate-500">All balance movements and AI income credits</p></div><button onClick={()=>notify("Ledger export prepared")} className="text-xs text-lime">Export</button></div><ActivityRows rows={activity}/></section>}{action==="deposit"&&<DepositModal close={onCloseAction} notify={notify} createDeposit={onCreateDeposit}/>}</div>;
}

function WalletBalanceRow({label,balance}:{label:string;balance:number}) { return <div className="flex items-center justify-between gap-4 px-4 py-4 sm:px-5"><p className="text-sm font-bold">{label}</p><p className="text-sm font-black">{balance.toFixed(2)} USDT</p></div> }

function ActivityRows({rows}:{rows:readonly WalletActivity[]}) { return <div className="mt-4 space-y-4">{rows.length?rows.map(([I,t,a,s],index)=><div className="flex items-center gap-3" key={`${t}-${a}-${index}`}><div className="rounded-xl bg-white/5 p-2.5 text-slate-400"><I size={17}/></div><div className="flex-1"><p className="text-sm font-semibold">{t}</p><p className="text-[10px] text-mint">{s}</p></div><p className="text-xs font-bold">{a}</p></div>):<p className="py-6 text-center text-xs text-slate-500">No records available</p>}</div> }

function DepositModal({close,notify,createDeposit}:{close:()=>void;notify:(s:string)=>void;createDeposit:(input:DepositInput)=>Promise<{ok:boolean;message:string}>}) { const addr=""; const [amount,setAmount]=useState(""); const [network,setNetwork]=useState("BSC"); const [txHash,setTxHash]=useState(""); const [error,setError]=useState(""); const [submitting,setSubmitting]=useState(false); const copyAddress=()=>{if(!addr){notify("Deposit address unavailable");return;}navigator.clipboard?.writeText(addr);notify("Address copied");}; const value=Number(amount); const submit=async()=>{if(value<=0){setError("Enter a valid deposit amount");return;}setSubmitting(true);const result=await createDeposit({amount:value,network,txHash});setSubmitting(false);if(!result.ok)setError(result.message||"Deposit request failed");}; return <div className="fixed inset-0 z-[70] grid place-items-end bg-black/70 p-0 backdrop-blur-sm sm:place-items-center sm:p-4"><div className="w-full max-w-md rounded-t-3xl border border-line bg-[#111c18] p-6 sm:rounded-3xl"><div className="flex justify-between"><div><h3 className="text-xl font-black">Deposit to Main/Spot wallet</h3><p className="mt-1 text-xs text-slate-500">Send only USDT on BNB Smart Chain</p></div><button onClick={close}><X/></button></div><div className="mx-auto my-6 grid h-44 w-44 place-items-center rounded-2xl bg-white p-3"><div className="grid h-full w-full grid-cols-5 gap-1 bg-ink p-2">{Array.from({length:25}).map((_,i)=><i key={i} className={`${[0,1,2,5,7,10,11,12,14,17,20,22,23,24].includes(i)?"bg-white":"bg-ink"}`}/>)}</div></div><p className="text-center text-[10px] uppercase tracking-widest text-slate-500">Your unique deposit address</p><button onClick={copyAddress} className="mt-3 flex w-full items-center gap-3 rounded-xl border border-line bg-ink p-3 text-left"><span className="min-w-0 flex-1 break-all text-xs text-slate-300">{addr || "Deposit address unavailable"}</span><Copy size={16} className="shrink-0 text-lime"/></button><label className="mt-4 block text-xs font-bold text-slate-400">Amount<input inputMode="decimal" value={amount} onChange={e=>{setAmount(e.target.value);setError("");}} placeholder="0.00" className="mt-2 w-full rounded-xl border border-line bg-ink px-4 py-3 text-white outline-none focus:border-lime/50"/></label><label className="mt-4 block text-xs font-bold text-slate-400">Network<select value={network} onChange={e=>setNetwork(e.target.value)} className="mt-2 w-full rounded-xl border border-line bg-ink p-3 text-white"><option value="BSC">BNB Smart Chain (BEP20)</option><option value="TRON">TRON (TRC20)</option><option value="ETH">Ethereum (ERC20)</option></select></label><label className="mt-4 block text-xs font-bold text-slate-400">Tx hash optional<input value={txHash} onChange={e=>{setTxHash(e.target.value);setError("");}} placeholder="Transaction hash" className="mt-2 w-full rounded-xl border border-line bg-ink px-4 py-3 text-white outline-none focus:border-lime/50"/></label>{error&&<p className="mt-2 text-xs text-danger">{error}</p>}<div className="mt-4 rounded-xl bg-[#2a2412] p-3 text-[11px] leading-5 text-[#c9b98d]">Minimum deposit: 10 USDT. After 12 network confirmations, funds are credited only to the Main/Spot wallet.</div><button onClick={submit} disabled={submitting} className="mt-5 w-full rounded-xl bg-lime py-3.5 text-xs font-black text-ink disabled:opacity-60">{submitting?"Submitting...":"Submit Deposit Request"}</button></div></div> }

function TeamScreen({notify,currentUser}:{notify:(s:string)=>void;currentUser:CurrentUser|null}) {
  const [shareOpen,setShareOpen]=useState(false);
  const [team,setTeam]=useState<TeamSnapshot | null>(null);
  useEffect(()=>{
    let active=true;
    if(!currentUser){
      setTeam(null);
      return;
    }
    fetch("/api/team")
      .then(response=>response.ok?response.json():Promise.reject())
      .then(data=>{if(active)setTeam(data?.authenticated?data.team:null);})
      .catch(()=>{if(active)setTeam(null);});
    return()=>{active=false;};
  },[currentUser]);
  const stats=team?.stats ?? {};
  const members=team?.members ?? [];
  const referralLink=team?.referralLink ?? "";
  const qualifiedDirects=members.filter(member=>member.level===1&&member.packageAmount>=50).length;
  const progress=Math.min(100,(qualifiedDirects/5)*100);
  const copyReferral=()=>{if(!referralLink){notify("Referral link unavailable");return;}navigator.clipboard?.writeText(referralLink);notify("Referral link copied");};
  return <div className="space-y-5"><div><h2 className="text-2xl font-black">My Network</h2><p className="mt-1 text-sm text-slate-500">Grow your team and unlock rewards</p></div><section className="rounded-2xl border border-lime/20 bg-gradient-to-br from-[#18291f] to-panel px-4 py-3"><div className="flex min-w-0 items-center gap-3"><div className="min-w-0 flex-1"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Referral Link</p><p className="mt-1 truncate text-xs font-bold text-white sm:text-sm">{referralLink || "Referral link unavailable"}</p></div><div className="flex shrink-0 items-center gap-2"><button onClick={copyReferral} aria-label="Copy referral link" className="grid h-9 w-9 place-items-center rounded-xl bg-lime text-ink"><Copy size={15}/></button><button onClick={()=>referralLink&&setShareOpen(true)} aria-label="Share referral link" className="grid h-9 w-9 place-items-center rounded-xl border border-line bg-white/5 text-lime"><Share2 size={15}/></button></div></div></section><div className="grid grid-cols-2 gap-3 sm:grid-cols-4"><Stat label="Direct team" value={String(stats.directTeamCount ?? 0)} /><Stat label="Total network" value={String(stats.totalNetworkCount ?? 0)} /><Stat label="Active" value={String(stats.activeUsersCount ?? 0)} /><Stat label="Team volume" value={usd(stats.teamVolume ?? 0)} /></div><section className={`${card} p-5`}><div className="flex items-center justify-between"><h3 className="font-bold">Extra trade goal</h3><span className="text-xs font-bold text-[#f6c85f]">{qualifiedDirects} / 5</span></div><p className="mt-2 text-xs text-slate-500">Qualified directs with a $50+ active package</p><div className="mt-4 h-2 rounded-full bg-ink"><div className="h-full rounded-full bg-gradient-to-r from-[#f6c85f] to-lime" style={{width:`${progress}%`}}/></div></section><section className={`${card} overflow-hidden`}><div className="flex items-center justify-between border-b border-line p-5"><div><h3 className="font-bold">Team members</h3><p className="mt-1 text-xs text-slate-500">Across all levels</p></div><button className="flex items-center gap-1 text-xs text-slate-400">All levels <ChevronDown size={14}/></button></div>{members.length?members.map((m,i)=><div key={m.id} className="flex items-center gap-3 border-b border-line/60 p-4 last:border-0"><div className={`grid h-10 w-10 place-items-center rounded-full text-xs font-black ${i<3?"bg-lime/10 text-lime":"bg-white/5 text-slate-400"}`}>{m.initials}</div><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><p className="truncate text-sm font-bold">{m.name}</p><span className="rounded bg-white/5 px-1.5 py-0.5 text-[9px] text-slate-500">L{m.level}</span></div><p className="mt-1 text-[10px] text-slate-500">Joined {joinedLabel(m.joinedAt)}</p></div><div className="text-right"><p className="text-xs font-bold">{usd(m.packageAmount)}</p><p className="mt-1 text-[10px] text-mint">• {m.status}</p></div></div>):<div className="p-5 text-xs text-slate-500">No team members yet</div>}</section>{shareOpen&&referralLink&&<ReferralShareSheet link={referralLink} close={()=>setShareOpen(false)} copied={()=>{copyReferral();setShareOpen(false);}}/>}</div>
}

function joinedLabel(value:string) {
  const joined=new Date(value);
  if(Number.isNaN(joined.getTime())) return "recently";
  return joined.toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"});
}

function ReferralShareSheet({link,close,copied}:{link:string;close:()=>void;copied:()=>void}) {
  const url=/^https?:\/\//.test(link)?link:`https://${link}`;
  const encoded=encodeURIComponent(url);
  const openShare=(target:string)=>{window.open(target,"_blank","noopener,noreferrer");close();};
  return <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/70 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Share referral link"><button className="absolute inset-0" onClick={close} aria-label="Close share sheet"/><div className="relative w-full max-w-md rounded-t-3xl border border-line bg-[#101916] px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 shadow-2xl"><div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/15"/><button onClick={close} aria-label="Close" className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-full bg-white/5 text-slate-400"><X size={16}/></button><div className="grid grid-cols-5 gap-3 pr-10"><ShareLogo label="WhatsApp" className="bg-[#25D366] text-ink" onClick={()=>openShare(`https://wa.me/?text=${encoded}`)}>W</ShareLogo><ShareLogo label="Telegram" className="bg-[#229ED9] text-white" onClick={()=>openShare(`https://t.me/share/url?url=${encoded}`)}>T</ShareLogo><ShareLogo label="Facebook" className="bg-[#1877F2] text-white" onClick={()=>openShare(`https://www.facebook.com/sharer/sharer.php?u=${encoded}`)}>f</ShareLogo><ShareLogo label="X/Twitter" className="bg-white text-ink" onClick={()=>openShare(`https://twitter.com/intent/tweet?url=${encoded}`)}>X</ShareLogo><button onClick={copied} aria-label="Copy Link" className="grid h-11 w-11 place-items-center rounded-full border border-line bg-white/5 text-lime"><Copy size={17}/></button></div></div></div>;
}

function ShareLogo({label,className,onClick,children}:{label:string;className:string;onClick:()=>void;children:React.ReactNode}) { return <button onClick={onClick} aria-label={label} className={`grid h-11 w-11 place-items-center rounded-full text-sm font-black ${className}`}>{children}</button> }

function WalletTransferModal({initialFrom,initialTo,balances,close,transfer}:{initialFrom:UserWallet;initialTo:UserWallet;balances:Record<UserWallet,number>;close:()=>void;transfer:(from:UserWallet,to:UserWallet,amount:number)=>Promise<boolean>}) {
  const sourceWallets:UserWallet[]=["SPOT","FUTURES"];
  const transferWallets:UserWallet[]=["SPOT","FUTURES","BITEX"];
  const [from,setFrom]=useState<UserWallet>(sourceWallets.includes(initialFrom)?initialFrom:"SPOT");
  const [to,setTo]=useState<UserWallet>(initialTo==="BITEX"||initialTo!==from?initialTo:"FUTURES");
  const [amount,setAmount]=useState("");
  const [error,setError]=useState("");
  const [confirming,setConfirming]=useState(false);
  const destinations=transferWallets.filter(wallet=>wallet!==from);
  const value=Number(amount)||0;
  const label=(wallet:UserWallet)=>wallet==="BITEX"?"AI Wallet":`${wallet[0]}${wallet.slice(1).toLowerCase()} Wallet`;
  const resetReview=()=>{setConfirming(false);setError("");};
  const changeFrom=(wallet:UserWallet)=>{setFrom(wallet);if(wallet===to)setTo(transferWallets.find(item=>item!==wallet)!);resetReview();};
  const changeTo=(wallet:UserWallet)=>{setTo(wallet);resetReview();};
  const swap=()=>{if(to==="BITEX")return;const nextFrom=to;setTo(from);setFrom(nextFrom);resetReview();};
  const review=()=>{if(value<=0){setError("Enter a valid amount");return;}if(value>balances[from]){setError(`Insufficient ${from} balance`);return;}setConfirming(true);};
  const continueTransfer=async()=>{if(!await transfer(from,to,value)){setConfirming(false);setError("Transfer could not be completed");}};
  return <div className="fixed inset-0 z-[70] bg-[#0a120f] sm:grid sm:place-items-center sm:bg-black/70 sm:p-4 sm:backdrop-blur-sm"><div className="flex min-h-full w-full flex-col bg-[#111c18] sm:min-h-0 sm:max-w-md sm:rounded-3xl sm:border sm:border-line"><header className="flex items-center justify-between border-b border-line px-5 py-4"><h3 className="text-xl font-black">Transfer</h3><button onClick={close} aria-label="Close transfer"><X/></button></header>{confirming?<><div className="flex-1 space-y-5 overflow-y-auto px-5 py-5 pb-28"><section className="rounded-xl border border-line bg-ink/60 p-4 text-xs leading-5 text-slate-400"><p>Review this transfer before continuing. AI funds cannot be transferred back to Spot or Futures.</p></section><div className="space-y-2 rounded-xl border border-line bg-ink/60 p-4"><LineItem label="Transfer amount" value={`${value.toFixed(2)} USDT`}/><LineItem label="Receivable amount" value={`${value.toFixed(2)} USDT`}/></div></div><div className="fixed inset-x-0 bottom-0 grid grid-cols-2 gap-3 border-t border-line bg-[#111c18] p-4 sm:static sm:rounded-b-3xl"><button onClick={()=>setConfirming(false)} className="rounded-xl border border-line py-4 text-sm font-black text-slate-300">Cancel</button><button onClick={continueTransfer} className="rounded-xl bg-lime py-4 text-sm font-black text-ink">Continue</button></div></>:<><div className="flex-1 space-y-5 overflow-y-auto px-5 py-5 pb-28"><section className="relative rounded-2xl border border-line bg-ink/60 p-4"><label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">From<select value={from} onChange={e=>changeFrom(e.target.value as UserWallet)} className="mt-2 w-full bg-transparent text-base font-bold text-white outline-none">{sourceWallets.map(wallet=><option key={wallet} value={wallet} className="bg-ink">{label(wallet)}</option>)}</select></label><div className="my-4 border-t border-line"/><label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">To<select value={to} onChange={e=>changeTo(e.target.value as UserWallet)} className="mt-2 w-full bg-transparent text-base font-bold text-white outline-none">{destinations.map(wallet=><option key={wallet} value={wallet} className="bg-ink">{label(wallet)}</option>)}</select></label><button onClick={swap} disabled={to==="BITEX"} className="absolute right-5 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full border border-line bg-panel text-lime disabled:opacity-30" aria-label="Swap wallets"><ArrowLeftRight size={18} className="rotate-90"/></button></section><label className="block text-xs font-bold text-slate-400">Coin<select className="mt-2 w-full rounded-xl border border-line bg-ink p-4 text-sm font-bold text-white"><option>USDT</option></select></label><div><div className="flex items-center justify-between"><label className="text-xs font-bold text-slate-400">Amount</label><span className="text-[11px] text-slate-500">Available {balances[from].toFixed(2)} USDT</span></div><div className={`mt-2 flex items-center rounded-xl border bg-ink ${error?"border-danger/60":"border-line focus-within:border-lime/50"}`}><input inputMode="decimal" value={amount} onChange={e=>{setAmount(e.target.value);resetReview();}} placeholder="0.00" className="min-w-0 flex-1 bg-transparent px-4 py-4 text-lg font-bold outline-none"/><button onClick={()=>{setAmount(balances[from].toFixed(2));resetReview();}} className="px-4 text-xs font-black text-lime">MAX</button><span className="pr-4 text-xs text-slate-500">USDT</span></div>{error&&<p className="mt-2 text-xs text-danger">{error}</p>}</div></div><div className="fixed inset-x-0 bottom-0 border-t border-line bg-[#111c18] p-4 sm:static sm:rounded-b-3xl"><button onClick={review} className="w-full rounded-xl bg-lime py-4 text-sm font-black text-ink">Confirm Transfer</button></div></>}</div></div>
}

function WithdrawalModal({balances,bitexUnlocked,close,withdraw}:{balances:Record<"SPOT"|"BITEX",number>;bitexUnlocked:boolean;close:()=>void;withdraw:(input:WithdrawalInput)=>Promise<{ok:boolean;message:string}>}) {
  const [walletType,setWalletType]=useState<"SPOT"|"BITEX">("SPOT");
  const [address,setAddress]=useState("");
  const [network,setNetwork]=useState("BSC");
  const [amount,setAmount]=useState("");
  const [error,setError]=useState("");
  const value=Number(amount)||0;
  const available=balances[walletType];
  const fixedFee=walletType==="SPOT"&&value>0?2:0;
  const percentageFee=walletType==="SPOT"?value*.05:0;
  const totalFee=fixedFee+percentageFee;
  const received=Math.max(0,value-totalFee);
  const locked=walletType==="BITEX"&&!bitexUnlocked;
  const label=(wallet:"SPOT"|"BITEX")=>wallet==="BITEX"?"AI":"Spot";
  const submit=async()=>{if(locked){setError("AI withdrawal will unlock after completing 2x copy trade income.");return;}if(!address.trim()){setError("Enter an external wallet or exchange address");return;}if(value<=0){setError("Enter a valid withdrawal amount");return;}if(value>available){setError(`Insufficient ${label(walletType)} wallet balance`);return;}if(received<=0){setError("Withdrawal amount must exceed the total fee");return;}const result=await withdraw({walletType,amount:value,address,network});if(!result.ok)setError(result.message||"Withdrawal request failed");};
  return <div className="fixed inset-0 z-[70] grid place-items-end bg-black/70 backdrop-blur-sm sm:place-items-center sm:p-4"><div className="w-full max-w-md rounded-t-3xl border border-line bg-[#111c18] p-6 sm:rounded-3xl"><div className="flex items-start justify-between"><div><h3 className="text-xl font-black">Send</h3><p className="mt-1 text-xs text-slate-500">Withdrawals are manual after balance validation.</p></div><button onClick={close} aria-label="Close withdrawal"><X/></button></div><label className="mt-5 block text-xs font-bold text-slate-400">Wallet<select value={walletType} onChange={e=>{setWalletType(e.target.value as "SPOT"|"BITEX");setError("");}} className="mt-2 w-full rounded-xl border border-line bg-ink p-3 text-white"><option value="SPOT">Spot Wallet</option><option value="BITEX">AI Wallet</option></select></label>{locked&&<div className="mt-3 rounded-xl border border-[#624e1a] bg-[#2a2412] p-3 text-xs leading-5 text-[#c9b98d]">AI withdrawal will unlock after completing 2x copy trade income.</div>}<label className="mt-4 block text-xs font-bold text-slate-400">Amount</label><div className={`mt-2 flex items-center rounded-xl border bg-ink ${error?"border-danger/60":"border-line"}`}><input inputMode="decimal" value={amount} onChange={e=>{setAmount(e.target.value);setError("");}} placeholder="0.00" className="min-w-0 flex-1 bg-transparent px-4 py-3.5 outline-none"/><button onClick={()=>setAmount(available.toFixed(2))} className="px-4 text-xs font-black text-lime">MAX</button><span className="pr-4 text-xs text-slate-500">USDT</span></div><p className="mt-1 text-[10px] text-slate-500">Available: {available.toFixed(2)} USDT</p><label className="mt-4 block text-xs font-bold text-slate-400">External wallet or exchange address<input value={address} onChange={e=>{setAddress(e.target.value);setError("");}} placeholder="0x... or exchange deposit address" className="mt-2 w-full rounded-xl border border-line bg-ink px-4 py-3 text-white outline-none focus:border-lime/50"/></label><label className="mt-4 block text-xs font-bold text-slate-400">Network<select value={network} onChange={e=>setNetwork(e.target.value)} className="mt-2 w-full rounded-xl border border-line bg-ink p-3 text-white"><option value="BSC">BNB Smart Chain (BEP20)</option><option value="TRON">TRON (TRC20)</option><option value="ETH">Ethereum (ERC20)</option></select></label>{error&&<p className="mt-2 text-xs text-danger">{error}</p>}<div className="mt-4 space-y-2 rounded-xl border border-line bg-ink/60 p-4"><LineItem label="Wallet" value={`${label(walletType)} Wallet`}/><LineItem label="Amount" value={`${value.toFixed(2)} USDT`}/>{walletType==="SPOT"&&<><LineItem label="Fixed fee" value={`${fixedFee.toFixed(2)} USDT`}/><LineItem label="5% fee" value={`${percentageFee.toFixed(2)} USDT`}/></>}<LineItem label="Total fee" value={`${totalFee.toFixed(2)} USDT`}/><LineItem label="Receivable amount" value={`${received.toFixed(2)} USDT`}/><LineItem label="Status" value="Pending admin approval"/></div><button onClick={submit} className="mt-5 w-full rounded-xl bg-lime py-3.5 text-xs font-black text-ink">Confirm Send</button></div></div>
}

function VerificationRequestModal({close,notify,user}:{close:()=>void;notify:(message:string)=>void;user:CurrentUser|null}) {
  const [name,setName]=useState(user?.name?.trim() ?? "");
  const [documentType,setDocumentType]=useState("Aadhaar Card");
  const [documentNumber,setDocumentNumber]=useState("");
  const [documentImagePath,setDocumentImagePath]=useState("");
  const [kyc,setKyc]=useState<KycSnapshot|null>(null);
  const [error,setError]=useState("");
  const [loading,setLoading]=useState(false);
  useEffect(()=>{let active=true;if(!user){setKyc(null);return;}fetch("/api/kyc").then(response=>response.ok?response.json():Promise.reject()).then(data=>{if(active)setKyc(data as KycSnapshot);}).catch(()=>{if(active)setKyc(null);});return()=>{active=false};},[user]);
  const submit=async()=>{setError("");if(!user){setError("Login required");notify("Login required");return;}if(!name.trim()||!documentNumber.trim()){setError("Complete all verification fields");return;}setLoading(true);const response=await fetch("/api/kyc",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name,documentType,documentNumber,documentImagePath})});const data=await response.json().catch(()=>({}));setLoading(false);if(!response.ok){setError(data.error||"Verification request failed");return;}notify("Verification request submitted");close();};
  return <div className="fixed inset-0 z-[80] grid place-items-end bg-black/70 backdrop-blur-sm sm:place-items-center sm:p-4"><div className="w-full max-w-md rounded-t-3xl border border-line bg-[#111c18] p-6 sm:rounded-3xl"><div className="flex items-start justify-between"><div><h3 className="text-xl font-black">Verification Request</h3><p className="mt-1 text-xs text-slate-500">Submit identity details for review.</p></div><button onClick={close}><X/></button></div>{kyc&&<div className="mt-4 rounded-xl border border-line bg-ink/70 p-3 text-xs text-slate-400">Status: <span className="font-bold text-lime">{kyc.status}</span>{kyc.request?.rejectionReason&&<span> · {kyc.request.rejectionReason}</span>}</div>}<div className="mt-5 space-y-4"><FormField label="Full name" value={name} onChange={setName}/><label className="block text-xs font-bold text-slate-400">UID<input value={user?.uid?.trim() || "Unavailable"} readOnly className="mt-2 w-full rounded-xl border border-line bg-ink/70 p-3 text-slate-500 outline-none"/></label><label className="block text-xs font-bold text-slate-400">Document type<select value={documentType} onChange={e=>setDocumentType(e.target.value)} className="mt-2 w-full rounded-xl border border-line bg-ink p-3 text-white"><option>Aadhaar Card</option><option>PAN Card</option><option>Passport</option><option>Driving License</option></select></label><FormField label="Document number" value={documentNumber} onChange={setDocumentNumber} placeholder="Enter document number"/><label className="block text-xs font-bold text-slate-400">Upload document/image<span className="mt-2 flex cursor-pointer items-center justify-center rounded-xl border border-dashed border-line bg-ink/60 px-4 py-6 text-xs font-normal text-slate-500 hover:border-lime/40"><input type="file" accept="image/*,.pdf" className="hidden" onChange={e=>setDocumentImagePath(e.target.files?.[0]?.name??"")}/>{documentImagePath||"Choose image or PDF"}</span></label></div>{error&&<p className="mt-3 text-xs text-danger">{error}</p>}<button onClick={submit} disabled={loading} className="mt-6 w-full rounded-xl bg-lime py-3.5 text-sm font-black text-ink disabled:opacity-60">{loading?"Submitting...":"Submit request"}</button></div></div>;
}

function HelpCenterModal({close,notify}:{close:()=>void;notify:(message:string)=>void}) {
  const [messages,setMessages]=useState<{from:"user"|"ai";text:string}[]>([{from:"ai",text:"Hi. How can I help with deposits, transfers, copy trade, or verification?"}]);
  const [input,setInput]=useState("");
  const [tickets,setTickets]=useState<SupportTicket[]>([]);
  const [ticketOpen,setTicketOpen]=useState(false);
  const refreshTickets=()=>fetch("/api/support").then(response=>response.ok?response.json():Promise.reject()).then(data=>setTickets(Array.isArray(data.tickets)?data.tickets:[])).catch(()=>setTickets([]));
  useEffect(()=>{refreshTickets();},[]);
  const sendMessage=(text=input)=>{const clean=text.trim();if(!clean)return;setMessages(current=>[...current,{from:"user",text:clean},{from:"ai",text:"Raise a support ticket below if you need account review."}]);setInput("");};
  return <div className="fixed inset-0 z-[80] grid place-items-end bg-black/70 backdrop-blur-sm sm:place-items-center sm:p-4"><div className="flex h-[85vh] w-full max-w-md flex-col rounded-t-3xl border border-line bg-[#111c18] sm:rounded-3xl"><header className="flex items-center justify-between border-b border-line p-5"><div><h3 className="text-xl font-black">Help Center</h3><p className="mt-1 text-xs text-lime">AI assistant online</p></div><button onClick={close}><X/></button></header>{ticketOpen?<SupportTicketForm close={()=>setTicketOpen(false)} submitted={()=>{notify("Support ticket submitted");refreshTickets();setTicketOpen(false);}}/>:<><div className="border-b border-line p-3"><p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">Common help topics</p><div className="flex gap-2 overflow-x-auto no-scrollbar">{["Deposit pending","Transfer fee","Copy trade","Verification"].map(topic=><button key={topic} onClick={()=>sendMessage(topic)} className="whitespace-nowrap rounded-full border border-line px-3 py-1.5 text-[11px] text-slate-300">{topic}</button>)}</div></div><div className="flex-1 space-y-3 overflow-y-auto p-4">{messages.map((message,index)=><div key={index} className={`max-w-[85%] rounded-2xl px-4 py-3 text-xs leading-5 ${message.from==="user"?"ml-auto bg-lime text-ink":"bg-ink text-slate-300"}`}>{message.text}</div>)}<div className="pt-2"><p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">Tickets</p>{tickets.length?tickets.slice(0,3).map(ticket=><div key={ticket.id} className="mb-2 rounded-xl border border-line bg-ink/60 p-3 text-xs"><div className="flex justify-between gap-3"><span className="font-bold">{ticket.subject}</span><span className="text-lime">{ticket.status}</span></div>{ticket.adminReply&&<p className="mt-2 text-slate-400">{ticket.adminReply}</p>}</div>):<p className="rounded-xl border border-line bg-ink/60 p-3 text-center text-xs text-slate-500">No records available</p>}</div></div><div className="border-t border-line p-4"><button onClick={()=>setTicketOpen(true)} className="mb-3 w-full rounded-xl border border-line py-2.5 text-xs font-bold text-lime">Raise Ticket</button><div className="flex gap-2"><input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")sendMessage();}} placeholder="Type your message..." className="min-w-0 flex-1 rounded-xl border border-line bg-ink px-4 py-3 text-xs outline-none focus:border-lime/50"/><button onClick={()=>sendMessage()} className="rounded-xl bg-lime px-4 text-ink"><Send size={17}/></button></div></div></>}</div></div>;
}

function SupportTicketForm({close,submitted}:{close:()=>void;submitted:()=>void}) { const [subject,setSubject]=useState(""); const [message,setMessage]=useState(""); const [error,setError]=useState(""); const [loading,setLoading]=useState(false); const submit=async()=>{setError("");if(!subject.trim()||!message.trim()){setError("Complete all ticket fields");return;}setLoading(true);const response=await fetch("/api/support",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({subject,message})});const data=await response.json().catch(()=>({}));setLoading(false);if(!response.ok){setError(data.error||"Support ticket failed");return;}submitted();}; return <div className="flex-1 overflow-y-auto p-5"><button onClick={close} className="text-xs font-bold text-lime">Back to chat</button><h4 className="mt-4 text-lg font-black">Raise Ticket</h4><div className="mt-5 space-y-4"><FormField label="Subject" value={subject} onChange={setSubject} placeholder="Brief issue summary"/><label className="block text-xs font-bold text-slate-400">Message<textarea value={message} onChange={e=>setMessage(e.target.value)} rows={5} className="mt-2 w-full resize-none rounded-xl border border-line bg-ink p-3 text-white outline-none focus:border-lime/50"/></label></div>{error&&<p className="mt-3 text-xs text-danger">{error}</p>}<button onClick={submit} disabled={loading} className="mt-6 w-full rounded-xl bg-lime py-3.5 text-sm font-black text-ink disabled:opacity-60">{loading?"Submitting...":"Submit Ticket"}</button></div> }

function FormField({label,value,onChange,placeholder}:{label:string;value:string;onChange:(value:string)=>void;placeholder?:string}) { return <label className="block text-xs font-bold text-slate-400">{label}<input value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} className="mt-2 w-full rounded-xl border border-line bg-ink p-3 text-white outline-none focus:border-lime/50"/></label> }

function LineItem({label,value}:{label:string;value:string}) { return <div className="flex justify-between text-xs"><span className="text-slate-500">{label}</span><span className="font-bold">{value}</span></div> }


function Stat({label,value,trend}:{label:string;value:string;trend?:string}) { return <div className="rounded-xl border border-line bg-ink/50 p-3"><p className="text-[10px] text-slate-500">{label}</p><div className="mt-1 flex items-end gap-1"><p className="font-black">{value}</p>{trend&&<span className="text-[9px] text-mint">{trend}</span>}</div></div> }




