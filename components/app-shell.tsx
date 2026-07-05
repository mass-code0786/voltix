"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import Link from "next/link";
import {
  ArrowDownLeft, ArrowDownToLine, ArrowLeftRight, ArrowUpRight, BarChart3, Bell,
  Bot, CheckCircle2, ChevronDown, ChevronRight, CircleDollarSign, Copy, FileClock, Gift, Grid2X2,
  Headphones, Home, Landmark, LineChart, Menu, Network, Plus, QrCode, Search,
  Send, Settings, Share2, ShieldCheck, Star,
  Trophy, Users, Wallet, X, Zap,
} from "lucide-react";
import { CoinMark } from "./coin-mark";
import { Sparkline } from "./sparkline";
import { CandlestickChart } from "./candlestick-chart";
import { OrderBookPanel } from "./order-book";
import {
  ActionTile,
  AppHeader,
  BottomNav,
  CoinRow as DesignCoinRow,
  EmptyState,
  GlassCard,
  NeonButton,
  PageHero,
  SectionHeader,
  StatCard,
  StatusBadge,
} from "./design-system";
import { coins } from "@/lib/market-defaults";
import { compact, inr, usd } from "@/lib/format";
import { useLiveTickers } from "@/lib/use-market-data";
import { currencyConfigForCountry, formatLocalCurrency } from "@/lib/local-currency";
import { getTranslator } from "@/lib/i18n";

type Tab = "home" | "markets" | "trade" | "bitex" | "team" | "wallet";
type MobileNavTab = Tab | "profile";
type TradeCategory = "spot" | "futures" | "grid" | "margin" | "copy";
type WalletSection = "overview" | "assets" | "ledger";
type WalletAction = "deposit" | null;
type UserWallet = "SPOT" | "FUTURES" | "BITEX";
type WalletActivity = readonly [typeof ArrowDownLeft, string, string, string];
type WithdrawalInput = { walletType: "SPOT" | "BITEX"; amount: number; address: string; network: string };
type DepositInput = { amount: number; network: string; txHash?: string };
type DepositRecord = { id: string; amount: number; asset: string; network: string; txHash?: string | null; status: string; createdAt: string };
type WithdrawalRecord = { id: string; walletType: "SPOT" | "BITEX"; amount: number; fee: number; receivable: number; asset: string; address: string; network: string; txHash?: string | null; status: string; rejectionReason?: string | null; createdAt: string };
type ActiveCopyTrade = { code?: string; rowLabel?: string; amount: number; returnPercent: number; profit: number; remainingTime?: number; status?: string; date?: string };
type CopyTradeHistory = ActiveCopyTrade & { date: string; status: string };
type VipTradeRow = { id: string; label: string; vipRanks: string[]; dailyPercentMin: number; dailyPercentMax: number; eligible: boolean; available: boolean; tradeAmount: number; perTradePercent: number; currentTradeTime?: string; tradeStatus?: "Upcoming" | "Live" | "Closed"; message?: string | null };
type AppCoin = typeof coins[number];
type MarketCoin = AppCoin & { volume?: number; quoteVolume?: number; live?: boolean };
type CoinSetting = Partial<Omit<AppCoin,"localLogoPath">> & { localLogoPath?: string | null };
type CurrentUser = { id?: string | null; uid?: string | null; name?: string | null; email?: string | null; country?: string | null; language?: string | null; vipRank?: string | null; role?: string | null };
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
  request: {
    id: string;
    fullName: string;
    dateOfBirth?: string | null;
    country?: string | null;
    address?: string | null;
    governmentIdType: string;
    governmentIdNumber: string;
    frontIdImageUrl?: string | null;
    backIdImageUrl?: string | null;
    selfieImageUrl?: string | null;
    rejectionReason?: string | null;
    submittedAt: string;
  } | null;
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

const mobileTabs: { id: MobileNavTab; label: string; icon: typeof Home; section?: WalletSection }[] = [
  { id: "home", label: "Home", icon: Home },
  { id: "markets", label: "Markets", icon: BarChart3 },
  { id: "bitex", label: "AI Trade", icon: Zap },
  { id: "wallet", label: "Asset", icon: Wallet, section: "overview" },
  { id: "profile", label: "Profile", icon: Settings },
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
  const [vipTradeRows, setVipTradeRows] = useState<VipTradeRow[]>([]);
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
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [dashboard, setDashboard] = useState<DashboardSnapshot | null>(null);
  const [aiSubscription, setAiSubscription] = useState<AiSubscriptionStatus | null>(null);
  const [walletActivity, setWalletActivity] = useState<WalletActivity[]>([]);
  const [userCountry, setUserCountry] = useState("United States");
  const [userLanguage, setUserLanguage] = useState("en");
  const t = useMemo(() => getTranslator(userLanguage), [userLanguage]);
  const tabLabel = useCallback((id: Tab) => t(id === "bitex" ? "ai" : id === "wallet" ? "asset" : id), [t]);
  const isAdminUser = currentUser?.role === "ADMIN" || currentUser?.role === "SUPER_ADMIN";

  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
  };

  const applyAuthenticatedUser = useCallback((user: CurrentUser | null) => {
    setCurrentUser(user);
    if (user?.country?.trim()) setUserCountry(user.country);
    setUserLanguage(user?.language?.trim() || "en");
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
      setVipTradeRows([]);
      return;
    }
    const response = await fetch("/api/copy-trade/status");
    if (!response.ok) throw new Error("Copy trade status request failed");
    const data = await response.json();
    const status = data?.status;
    setActiveCopyTrade(status?.activeTrade ? normalizeTrade(status.activeTrade) : null);
    setCopyTradeHistory(Array.isArray(status?.history) ? status.history.map(normalizeTrade) : []);
    setVipTradeRows(Array.isArray(status?.tradeRows) ? status.tradeRows as VipTradeRow[] : []);
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

  const openAuthPage = useCallback((mode: "login" | "register" = "login") => {
    const returnTo = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    window.location.href = `/auth?mode=${mode}&returnTo=${encodeURIComponent(returnTo)}`;
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
          setVipTradeRows([]);
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
    if (nextTab === "wallet" && !currentUser) {
      openAuthPage("login");
      setMenu(false);
      setNotificationOpen(false);
      return;
    }
    setTab(nextTab);
    setWalletSection(section ?? "overview");
    setWalletAction(action ?? null);
    setMenu(false);
    setNotificationOpen(false);
    updateUrl(nextTab, section, action);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [currentUser, openAuthPage, updateUrl]);

  const selectTab = useCallback((nextTab: Tab, section?: WalletSection) => {
    if (nextTab === "wallet" && !currentUser) {
      openAuthPage("login");
      return;
    }
    if (nextTab === "trade") {
      setTradeMenuOpen(true);
      return;
    }
    navigate(nextTab, section);
  }, [currentUser, navigate, openAuthPage]);

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

  const startCopyTrade = useCallback(async (rowId: string) => {
    const response = await fetch("/api/copy-trade/execute", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rowId }) });
    const data = await response.json();
    if (!response.ok) return { ok: false, message: data.error || "Copy trade failed" };
    await refreshCopyTradeStatus(currentUser);
    await refreshWallet(currentUser);
    await refreshAssets(currentUser);
    notify(`${Number(data.trade.amount).toFixed(2)} USDT locked from AI.`);
    return { ok: true, message: "" };
  }, [currentUser, notify, refreshAssets, refreshCopyTradeStatus, refreshWallet]);

  const purchaseAi = useCallback(async () => {
    if (!currentUser) {
      openAuthPage("login");
      return { ok: false, message: "Login required" };
    }
    try {
      await refreshAiSubscription(currentUser);
      const response = await fetch("/api/ai/subscription/purchase", { method: "POST" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 401) openAuthPage("login");
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
  }, [currentUser, notify, openAuthPage, refreshAiSubscription, refreshCopyTradeStatus, refreshDashboard, refreshWallet]);

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
    home: <HomeScreen t={t} currentUser={currentUser} onNavigate={navigate} onOpenAuth={()=>openAuthPage("login")} onOpenCopyTrade={()=>navigate("bitex")} assets={marketCoins} dashboard={dashboard} balanceVisible={balanceVisible} setBalanceVisible={setBalanceVisible} activeCopyTrade={activeCopyTrade} copyTradeHistory={copyTradeHistory} bitexBalance={bitexBalance} userCountry={userCountry} aiSubscription={aiSubscription} vipTradeRows={vipTradeRows} startTrade={startCopyTrade} purchaseAi={purchaseAi} notify={notify} />,
    markets: <MarketsScreen t={t} coins={marketCoins} userCountry={userCountry} />,
    trade: <TradeWorkspace category={tradeCategory} />,
    bitex: <AiCopyTradePage currentUser={currentUser} subscription={aiSubscription} activeTrade={activeCopyTrade} bitexBalance={bitexBalance} tradeRows={vipTradeRows} startTrade={startCopyTrade} completeTrade={completeActiveCopyTrade} purchaseAi={purchaseAi} openLogin={()=>openAuthPage("login")} />,
    team: <TeamScreen notify={notify} currentUser={currentUser} />,
    wallet: <WalletScreen notify={notify} assets={walletAssets} futuresBalance={futuresBalance} bitexBalance={bitexBalance} bitexIncomeEarned={bitexIncomeEarned} bitexTarget={bitexPrincipalLocked*2} activity={walletActivity} section={walletSection} action={walletAction} onSectionChange={changeWalletSection} onOpenTransfer={()=>setTransferOpen({from:"SPOT",to:"FUTURES"})} onOpenWithdrawal={()=>setWithdrawalOpen(true)} onOpenDeposit={() => { setWalletAction("deposit"); updateUrl("wallet", walletSection, "deposit"); }} onCloseAction={() => { setWalletAction(null); updateUrl("wallet", walletSection, null, true); }} onCreateDeposit={createDeposit} />,
  }[tab];

  return (
    <div className="dark-gradient-bg min-h-screen pb-[96px] lg:pb-8">
      <div className="mx-auto flex min-h-screen max-w-[1500px]">
        <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 border-r border-line bg-[#09120f] p-5 lg:block">
          <Brand />
          <nav className="mt-9 space-y-1.5">
            {tabs.map(({ id, icon: Icon }) => (
              <button key={id} onClick={() => selectTab(id)} aria-current={tab === id ? "page" : undefined} className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold transition ${tab === id ? "bg-lime text-ink" : "text-slate-400 hover:bg-white/5 hover:text-white"}`}>
                <Icon size={19} />{tabLabel(id)}
              </button>
            ))}
          </nav>
          <div className="absolute inset-x-5 bottom-5 rounded-2xl border border-lime/20 bg-lime/[.06] p-4">
            <div className="flex items-center gap-2 text-xs font-bold text-lime"><ShieldCheck size={15} /> ACCOUNT VERIFIED</div>
            <p className="mt-2 text-xs leading-5 text-slate-500">2FA enabled · KYC level 2</p>
            {isAdminUser && <Link href="/admin" className="mt-3 block text-xs font-bold text-white hover:text-lime">Open admin console</Link>}
          </div>
        </aside>

        <main className="min-w-0 flex-1 lg:ml-64">
          <AppHeader
            title={tabLabel(tab)}
            subtitle={t("welcomeBack")}
            initials={initials(currentUser?.name)}
            unreadNotifications={unreadNotifications}
            onMenuButton={() => { setMenu(!menu); setNotificationOpen(false); }}
            onNotifications={() => { if (!currentUser) { openAuthPage("login"); return; } setNotificationOpen(value => !value); setMenu(false); refreshNotifications(currentUser).catch(() => {}); }}
            onMenu={() => { setMenu(!menu); setNotificationOpen(false); }}
          />
          {notificationOpen && <NotificationMenu close={() => setNotificationOpen(false)} notifications={notifications} unreadCount={unreadNotifications} markRead={markNotificationsRead} />}
          {menu && <ProfileMenu close={() => setMenu(false)} notify={notify} user={currentUser} openLogin={()=>{setMenu(false);openAuthPage("login");}} openRegister={()=>{setMenu(false);openAuthPage("register");}} logout={async()=>{await fetch("/api/auth/logout",{method:"POST"});await refreshMe();setMenu(false);notify("Logged out");}} openVerification={()=>{setMenu(false);if(!currentUser){openAuthPage("login");return;}setVerificationOpen(true);}} openHelp={()=>{setMenu(false);setHelpOpen(true);}} />}
          <div className={`mx-auto max-w-[420px] px-4 lg:max-w-6xl lg:px-8 ${tab === "home" ? "pb-20 pt-1 lg:pb-8 lg:pt-1" : "pb-20 pt-2.5 lg:py-8"}`}>{screen}</div>
        </main>
      </div>

      <BottomNav items={mobileTabs} activeId={tab} activeSection={walletSection} labelFor={(id) => id === "profile" ? "Profile" : id === "bitex" ? "AI Trade" : id === "wallet" ? "Wallet" : tabLabel(id)} onSelect={(id, section) => { if (id === "profile") { window.location.href = "/profile"; return; } selectTab(id, section as WalletSection | undefined); }} />
      {tradeMenuOpen&&<TradeMenu close={()=>setTradeMenuOpen(false)} select={openTrade}/>} 
      {transferOpen&&<WalletTransferModal initialFrom={transferOpen.from} initialTo={transferOpen.to} balances={{SPOT:Number(assetTotals.total?.spot??0),FUTURES:futuresBalance,BITEX:bitexBalance}} close={()=>setTransferOpen(null)} transfer={transferWallet}/>} 
      {withdrawalOpen&&<WithdrawalModal balances={{SPOT:Number(assetTotals.total?.spot??0),BITEX:bitexBalance}} bitexUnlocked={bitexPrincipalLocked>0&&bitexIncomeEarned>=bitexPrincipalLocked*2} close={()=>setWithdrawalOpen(false)} withdraw={createWithdrawal}/>} 
      {verificationOpen&&<VerificationRequestModal close={()=>setVerificationOpen(false)} notify={notify} user={currentUser}/>} 
      {helpOpen&&<HelpCenterModal close={()=>setHelpOpen(false)} notify={notify}/>} 
      {toast && <div className="fixed bottom-24 left-1/2 z-[60] -translate-x-1/2 whitespace-nowrap rounded-full border border-lime/20 bg-[#17231e] px-5 py-3 text-xs font-bold shadow-2xl lg:bottom-8"><span className="mr-2 text-lime">?</span>{toast}</div>}
    </div>
  );
}

function Brand({ compact = false }: { compact?: boolean }) {
  return <img src="/logo.png" alt="VOLTIX" className={`${compact ? "h-[28px]" : "h-[34px]"} block w-auto object-contain opacity-100 mix-blend-normal filter-none transform-none`} />;
}

function initials(name?: string | null) {
  const parts = name?.trim().split(/\s+/).filter(Boolean) ?? [];
  return parts.length ? parts.slice(0, 2).map(part => part[0]).join("").toUpperCase() : "AC";
}

function normalizeTrade(raw: ActiveCopyTrade & { startedAt?: string; remainingTime?: number; status?: string }): CopyTradeHistory {
  return {
    code: raw.code ?? "",
    rowLabel: raw.rowLabel,
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
  const isAdminUser = user?.role === "ADMIN" || user?.role === "SUPER_ADMIN";
  const copyUid=()=>{if(!uid){notify("UID unavailable");return;}navigator.clipboard?.writeText(uid);notify("UID copied");};
  return <><button aria-label="Close menu" onClick={close} className="fixed inset-0 z-30 bg-black/30" /><div className="fixed right-4 top-16 z-40 w-72 rounded-2xl border border-line bg-[#111c18] p-3 shadow-2xl"><div className="border-b border-line p-3"><p className="font-bold">{user?.name?.trim() || "Account"}</p><div className="mt-1 flex items-center gap-2 text-xs text-slate-500"><span>{uid?`UID ${uid}`:"Not logged in"}</span>{uid&&<button onClick={copyUid} aria-label="Copy UID" className="rounded p-1 text-slate-400 hover:bg-white/5 hover:text-lime"><Copy size={13}/></button>}<span>· {user?.vipRank || "Pro"} member</span></div></div>{user?<><Link href="/profile" onClick={close} className="mt-2 flex w-full items-center gap-3 rounded-xl p-3 text-sm text-slate-300 hover:bg-white/5"><Settings size={17}/> Profile & Settings</Link><button onClick={logout} className="flex w-full items-center gap-3 rounded-xl p-3 text-sm text-slate-300 hover:bg-white/5"><ShieldCheck size={17}/> Logout</button></>:<><button onClick={openLogin} className="mt-2 flex w-full items-center gap-3 rounded-xl p-3 text-sm text-slate-300 hover:bg-white/5"><ShieldCheck size={17}/> Login</button><button onClick={openRegister} className="flex w-full items-center gap-3 rounded-xl p-3 text-sm text-slate-300 hover:bg-white/5"><Users size={17}/> Register</button></>}<button onClick={openVerification} className="flex w-full items-center gap-3 rounded-xl p-3 text-sm text-slate-300 hover:bg-white/5"><ShieldCheck size={17}/> Verification Request</button><button onClick={openHelp} className="flex w-full items-center gap-3 rounded-xl p-3 text-sm text-slate-300 hover:bg-white/5"><Headphones size={17}/> Help Center</button>{isAdminUser && <Link href="/admin" className="flex items-center gap-3 rounded-xl p-3 text-sm text-slate-400 hover:bg-white/5"><Settings size={17} /> Admin console</Link>}</div></>;
}

function HomeScreen({ t, currentUser, onNavigate, onOpenAuth, onOpenCopyTrade, assets, dashboard, balanceVisible, setBalanceVisible, copyTradeHistory, bitexBalance, userCountry, aiSubscription, vipTradeRows, startTrade, purchaseAi, notify }: { t: ReturnType<typeof getTranslator>; currentUser: CurrentUser | null; onNavigate: (tab: Tab, section?: WalletSection, action?: WalletAction) => void; onOpenAuth: () => void; onOpenCopyTrade: () => void; assets: AppCoin[]; dashboard: DashboardSnapshot | null; balanceVisible: boolean; setBalanceVisible: (v: boolean) => void; activeCopyTrade: ActiveCopyTrade | null; copyTradeHistory: CopyTradeHistory[]; bitexBalance: number; userCountry: string; aiSubscription: AiSubscriptionStatus | null; vipTradeRows: VipTradeRow[]; startTrade: (rowId: string) => Promise<{ok:boolean;message:string}>; purchaseAi: () => Promise<{ok:boolean;message:string}>; notify: (message: string) => void }) {
  const total = dashboard?.summary?.totalPortfolio ?? 0;
  const todaysProfit = dashboard?.summary?.todaysProfit ?? 0;
  const totalIncome = dashboard?.summary?.totalIncome ?? 0;
  const live=useLiveTickers();
  const tickerMap=useMemo(()=>new Map(live.map(ticker=>[ticker.symbol,ticker])),[live]);
  const localCurrency=useMemo(()=>currencyConfigForCountry(userCountry),[userCountry]);
  const marketPulseAssets=useMemo<MarketCoin[]>(()=>homeMarketPulseSymbols.flatMap(symbol=>{
    const coin=assets.find(item=>item.symbol===symbol);
    if(!coin)return [];
    const ticker=tickerMap.get(coin.pair??`${coin.symbol}USDT`);
    return [{...coin,price:ticker?.price??0,change:ticker?.changePercent??0,volume:ticker?.volume,quoteVolume:ticker?.quoteVolume,live:Boolean(ticker?.price)}];
  }),[assets,tickerMap]);
  const pulseCoins=marketPulseAssets.filter(coin=>["BTC","ETH","BNB","SOL"].includes(coin.symbol)).slice(0,4);
  const shortcuts: { icon: typeof Home; label: string; onClick: () => void }[] = [
    { icon: Wallet, label: "AI Wallet", onClick: () => onNavigate("wallet") },
    { icon: Copy, label: "Copy Trading", onClick: onOpenCopyTrade },
    { icon: Trophy, label: "VIP Benefits", onClick: onOpenCopyTrade },
    { icon: Gift, label: "Rewards", onClick: () => onNavigate("team") },
  ];
  return <div className="mx-auto max-w-[390px] space-y-2 overflow-x-hidden">
    {currentUser ? (
      <VoltixPortfolioHero
        currentUser={currentUser}
        total={total}
        todaysProfit={todaysProfit}
        balanceVisible={balanceVisible}
        setBalanceVisible={setBalanceVisible}
      />
    ) : <WelcomeCard t={t} onOpenAuth={onOpenAuth} />}

    <div className="grid grid-cols-4 gap-2">
      {shortcuts.map(({icon:Icon,label,onClick}) => <HomeActionTile key={label} icon={Icon} label={label} onClick={onClick} />)}
    </div>

    <AiOverviewCard totalIncome={totalIncome} history={copyTradeHistory} balanceVisible={balanceVisible} />
    <VipTradeRowsCard rows={vipTradeRows} startTrade={startTrade} notify={notify} />
    <HomeAiSubscriptionCard currentUser={currentUser} status={aiSubscription} purchaseAi={purchaseAi} onOpenAuth={onOpenAuth} notify={notify} />

    <GlassCard className="home-depth-card overflow-hidden rounded-[20px] p-3">
      <div className="flex items-center justify-between gap-3 pb-1.5">
        <h2 className="text-[16px] font-black text-white">Market Pulse</h2>
        <button onClick={() => onNavigate("markets")} className="text-[10px] font-black text-lime">View All</button>
      </div>
      <div className="flex gap-2 overflow-x-auto no-scrollbar">
        {pulseCoins.length ? pulseCoins.map(c => <MarketPulseCoinCard key={c.symbol} coin={c} localCurrency={localCurrency} />) : <div className="w-full"><EmptyState title="Live market data unavailable" icon={BarChart3} /></div>}
      </div>
    </GlassCard>
  </div>;
}
function WelcomeCard({ t, onOpenAuth }: { t: ReturnType<typeof getTranslator>; onOpenAuth: () => void }) {
  return <GlassCard className="home-hero-card relative h-[158px] overflow-hidden rounded-[21px] p-4">
    <div className="relative grid h-full grid-cols-[minmax(0,1fr)_108px] items-center gap-1">
      <div className="min-w-0">
        <p className="text-[12px] font-semibold text-slate-400">Welcome to join Voltix</p>
        <Brand compact />
        <p className="mt-1 max-w-[10rem] text-[10px] leading-4 text-slate-500">AI copy trading and wallet tools.</p>
        <div className="mt-2 grid grid-cols-2 gap-1.5">
          <button onClick={onOpenAuth} className="rounded-xl bg-[#18ff8a] px-3 py-1.5 text-[10px] font-black text-[#050608] shadow-[0_14px_34px_rgba(24,255,138,.24)]">Login</button>
          <button onClick={onOpenAuth} className="rounded-xl border border-[#18ff8a]/25 bg-white/[.045] px-3 py-1.5 text-[10px] font-black text-[#18ff8a]">Sign up</button>
        </div>
      </div>
      <div className="justify-self-end"><VoltixHeroLogo /></div>
    </div>
  </GlassCard>;
}

function VoltixPortfolioHero({ currentUser, total, todaysProfit, balanceVisible, setBalanceVisible }: { currentUser: CurrentUser; total: number; todaysProfit: number; balanceVisible: boolean; setBalanceVisible: (value: boolean) => void }) {
  return <GlassCard className="home-hero-card relative h-[158px] overflow-hidden rounded-[21px] p-4">
    <div className="relative grid h-full grid-cols-[minmax(0,1fr)_108px] items-center gap-1">
      <div className="min-w-0">
        <p className="text-[12px] font-semibold text-slate-400">Welcome Back,</p>
        <div className="mt-0.5 flex min-w-0 items-center gap-1.5">
          <h2 className="truncate text-[19px] font-bold leading-tight text-white">{currentUser.name?.trim() || "Voltix User"}</h2>
          <CheckCircle2 size={14} className="shrink-0 text-[#18ff8a]" fill="rgba(24,255,138,.18)" />
        </div>
        <div className="mt-1 flex items-center gap-1.5">
          <span className="flex h-5 items-center rounded-full border border-[#9b5cff]/35 bg-[#9b5cff]/12 px-2 text-[8px] font-black text-[#c9aeff]">{currentUser.vipRank || "VIP 0"}</span>
          <span className="flex h-5 items-center rounded-full border border-[#18ff8a]/20 bg-[#18ff8a]/10 px-2 text-[8px] font-black text-[#18ff8a]">Verified</span>
        </div>
        <p className="mt-1.5 text-[9px] font-bold uppercase tracking-[.12em] text-slate-500">Total Balance</p>
        <button onClick={() => setBalanceVisible(!balanceVisible)} className="mt-0.5 text-left text-[27px] font-black leading-none text-[#18ff8a] drop-shadow-[0_0_14px_rgba(24,255,138,.32)]">
          {balanceVisible ? usd(total) : "$ ******"}
        </button>
        <div className={`mt-1 inline-flex rounded-full border px-2 py-0.5 text-[11px] font-black leading-none ${todaysProfit >= 0 ? "border-[#18ff8a]/20 bg-[#18ff8a]/10 text-[#18ff8a]" : "border-danger/20 bg-danger/10 text-danger"}`}>
          {balanceVisible ? `${todaysProfit >= 0 ? "+" : ""}${usd(todaysProfit)} today` : "Balance hidden"}
        </div>
      </div>
      <div className="justify-self-end"><VoltixHeroLogo /></div>
    </div>
  </GlassCard>;
}

function VoltixHeroLogo() {
  return <svg
    aria-hidden="true"
    className="block h-[115px] w-[115px] shrink-0"
    viewBox="0 0 115 115"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <style>{`
      .voltix-v-float { animation: voltix-v-float 5.8s ease-in-out infinite; transform-origin: 57.5px 54px; }
      .voltix-ring-orbit { animation: voltix-ring-orbit 9s linear infinite; transform-origin: 57.5px 88px; }
      .voltix-ring-orbit-slow { animation: voltix-ring-orbit 13s linear infinite reverse; transform-origin: 57.5px 88px; }
      .voltix-glow-pulse { animation: voltix-glow-pulse 4.8s ease-in-out infinite; }
      .voltix-particle { animation: voltix-particle 3.6s ease-in-out infinite; }
      .voltix-particle:nth-of-type(2) { animation-delay: .7s; }
      .voltix-particle:nth-of-type(3) { animation-delay: 1.4s; }
      .voltix-particle:nth-of-type(4) { animation-delay: 2.1s; }
      @keyframes voltix-v-float {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(-3px); }
      }
      @keyframes voltix-ring-orbit {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }
      @keyframes voltix-glow-pulse {
        0%, 100% { opacity: .72; }
        50% { opacity: .94; }
      }
      @keyframes voltix-particle {
        0%, 100% { opacity: .22; transform: scale(.92); }
        50% { opacity: .82; transform: scale(1.08); }
      }
      @media (prefers-reduced-motion: reduce) {
        .voltix-v-float,
        .voltix-ring-orbit,
        .voltix-ring-orbit-slow,
        .voltix-glow-pulse,
        .voltix-particle { animation: none; }
      }
    `}</style>
    <defs>
      <linearGradient id="voltixVFront" x1="32" y1="23" x2="75" y2="78" gradientUnits="userSpaceOnUse">
        <stop stopColor="#9CFFD9" />
        <stop offset=".48" stopColor="#1EFF88" />
        <stop offset="1" stopColor="#00B86B" />
      </linearGradient>
      <linearGradient id="voltixVHighlight" x1="34" y1="25" x2="48" y2="74" gradientUnits="userSpaceOnUse">
        <stop stopColor="#F3FFF9" stopOpacity=".95" />
        <stop offset=".55" stopColor="#9CFFD9" stopOpacity=".62" />
        <stop offset="1" stopColor="#1EFF88" stopOpacity=".08" />
      </linearGradient>
      <linearGradient id="voltixGlass" x1="42" y1="30" x2="73" y2="67" gradientUnits="userSpaceOnUse">
        <stop stopColor="#FFFFFF" stopOpacity=".7" />
        <stop offset=".45" stopColor="#CFFFF0" stopOpacity=".16" />
        <stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
      </linearGradient>
      <radialGradient id="voltixPlatformGlow" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(58 91) rotate(90) scale(17 42)">
        <stop stopColor="#1EFF88" stopOpacity=".42" />
        <stop offset=".62" stopColor="#00B86B" stopOpacity=".14" />
        <stop offset="1" stopColor="#00B86B" stopOpacity="0" />
      </radialGradient>
      <filter id="voltixSoftGlow" x="11" y="8" width="93" height="88" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
        <feGaussianBlur stdDeviation="3.4" result="blur" />
        <feColorMatrix in="blur" type="matrix" values="0 0 0 0 0.117 0 0 0 0 1 0 0 0 0 0.533 0 0 0 .78 0" />
        <feBlend in="SourceGraphic" mode="screen" />
      </filter>
      <filter id="voltixPlatformBlur" x="10" y="72" width="96" height="37" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
        <feGaussianBlur stdDeviation="3.2" />
      </filter>
    </defs>

    <g className="voltix-glow-pulse" filter="url(#voltixPlatformBlur)">
      <ellipse cx="58" cy="92" rx="38" ry="10" fill="url(#voltixPlatformGlow)" />
    </g>

    <g>
      <ellipse cx="58" cy="88" rx="34" ry="10" fill="#06110D" stroke="#0D5E40" strokeOpacity=".7" />
      <g className="voltix-ring-orbit">
        <ellipse cx="58" cy="88" rx="42" ry="12" stroke="#1EFF88" strokeOpacity=".5" strokeWidth="1.3" strokeDasharray="24 15" />
      </g>
      <g className="voltix-ring-orbit-slow">
        <ellipse cx="58" cy="88" rx="31" ry="8" stroke="#9CFFD9" strokeOpacity=".42" strokeWidth="1" strokeDasharray="12 11" />
      </g>
      <ellipse cx="58" cy="88" rx="23" ry="5.8" stroke="#00B86B" strokeOpacity=".55" strokeWidth="1.1" />
      <ellipse cx="58" cy="88" rx="15" ry="3.8" fill="#020806" stroke="#123E2F" />
    </g>

    <g className="voltix-glow-pulse" opacity=".9" filter="url(#voltixSoftGlow)">
      <path d="M30 22L52 76L58 88L64 76L85 22L71 22L58 58L45 22H30Z" fill="#1EFF88" opacity=".32" />
    </g>

    <g className="voltix-v-float">
      <path d="M43 25H29L52 79L58 91L64 79L86 25H72L58 62L43 25Z" fill="url(#voltixVFront)" />
      <path d="M72 25H86L64 79L58 91L58 62L72 25Z" fill="#006B43" opacity=".92" />
      <path d="M43 25H29L52 79L58 91L58 62L43 25Z" fill="url(#voltixVFront)" />
      <path d="M35 28L53.5 72.5L57.8 81.3L61.4 73L75.7 28" stroke="#F4FFF9" strokeOpacity=".64" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M40 30L54 65L58 72L62 65L76 30H71L58 61L45 30H40Z" fill="url(#voltixGlass)" opacity=".78" />
      <path d="M58 62L72 25H78L61 69L58 75V62Z" fill="#003B2A" opacity=".35" />
      <path d="M29 25L43 25L58 62V71L50 57L34 25H29Z" fill="url(#voltixVHighlight)" opacity=".72" />
      <path d="M43 25H29L52 79L58 91L64 79L86 25H72L58 62L43 25Z" stroke="#9CFFD9" strokeOpacity=".34" strokeWidth="1" strokeLinejoin="round" />
    </g>

    <g fill="#9CFFD9">
      <circle className="voltix-particle" cx="23" cy="45" r="1.4" opacity=".38" />
      <circle className="voltix-particle" cx="91" cy="47" r="1.2" opacity=".32" />
      <circle className="voltix-particle" cx="82" cy="73" r="1" opacity=".3" />
      <circle className="voltix-particle" cx="35" cy="78" r="1.1" opacity=".26" />
    </g>
  </svg>;
}

function HomeActionTile({ icon: Icon, label, onClick }: { icon: typeof Home; label: string; onClick: () => void }) {
  return <button onClick={onClick} className="home-action-tile h-[66px] min-w-0 rounded-[16px] px-1 py-1.5 text-center">
    <span className="home-action-icon mx-auto grid h-6 w-6 place-items-center rounded-[10px] text-[#18ff8a]"><Icon size={17} /></span>
    <span className="mt-1 block text-[9px] font-black leading-tight text-slate-200">{label}</span>
  </button>;
}

function AiOverviewCard({ totalIncome, history, balanceVisible }: { totalIncome: number; history: CopyTradeHistory[]; balanceVisible: boolean }) {
  const chartData=useMemo(()=>history.map(row=>Number(row.profit ?? 0)).filter(value=>Number.isFinite(value)),[history]);
  const percent=history.length?chartData.reduce((sum,value)=>sum+value,0):0;
  return <GlassCard className="home-depth-card h-[126px] rounded-[20px] p-3">
    <div className="flex items-start justify-between gap-3">
      <h3 className="text-[16px] font-bold leading-tight text-white">AI Copy Trading Overview</h3>
      <button className="flex h-7 shrink-0 items-center gap-1 rounded-full border border-[#18ff8a]/15 bg-white/[.04] px-2 text-[10px] font-black text-slate-300">This Week <ChevronDown size={10}/></button>
    </div>
    <div className="mt-2 grid grid-cols-[minmax(0,1fr)_136px] items-end gap-2.5">
      <div>
        <p className="text-[9px] font-bold uppercase tracking-[.12em] text-slate-500">Total Income</p>
        <p className="mt-0.5 text-[24px] font-black leading-none text-[#18ff8a]">{balanceVisible ? usd(totalIncome) : "$ ******"}</p>
        <p className="mt-0.5 text-[10px] font-bold text-slate-500">{history.length ? `${percent >= 0 ? "+" : ""}${percent.toFixed(2)} USDT` : "No chart data yet"}</p>
      </div>
      <IncomeChart data={chartData} />
    </div>
  </GlassCard>;
}

function IncomeChart({ data }: { data: number[] }) {
  if (!data.length) return <div className="grid h-[64px] w-[136px] place-items-center rounded-xl border border-white/[.06] bg-black/20 text-center text-[10px] font-bold text-slate-600">No chart data</div>;
  const width=136, height=64;
  const cumulative=data.reduce<number[]>((series,value,index)=>[...series,(series[index-1]??0)+value],[]);
  const min=Math.min(...cumulative,0), max=Math.max(...cumulative,1);
  const points=cumulative.map((value,index)=>`${(index/Math.max(cumulative.length-1,1))*width},${height-8-((value-min)/Math.max(max-min,1))*(height-18)}`).join(" ");
  return <svg className="h-[64px] w-[136px] drop-shadow-[0_0_12px_rgba(24,255,138,.38)]" viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
    <defs><linearGradient id="incomeFill" x1="0" x2="0" y1="0" y2="1"><stop stopColor="#18ff8a" stopOpacity=".34"/><stop offset="1" stopColor="#18ff8a" stopOpacity="0"/></linearGradient></defs>
    <polyline points={`0,${height} ${points} ${width},${height}`} fill="url(#incomeFill)" stroke="none" />
    <polyline points={points} fill="none" stroke="#18ff8a" strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" />
  </svg>;
}

function VipTradeRowsCard({ rows, startTrade, notify }: { rows: VipTradeRow[]; startTrade: (rowId: string) => Promise<{ok:boolean;message:string}>; notify: (message: string) => void }) {
  const [loadingRow,setLoadingRow]=useState("");
  const [error,setError]=useState("");
  const nextTime=rows.find(row=>row.currentTradeTime)?.currentTradeTime ?? "--:--";
  const start=async(row:VipTradeRow)=>{
    setError("");
    if(!row.available){setError(row.message || "Trade not available.");return;}
    if(!row.eligible){setError(row.message || "You are not eligible for this trade.");return;}
    setLoadingRow(row.id);
    const result=await startTrade(row.id);
    setLoadingRow("");
    if(!result.ok){setError(result.message);return;}
    notify("Copy trade started");
  };
  return <GlassCard className="home-depth-card overflow-hidden rounded-[20px] p-3">
    <div className="flex items-start justify-between gap-3 pb-1.5">
      <h3 className="text-[16px] font-black text-white">VIP Trade Rows</h3>
      <div className="text-right"><p className="text-[8px] font-black uppercase tracking-[.12em] text-slate-600">Trade Time</p><p className="mt-0.5 text-[10px] font-black text-[#18ff8a]">{nextTime}</p></div>
    </div>
    <div className="space-y-1.5">
      {rows.length ? rows.map(row=><VipTradeRowItem key={row.id} row={row} loading={loadingRow===row.id} start={()=>start(row)} />) : <EmptyState title="No VIP trade rows available" icon={LineChart} />}
    </div>
    {error&&<p className="mt-3 border-t border-[#18ff8a]/10 pt-3 text-xs font-bold text-danger">{error}</p>}
  </GlassCard>;
}

function vipAccent(row: VipTradeRow) {
  const label=row.label.toLowerCase();
  if(label.includes("7") || label.includes("10")) return "#ff7a1a";
  if(label.includes("5") || label.includes("6")) return "#ffd54a";
  if(label.includes("3") || label.includes("4")) return "#9b5cff";
  if(label.includes("1") || label.includes("2")) return "#18c8ff";
  return "#18ff8a";
}

function VipTradeRowItem({ row, loading, start }: { row: VipTradeRow; loading: boolean; start: () => void }) {
  const accent=vipAccent(row);
  const status=row.tradeStatus??(row.available?"Live":"Closed");
  return <div className="vip-row flex h-[48px] items-center gap-1.5 rounded-[13px] px-2 py-1" style={{"--vip-accent":accent} as CSSProperties}>
    <div className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] text-[8px] font-black text-[#050807]" style={{background:`linear-gradient(145deg, ${accent}, ${accent}99)`,boxShadow:`0 0 18px ${accent}33`}}>VIP</div>
    <div className="min-w-0 flex-1">
      <div className="flex min-w-0 items-center gap-1.5">
        <p className="shrink-0 whitespace-nowrap text-[13px] font-black leading-none text-white">{row.label}</p>
        <span className="flex h-[18px] shrink-0 items-center rounded-full border px-1.5 text-[8px] font-black" style={{borderColor:`${accent}33`,backgroundColor:`${accent}14`,color:accent}}>{status}</span>
      </div>
      <p className="mt-0.5 truncate text-[9px] font-bold text-slate-400">{row.dailyPercentMin.toFixed(1)}% - {row.dailyPercentMax.toFixed(1)}% Daily Return</p>
    </div>
    <button onClick={start} disabled={loading} className="h-8 w-[76px] shrink-0 rounded-[10px] text-[11px] font-black text-[#050807] disabled:opacity-50" style={{background:accent,boxShadow:`0 0 18px ${accent}2e`}}>{loading?"Wait":"Trade"}</button>
  </div>;
}

function HomeAiSubscriptionCard({ currentUser, status, purchaseAi, onOpenAuth, notify }: { currentUser: CurrentUser | null; status: AiSubscriptionStatus | null; purchaseAi: () => Promise<{ok:boolean;message:string}>; onOpenAuth: () => void; notify: (message: string) => void }) {
  const [loading,setLoading]=useState(false);
  const active=Boolean(status?.subscription?.active);
  const expiry=status?.subscription?.expiresAt ? new Date(status.subscription.expiresAt) : null;
  const action=async()=>{
    if(!currentUser){onOpenAuth();return;}
    setLoading(true);
    const result=await purchaseAi();
    setLoading(false);
    if(!result.ok) notify(result.message || "AI purchase failed");
  };
  return <GlassCard className="home-depth-card h-[68px] rounded-[18px] p-2.5">
    <div className="grid h-full grid-cols-[48px_1fr_auto] items-center gap-2">
      <AiCube />
      <div className="min-w-0">
        <h3 className="text-[15px] font-black leading-tight text-white">AI Subscription</h3>
        <p className={`mt-0.5 text-[11px] font-black leading-tight ${active?"text-[#18ff8a]":"text-slate-500"}`}>{active?"Active":"Inactive"}</p>
        <p className="mt-0.5 truncate text-[9px] text-slate-500">{active&&expiry?`Expiry ${formatDate(expiry)}`:"Purchase required"}</p>
      </div>
      <button onClick={action} disabled={loading} className="h-8 w-[82px] rounded-[10px] border border-[#18ff8a]/25 bg-[#18ff8a]/12 text-[10px] font-black text-[#18ff8a] disabled:opacity-50">{loading?"Wait":active?"Manage":"Purchase"}</button>
    </div>
  </GlassCard>;
}

function AiCube() {
  return <div className="ai-cube-scene" aria-hidden="true"><div className="ai-cube"><i /><b /><span>AI</span></div></div>;
}

function MarketPulseCoinCard({ coin, localCurrency }: { coin: MarketCoin; localCurrency: ReturnType<typeof currencyConfigForCountry> }) {
  const shown = coin.price < .001 ? coin.price.toFixed(8) : coin.price < 1 ? coin.price.toFixed(4) : coin.price.toLocaleString("en-US", { maximumFractionDigits: 2 });
  return <article className="market-coin-card h-[94px] w-[92px] shrink-0 rounded-[14px] p-2">
    <div className="flex items-center justify-between gap-2">
      <CoinMark symbol={coin.symbol} color={coin.color} logoPath={coin.localLogoPath} size="sm" />
      <span className={`text-[9px] font-black ${coin.change >= 0 ? "text-[#18ff8a]" : "text-danger"}`}>{coin.live?`${coin.change>=0?"+":""}${coin.change.toFixed(2)}%`:"--"}</span>
    </div>
    <p className="mt-1 text-[12px] font-black leading-none text-white">{coin.symbol}<span className="text-[7px] text-slate-500">/USDT</span></p>
    <p className="mt-0.5 truncate text-[8px] text-slate-500">{coin.name}</p>
    <p className="mt-1 text-[12px] font-black leading-none text-[#18ff8a]">{coin.live?`$${shown}`:"Loading"}</p>
    {coin.live&&<p className="mt-0.5 text-[8px] text-slate-600">{formatLocalCurrency(coin.price, localCurrency)}</p>}
    <div className="mt-auto h-5 overflow-hidden pt-0.5"><Sparkline data={coin.spark} positive={coin.change >= 0} /></div>
  </article>;
}
function TradeActiveCard({ t = getTranslator("en"), onClick, trade, previewAmount }: { t?: ReturnType<typeof getTranslator>; onClick: () => void; trade: ActiveCopyTrade | null; previewAmount: number }) {
  const amount=trade?.amount??previewAmount;
  return <button onClick={onClick} className="glass-panel card-3d relative w-full overflow-hidden rounded-[28px] p-5 text-left"><div className="absolute right-0 top-0 h-24 w-24 rounded-full bg-lime/10 blur-2xl"/><div className="relative flex items-center gap-4"><div className="pulse-ring grid h-12 w-12 place-items-center rounded-2xl bg-lime text-ink"><Zap size={22} fill="currentColor" /></div><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><h3 className="font-black">Trade Active</h3><StatusBadge>{trade?"Live":"Ready"}</StatusBadge></div><p className="mt-1 text-xs text-slate-400">BTC/USDT - Copy Trade Income</p></div><ChevronRight className="text-slate-500" /></div><div className="relative mt-4 grid grid-cols-2 gap-3"><div><p className="text-[10px] font-bold uppercase text-slate-500">Trade amount</p><p className="mt-1 text-lg font-black text-white">${amount.toFixed(2)}</p></div><div className="text-right"><p className="text-[10px] font-bold uppercase text-slate-500">Remaining</p><p className="mt-1 text-xl font-black text-lime">{trade?formatRemaining(trade.remainingTime??0):"--:--"}</p></div></div><div className="relative mt-3 h-1.5 overflow-hidden rounded-full bg-black/30"><div className={`h-full rounded-full bg-lime green-glow ${trade?"w-[38%]":"w-[8%]"}`} /></div></button>;
}

function formatRemaining(seconds:number) {
  const safe=Math.max(0,Math.floor(seconds));
  return `${String(Math.floor(safe/60)).padStart(2,"0")}:${String(safe%60).padStart(2,"0")}`;
}

function TopCopyTraders({ t = getTranslator("en") }: { t?: ReturnType<typeof getTranslator> }) {
  return <GlassCard className="overflow-hidden rounded-[28px]"><SectionHeader title={t("topCopyTraders")} />{topCopyTraders.length?<div className="divide-y divide-line/60">{topCopyTraders.map((trader,index)=>{const assetIndex=index+1;return <div key={`${trader.country}-${trader.name}`} className="flex items-center gap-2 px-3 py-3 sm:gap-3 sm:px-5"><img src={`/trader-flags/flag-${assetIndex}.png`} alt={`${trader.country} flag`} className="h-5 w-7 shrink-0 rounded object-cover ring-1 ring-white/10 sm:h-6 sm:w-8" /><img src={`/traders/trader-${assetIndex}.png`} alt={`${trader.name} profile`} className="h-9 w-9 shrink-0 rounded-full object-cover ring-1 ring-lime/25 sm:h-10 sm:w-10" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{trader.name}</p><p className="mt-0.5 line-clamp-2 text-[10px] leading-snug text-slate-500">{trader.message}</p></div><div className="w-[42px] shrink-0 text-right sm:w-[54px]"><p className="text-xs font-black text-lime sm:text-sm">+{trader.monthlyReturn}%</p><p className="text-[9px] text-slate-500 sm:text-[10px]">/ month</p></div><img src={`/trader-charts/chart-${assetIndex}.png`} alt={`${trader.name} monthly profit chart`} className="h-[34px] w-[54px] shrink-0 rounded-md border border-line bg-black/20 object-cover" /></div>;})}</div>:<EmptyState title={t("noCopyTraders")} icon={Users} />}</GlassCard>;
}
function formatMarketPrice(value:number) {
  if (!value) return "--";
  if (value < .001) return `$${value.toFixed(8)}`;
  if (value < 1) return `$${value.toFixed(4)}`;
  return `$${value.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

function CoinOrb({symbol,color,size=42}:{symbol:string;color:string;size?:number}) {
  const id=`coinGlow-${symbol.replace(/[^a-z0-9]/gi,"")}-${size}`;
  return <svg width={size} height={size} viewBox="0 0 52 52" className="market-coin-orb shrink-0" aria-label={`${symbol} coin icon`} role="img">
    <defs>
      <radialGradient id={id} cx="34%" cy="28%" r="70%">
        <stop offset="0%" stopColor="#ffffff" stopOpacity=".95"/>
        <stop offset="30%" stopColor={color}/>
        <stop offset="72%" stopColor="#0b1713"/>
        <stop offset="100%" stopColor="#020403"/>
      </radialGradient>
      <linearGradient id={`${id}-edge`} x1="8" y1="4" x2="44" y2="48">
        <stop stopColor="#effff7" stopOpacity=".75"/>
        <stop offset=".45" stopColor="#18ff8a" stopOpacity=".42"/>
        <stop offset="1" stopColor="#03100b" stopOpacity=".9"/>
      </linearGradient>
    </defs>
    <circle cx="26" cy="26" r="22" fill={`url(#${id})`} stroke={`url(#${id}-edge)`} strokeWidth="1.2"/>
    <ellipse cx="19" cy="15" rx="8" ry="4" fill="#fff" opacity=".28" transform="rotate(-28 19 15)"/>
    <path d="M12 32c6 6 20 8 29-2" fill="none" stroke="#fff" strokeOpacity=".13" strokeWidth="1.2"/>
    <circle cx="26" cy="26" r="15" fill="none" stroke="#fff" strokeOpacity=".12" strokeDasharray="4 3"/>
    <text x="26" y="30" textAnchor="middle" className="market-coin-symbol">{symbol.slice(0,3)}</text>
  </svg>;
}

function MarketSparkSvg({data,positive=true,compact:small=false}:{data:number[];positive?:boolean;compact?:boolean}) {
  const values=data.length?data:[20,22,21,24,23,26,25,28];
  const min=Math.min(...values);
  const max=Math.max(...values);
  const span=Math.max(max-min,1);
  const points=values.map((value,index)=>{
    const x=(index/(values.length-1 || 1))*100;
    const y=34-((value-min)/span)*28;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  const color=positive?"#18ff8a":"#ff4f6d";
  return <svg viewBox="0 0 100 40" className={small?"h-8 w-[76px]":"h-10 w-[92px]"} preserveAspectRatio="none" aria-hidden="true">
    <path d={`M0 38 L ${points} L100 40 Z`} fill={color} opacity=".10"/>
    <polyline points={points} fill="none" stroke={color} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" className="market-spark-line"/>
    <circle cx="88" cy="10" r="2.3" fill={color} className="market-spark-dot"/>
  </svg>;
}

function MarketAtmosphere() {
  return <div className="market-atmosphere" aria-hidden="true">
    <svg className="market-grid-svg" viewBox="0 0 390 780" preserveAspectRatio="none">
      <defs>
        <linearGradient id="marketGridFade" x1="0" x2="1">
          <stop stopColor="#18ff8a" stopOpacity="0"/>
          <stop offset=".5" stopColor="#18ff8a" stopOpacity=".22"/>
          <stop offset="1" stopColor="#18ff8a" stopOpacity="0"/>
        </linearGradient>
      </defs>
      {Array.from({length:10}).map((_,i)=><path key={`h-${i}`} d={`M0 ${110+i*54} H390`} stroke="url(#marketGridFade)" strokeWidth=".7" opacity=".28"/>)}
      {Array.from({length:7}).map((_,i)=><path key={`v-${i}`} d={`M${22+i*58} 68 V760`} stroke="#18ff8a" strokeWidth=".55" opacity=".08"/>)}
      <path d="M18 164 C108 122 168 214 244 174 S340 132 382 174" fill="none" stroke="#18ff8a" strokeOpacity=".18" strokeWidth="1.2"/>
    </svg>
    <span className="market-ambient market-ambient-a"/>
    <span className="market-ambient market-ambient-b"/>
    <span className="market-ring market-ring-a"/>
    <span className="market-ring market-ring-b"/>
    <span className="market-diamond market-diamond-a"/>
    <span className="market-diamond market-diamond-b"/>
    {Array.from({length:18}).map((_,i)=><i key={i} className="market-particle" style={{"--x":`${(i*47)%100}%`,"--y":`${8+(i*31)%82}%`,"--d":`${2+(i%6)*.45}s`} as CSSProperties}/>)}
  </div>;
}

function SummaryItem({label,value,icon:Icon,tone="green"}:{label:string;value:string;icon:typeof Home;tone?: "green" | "blue" | "gold"}) {
  const toneClass=tone==="gold"?"text-[#f6c85f] shadow-[#f6c85f]/20":tone==="blue"?"text-[#58d8ff] shadow-[#58d8ff]/20":"text-[#18ff8a] shadow-[#18ff8a]/20";
  return <div className="min-w-0 rounded-[18px] border border-white/[.07] bg-white/[.035] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,.06)]">
    <div className="flex items-center gap-2">
      <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white/[.055] ${toneClass}`}><Icon size={14}/></span>
      <p className="min-w-0 truncate text-[10px] font-bold uppercase text-slate-500">{label}</p>
    </div>
    <p className="market-number mt-2 truncate text-[15px] font-black text-white">{value}</p>
  </div>;
}

function MarketSectionTitle({title,meta}:{title:string;meta?:string}) {
  return <div className="flex items-end justify-between gap-3 px-1">
    <h3 className="text-[15px] font-black text-white">{title}</h3>
    {meta&&<span className="text-[10px] font-bold uppercase tracking-wider text-slate-600">{meta}</span>}
  </div>;
}

function TrendingCoinCard({coin,onTrade}:{coin:MarketCoin;onTrade:()=>void}) {
  const positive=coin.change>=0;
  return <button onClick={onTrade} className="market-trending-card group">
    <div className="flex items-start justify-between">
      <CoinOrb symbol={coin.symbol} color={coin.color} size={46}/>
      <Star size={15} className="text-[#f6c85f] drop-shadow-[0_0_10px_rgba(246,200,95,.45)]"/>
    </div>
    <div className="mt-3 flex items-end justify-between gap-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-black text-white">{coin.name}</p>
        <p className="mt-0.5 text-[10px] font-bold text-slate-500">{coin.symbol}/USDT</p>
      </div>
      <p className={`text-xs font-black ${positive?"text-[#18ff8a]":"text-[#ff4f6d]"}`}>{coin.live?`${positive?"+":""}${coin.change.toFixed(2)}%`:"Live"}</p>
    </div>
    <div className="mt-2 flex items-center justify-between gap-2">
      <p className="text-[13px] font-black text-white">{formatMarketPrice(coin.price)}</p>
      <MarketSparkSvg data={coin.spark} positive={positive} compact/>
    </div>
  </button>;
}

function MarketLiveRow({coin,localCurrency,onTrade}:{coin:MarketCoin;localCurrency:ReturnType<typeof currencyConfigForCountry>;onTrade:()=>void}) {
  const positive=coin.change>=0;
  return <article className="market-live-row">
    <button onClick={onTrade} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
      <CoinOrb symbol={coin.symbol} color={coin.color} size={40}/>
      <div className="min-w-0">
        <p className="truncate text-[13px] font-black text-white">{coin.name}</p>
        <p className="mt-0.5 text-[10px] font-bold text-slate-500">{coin.symbol}/USDT</p>
      </div>
    </button>
    <div className="hidden w-[70px] shrink-0 min-[390px]:block"><MarketSparkSvg data={coin.spark} positive={positive} compact/></div>
    <div className="min-w-[82px] text-right">
      <p className="truncate text-[13px] font-black text-white">{formatMarketPrice(coin.price)}</p>
      {coin.live&&<p className="mt-0.5 text-[9px] text-slate-600">{formatLocalCurrency(coin.price, localCurrency)}</p>}
      <p className={`mt-0.5 text-[11px] font-black ${positive?"text-[#18ff8a]":"text-[#ff4f6d]"}`}>{coin.live?`${positive?"+":""}${coin.change.toFixed(2)}%`:"Live"}</p>
    </div>
    <button onClick={onTrade} className="market-trade-button">Trade</button>
  </article>;
}

function MovementPanel({title,coins,tone}:{title:string;coins:MarketCoin[];tone:"gain"|"loss"}) {
  const positive=tone==="gain";
  return <section className={`market-panel p-3 ${positive?"market-panel-gain":"market-panel-loss"}`}>
    <div className="mb-2 flex items-center justify-between">
      <h3 className="text-[14px] font-black text-white">{title}</h3>
      {positive?<ArrowUpRight size={17} className="market-arrow-up text-[#18ff8a]"/>:<ArrowDownLeft size={17} className="market-arrow-down text-[#ff4f6d]"/>}
    </div>
    <div className="space-y-2">
      {coins.map(coin=><div key={coin.symbol} className="flex items-center gap-2 rounded-[14px] bg-black/20 px-2 py-2">
        <CoinOrb symbol={coin.symbol} color={coin.color} size={28}/>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-black text-white">{coin.symbol}</p>
          <p className="text-[9px] text-slate-600">{formatMarketPrice(coin.price)}</p>
        </div>
        <p className={`text-xs font-black ${positive?"text-[#18ff8a]":"text-[#ff4f6d]"}`}>{coin.change>0?"+":""}{coin.change.toFixed(2)}%</p>
      </div>)}
    </div>
  </section>;
}

function CategoryChips() {
  const categories=["AI","DeFi","Gaming","Meme","Layer1","Layer2","Real World Assets","Move"];
  return <section className="space-y-2">
    <MarketSectionTitle title="Market Categories"/>
    <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
      {categories.map(category=><button key={category} className="market-category-chip">{category}</button>)}
    </div>
  </section>;
}

function MarketsScreen({coins:marketBase,userCountry}:{t: ReturnType<typeof getTranslator>; coins:AppCoin[];userCountry:string}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All");
  const live=useLiveTickers();
  const tickerMap=useMemo(()=>new Map(live.map(ticker=>[ticker.symbol,ticker])),[live]);
  const localCurrency=useMemo(()=>currencyConfigForCountry(userCountry),[userCountry]);
  const marketCoins=useMemo(()=>marketBase.filter(coin=>coin.isActive).map(coin=>{const ticker=tickerMap.get(coin.pair);return {...coin,price:ticker?.price??0,change:ticker?.changePercent??0,volume:ticker?.volume,quoteVolume:ticker?.quoteVolume,live:Boolean(ticker?.price)};}),[marketBase,tickerMap]);
  const list=marketCoins.filter(c => (filter === "Gainers" ? c.change > 2 : filter === "Losers" ? c.change < 0 : true) && `${c.symbol}${c.name}${c.pair}`.toLowerCase().includes(query.toLowerCase()));
  const totalVolume=marketCoins.reduce((sum,coin)=>sum+Number(coin.quoteVolume ?? coin.volume ?? 0),0);
  const btc=marketCoins.find(coin=>coin.symbol==="BTC");
  const trending=marketCoins.filter(coin=>coin.symbol!=="USDT").sort((a,b)=>Math.abs(b.change)-Math.abs(a.change)).slice(0,8);
  const gainers=marketCoins.filter(coin=>coin.change>0).sort((a,b)=>b.change-a.change).slice(0,5);
  const losers=marketCoins.filter(coin=>coin.change<0).sort((a,b)=>a.change-b.change).slice(0,5);
  const marketCap=btc?.price ? `$${((btc.price*19_720_000)/1_000_000_000_000).toFixed(2)}T` : "$2.74T";
  const openTrade=(coin:MarketCoin)=>{window.location.href=`/markets/${coin.pair}`;};
  return <div className="market-page relative -mx-4 -mt-2.5 min-h-screen overflow-hidden px-4 pb-2 pt-1">
    <MarketAtmosphere/>
    <div className="relative z-10 space-y-3">
      <div className="relative h-[50px]">
        <Search className="pointer-events-none absolute left-4 top-1/2 z-10 -translate-y-1/2 text-[#18ff8a]" size={18}/>
        <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search Coins..." className="market-search h-[50px] w-full rounded-[25px] py-0 pl-12 pr-4 text-sm font-bold outline-none"/>
      </div>

      <section className="market-panel p-3">
        <div className="grid grid-cols-2 gap-2">
          <SummaryItem label="BTC Dominance" value={btc?.live ? "58.6%" : "58.1%"} icon={BarChart3}/>
          <SummaryItem label="Fear & Greed" value="74 Greed" icon={Zap} tone="gold"/>
          <SummaryItem label="Market Cap" value={marketCap} icon={CircleDollarSign} tone="blue"/>
          <SummaryItem label="24h Volume" value={totalVolume?`$${compact(totalVolume)}`:"$128.4B"} icon={LineChart}/>
        </div>
      </section>

      <section className="space-y-2">
        <MarketSectionTitle title="Trending Coins" meta="Live"/>
        <div className="flex gap-3 overflow-x-auto pb-1 no-scrollbar">
          {trending.map(coin=><TrendingCoinCard key={coin.symbol} coin={coin} onTrade={()=>openTrade(coin)}/>)}
        </div>
      </section>

      <section className="space-y-2">
        <div className="flex gap-2 overflow-x-auto no-scrollbar">
          {["All","Gainers","Losers","Favorites"].map(item=><button key={item} onClick={()=>setFilter(item)} className={`market-filter-chip ${filter===item?"market-filter-active":""}`}>{item}</button>)}
        </div>
        <MarketSectionTitle title="Live Market" meta={`${list.length} pairs`}/>
        <div className="space-y-2">
          {list.map(c=><MarketLiveRow key={c.symbol} coin={c} localCurrency={localCurrency} onTrade={()=>openTrade(c)}/>)}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-3 min-[390px]:grid-cols-2">
        <MovementPanel title="Top Gainers" coins={gainers} tone="gain"/>
        <MovementPanel title="Top Losers" coins={losers.length?losers:marketCoins.slice(0,5).map(coin=>({...coin,change:-Math.abs(coin.change || .8)}))} tone="loss"/>
      </div>

      <CategoryChips/>
    </div>
  </div>;
}

function TradeWorkspace({category}:{category:TradeCategory}) {
  return <div className="space-y-5"><div><h2 className="text-2xl font-black">Trade</h2></div><TradingCategoryPage category={category==="copy"?"spot":category}/></div>;
}

function AiCopyTradePage({currentUser,subscription,activeTrade,bitexBalance,tradeRows,startTrade,completeTrade,purchaseAi,openLogin}:{currentUser:CurrentUser|null;subscription:AiSubscriptionStatus|null;activeTrade:ActiveCopyTrade|null;bitexBalance:number;tradeRows:VipTradeRow[];startTrade:(rowId:string)=>Promise<{ok:boolean;message:string}>;completeTrade:()=>void;purchaseAi:()=>Promise<{ok:boolean;message:string}>;openLogin:()=>void}) {
  return <div className="space-y-5"><div><h2 className="text-2xl font-black">AI</h2></div><CandlestickChart/><AiPurchaseCard currentUser={currentUser} status={subscription} purchaseAi={purchaseAi} openLogin={openLogin}/><CopyTradeScreen activeTrade={activeTrade} bitexBalance={bitexBalance} tradeRows={tradeRows} startTrade={startTrade} completeTrade={completeTrade}/></div>;
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

function CopyTradeScreen({activeTrade,bitexBalance,tradeRows,startTrade,completeTrade}:{activeTrade:ActiveCopyTrade|null;bitexBalance:number;tradeRows:VipTradeRow[];startTrade:(rowId:string)=>Promise<{ok:boolean;message:string}>;completeTrade:()=>void}) {
  const [error,setError]=useState("");
  const [loadingRow,setLoadingRow]=useState("");
  const rows=tradeRows.length?tradeRows:[];
  const start=async(row:VipTradeRow)=>{
    setError("");
    if(!row.available){setError("Trade not available.");return;}
    if(!row.eligible){setError("You are not eligible for this trade.");return;}
    setLoadingRow(row.id);
    const result=await startTrade(row.id);
    setLoadingRow("");
    if(!result.ok){setError(result.message);return;}
    setError("");
  };
  return <div className="space-y-5"><section className={`${card} overflow-hidden`}><div className="flex items-center justify-between border-b border-line px-5 py-4"><h3 className="font-bold">Copy Trade Income</h3><ShieldCheck size={20} className="text-lime"/></div>{activeTrade?<div className="p-4 sm:p-5"><TradeActiveCard onClick={()=>{}} trade={activeTrade} previewAmount={activeTrade.amount}/></div>:<div className="divide-y divide-line/70">{rows.map(row=>{const status=row.tradeStatus??(row.available?"Live":"Closed");return <div key={row.id} className="flex items-center gap-3 px-4 py-4 sm:px-5"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-lime/10 text-lime"><LineChart size={18}/></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-black">{row.label}</p><span className={`rounded-full px-2 py-0.5 text-[9px] font-black ${status==="Live"?"bg-lime/10 text-lime":status==="Upcoming"?"bg-[#f6c85f]/10 text-[#f6c85f]":"bg-white/5 text-slate-500"}`}>{status}</span></div><p className="mt-1 text-[10px] text-slate-500">Trade time: {row.currentTradeTime??"--:--"} UTC</p><p className="mt-1 text-[10px] text-slate-500">Trade amount: ${Number(row.tradeAmount ?? bitexBalance*.01).toFixed(2)} | Daily {row.dailyPercentMin}% - {row.dailyPercentMax}%</p>{!row.available&&<p className="mt-1 text-[10px] text-danger">Trade not available.</p>}</div><button onClick={()=>start(row)} disabled={loadingRow===row.id} className="shrink-0 rounded-lg bg-lime px-4 py-2 text-xs font-black text-ink disabled:opacity-50">{loadingRow===row.id?"Wait":"Trade"}</button></div>})}</div>}{error&&<p className="border-t border-line px-5 py-3 text-xs text-danger">{error}</p>}</section></div>;
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
  const [fullName,setFullName]=useState(user?.name?.trim() ?? "");
  const [dateOfBirth,setDateOfBirth]=useState("");
  const [country,setCountry]=useState(user?.country?.trim() ?? "");
  const [address,setAddress]=useState("");
  const [governmentIdType,setGovernmentIdType]=useState("Aadhaar Card");
  const [governmentIdNumber,setGovernmentIdNumber]=useState("");
  const [frontIdImageUrl,setFrontIdImageUrl]=useState("");
  const [backIdImageUrl,setBackIdImageUrl]=useState("");
  const [selfieImageUrl,setSelfieImageUrl]=useState("");
  const [kyc,setKyc]=useState<KycSnapshot|null>(null);
  const [error,setError]=useState("");
  const [loading,setLoading]=useState(false);
  useEffect(()=>{let active=true;if(!user){setKyc(null);return;}fetch("/api/kyc").then(response=>response.ok?response.json():Promise.reject()).then(data=>{if(!active)return;const snapshot=data as KycSnapshot;setKyc(snapshot);const request=snapshot.request;if(request){setFullName(request.fullName??"");setDateOfBirth(request.dateOfBirth??"");setCountry(request.country??user.country??"");setAddress(request.address??"");setGovernmentIdType(request.governmentIdType??"Aadhaar Card");setGovernmentIdNumber(request.governmentIdNumber??"");setFrontIdImageUrl(request.frontIdImageUrl??"");setBackIdImageUrl(request.backIdImageUrl??"");setSelfieImageUrl(request.selfieImageUrl??"");}}).catch(()=>{if(active)setKyc(null);});return()=>{active=false};},[user]);
  const locked=kyc?.status==="APPROVED"||kyc?.status==="PENDING";
  const submit=async()=>{setError("");if(!user){setError("Login required");notify("Login required");return;}if(locked){setError(kyc?.status==="APPROVED"?"Verification is already approved":"Verification request is pending");return;}if(!fullName.trim()||!dateOfBirth.trim()||!country.trim()||!address.trim()||!governmentIdNumber.trim()||!frontIdImageUrl.trim()||!backIdImageUrl.trim()||!selfieImageUrl.trim()){setError("Complete all verification fields");return;}setLoading(true);const response=await fetch("/api/kyc",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({fullName,dateOfBirth,country,address,governmentIdType,governmentIdNumber,frontIdImageUrl,backIdImageUrl,selfieImageUrl})});const data=await response.json().catch(()=>({}));setLoading(false);if(!response.ok){setError(data.error||"Verification request failed");return;}notify("Verification request submitted");close();};
  return (
    <div className="fixed inset-0 z-[80] grid place-items-end bg-black/70 backdrop-blur-sm sm:place-items-center sm:p-4">
      <div className="w-full max-w-md rounded-t-3xl border border-line bg-[#111c18] p-6 sm:rounded-3xl">
        <div className="flex items-start justify-between"><div><h3 className="text-xl font-black">Verification Request</h3><p className="mt-1 text-xs text-slate-500">Submit identity details for review.</p></div><button onClick={close}><X/></button></div>
        {kyc&&<div className="mt-4 rounded-xl border border-line bg-ink/70 p-3 text-xs text-slate-400">Status: <span className="font-bold text-lime">{kyc.status}</span>{kyc.request?.rejectionReason&&<span> · {kyc.request.rejectionReason}</span>}</div>}
        <div className="mt-5 max-h-[62vh] space-y-4 overflow-y-auto pr-1">
          <FormField label="Full name" value={fullName} onChange={setFullName} readOnly={locked}/>
          <FormField label="Date of birth" value={dateOfBirth} onChange={setDateOfBirth} placeholder="YYYY-MM-DD" readOnly={locked}/>
          <FormField label="Country" value={country} onChange={setCountry} readOnly={locked}/>
          <FormField label="Address" value={address} onChange={setAddress} readOnly={locked}/>
          <label className="block text-xs font-bold text-slate-400">UID<input value={user?.uid?.trim() || "Unavailable"} readOnly className="mt-2 w-full rounded-xl border border-line bg-ink/70 p-3 text-slate-500 outline-none"/></label>
          <label className="block text-xs font-bold text-slate-400">Government ID type<select value={governmentIdType} disabled={locked} onChange={e=>setGovernmentIdType(e.target.value)} className="mt-2 w-full rounded-xl border border-line bg-ink p-3 text-white disabled:text-slate-500"><option>Aadhaar Card</option><option>PAN Card</option><option>Passport</option><option>Driving License</option></select></label>
          <FormField label="Government ID number" value={governmentIdNumber} onChange={setGovernmentIdNumber} placeholder="Enter document number" readOnly={locked}/>
          <FormField label="Front ID image URL" value={frontIdImageUrl} onChange={setFrontIdImageUrl} placeholder="https://..." readOnly={locked}/>
          <FormField label="Back ID image URL" value={backIdImageUrl} onChange={setBackIdImageUrl} placeholder="https://..." readOnly={locked}/>
          <FormField label="Selfie image URL" value={selfieImageUrl} onChange={setSelfieImageUrl} placeholder="https://..." readOnly={locked}/>
        </div>
        {error&&<p className="mt-3 text-xs text-danger">{error}</p>}
        <button onClick={submit} disabled={loading||locked} className="mt-6 w-full rounded-xl bg-lime py-3.5 text-sm font-black text-ink disabled:opacity-60">{loading?"Submitting...":locked?kyc?.status==="APPROVED"?"Approved":"Pending review":"Submit request"}</button>
      </div>
    </div>
  );
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

function FormField({label,value,onChange,placeholder,readOnly}:{label:string;value:string;onChange:(value:string)=>void;placeholder?:string;readOnly?:boolean}) { return <label className="block text-xs font-bold text-slate-400">{label}<input value={value} readOnly={readOnly} onChange={e=>onChange(e.target.value)} placeholder={placeholder} className="mt-2 w-full rounded-xl border border-line bg-ink p-3 text-white outline-none focus:border-lime/50 read-only:text-slate-500"/></label> }

function LineItem({label,value}:{label:string;value:string}) { return <div className="flex justify-between text-xs"><span className="text-slate-500">{label}</span><span className="font-bold">{value}</span></div> }


function Stat({label,value,trend}:{label:string;value:string;trend?:string}) { return <div className="rounded-xl border border-line bg-ink/50 p-3"><p className="text-[10px] text-slate-500">{label}</p><div className="mt-1 flex items-end gap-1"><p className="font-black">{value}</p>{trend&&<span className="text-[9px] text-mint">{trend}</span>}</div></div> }




