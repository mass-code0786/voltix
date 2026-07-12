"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import {
  ArrowDownLeft, ArrowDownToLine, ArrowLeftRight, ArrowUpRight, BarChart3, Bell,
  Bot, CheckCircle2, ChevronDown, ChevronRight, CircleDollarSign, Copy, Eye, EyeOff, FileClock, FileText, Grid2X2,
  Headphones, Home, Landmark, LineChart, Menu, Network, Plus, QrCode, Search, SlidersHorizontal,
  Send, Settings, Share2, ShieldCheck, Star,
  Trophy, Users, Wallet, X, Zap,
} from "lucide-react";
import { CoinMark } from "./coin-mark";
import { Sparkline } from "./sparkline";
import { CandlestickChart } from "./candlestick-chart";
import { OrderBookPanel } from "./order-book";
import { buildReferralLink, getClientAppOrigin } from "@/lib/app-url";
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
import type { Coin } from "@/lib/market-defaults";
import { compact, usd } from "@/lib/format";
import { useLiveTickers } from "@/lib/use-market-data";
import { getLedgerDisplay } from "@/lib/ledger-display";
import { clearPostLoginSplashFlags } from "@/components/app-launch-splash";
import { getVipIconPath } from "@/lib/vip-icons";
import { ManualTradeWizard } from "@/components/manual-trade-wizard";
import { currencyConfigForCountry, formatLocalCurrency } from "@/lib/local-currency";
import { getTranslator } from "@/lib/i18n";
import { getKycDocumentTypes, kycDocumentRequiresBackPhoto } from "@/lib/kyc-document-types";
import { displayWalletName } from "@/lib/wallet-labels";
import { TransactionPinInput } from "./transaction-pin-input";
import { clearMobileNativeSession, hapticNotification, nativeShareReferral, requestMobileTransactionToken } from "@/lib/mobile-native";
import { VerificationRequiredDialog } from "@/components/verification-required-dialog";

type Tab = "home" | "markets" | "trade" | "aiTrade" | "team" | "wallet";
type MobileNavTab = Tab | "profile";
type TradeCategory = "spot" | "futures" | "grid" | "margin" | "copy";
type WalletSection = "overview" | "assets" | "ledger";
type WalletAction = "deposit" | null;
type UserWallet = "SPOT" | "FUTURES" | "AI";
type WalletActivity = readonly [typeof ArrowDownLeft, string, string, string, string];
type EarlyWithdrawalBreakdown = { requiresConfirmation: boolean; eligible: boolean; capitalAmount: number; earnedProfit: number; requiredProfit: number; completedPercentage: number; remainingPercentage: number; withdrawalAmount: number; earlyWithdrawalCharge: number; percentageFee: number; fixedFee: number; totalFees: number; netAmount: number };
type WithdrawalInput = { walletType: "SPOT" | "AI"; amount: number; address: string; network: string; transactionPin: string; mobileVerificationToken?: string; acceptEarlyWithdrawalCharge?: boolean };
type WithdrawalResult = { ok: boolean; message: string; requiresConfirmation?: boolean; breakdown?: EarlyWithdrawalBreakdown };
type DepositInput = { amount: number; network: string; payCurrency: string };
type DepositResult = { id: string; amount: number; asset: string; network: string; networkName: string; providerPaymentId: string | null; providerInvoiceId: string | null; providerPaymentUrl: string | null; payCurrency: string | null; payAddress: string | null; paymentStatus: string | null; actuallyPaid: number | null; outcomeAmount: number | null; status: string; createdAt: string };
type ActiveCopyTrade = { code?: string; rowLabel?: string; amount: number; returnPercent: number; profit: number; remainingTime?: number; status?: string; date?: string };
type CopyTradeHistory = ActiveCopyTrade & { date: string; status: string };
type CopyTradeCounts = { todaysTradeCount: number; dailyTradeLimit: number };
type VipTradeRow = { id: string; label: string; vipRange?: string; vipRanks: string[]; dailyPercentMin: number; dailyPercentMax: number; dailyReturnMin?: number; dailyReturnMax?: number; eligible: boolean; available: boolean; tradeAmount: number; perTradePercent: number; currentTradeTime?: string; tradeStatus?: "UPCOMING" | "LIVE" | "CLOSED"; openTime?: string; closeTime?: string; timezone?: string; secondsUntilOpen?: number; secondsUntilClose?: number; canTrade?: boolean; canTradeWhenLive?: boolean; reason?: string | null; message?: string | null };
type AppCoin = Coin;
type MarketCoin = AppCoin & { volume?: number; quoteVolume?: number; live?: boolean };
type CoinSetting = Partial<Omit<AppCoin,"localLogoPath"|"logoUrl">> & { localLogoPath?: string | null; logoUrl?: string | null };
type CurrentUser = { id?: string | null; uid?: string | null; name?: string | null; email?: string | null; country?: string | null; language?: string | null; vipRank?: string | null; role?: string | null; kycStatus?: "NOT_SUBMITTED" | "PENDING" | "UNDER_REVIEW" | "APPROVED" | "REJECTED" | null };
const BALANCE_VISIBILITY_STORAGE_KEY = "voltix.balanceVisible";
const BALANCE_MASK = "••••••";
type WalletSnapshot = {
  balances?: {
    spot?: number;
    funding?: number;
    futures?: number;
    aiWallet?: number;
  };
  aiWallet?: {
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
    aiWallet?: number;
  };
  locked?: {
    spot?: number;
    futures?: number;
    aiWallet?: number;
  };
  total?: {
    spot?: number;
    futures?: number;
    aiWallet?: number;
  };
  portfolio?: number;
  aiWallet?: {
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
type P2PAsset = Pick<AssetRecord, "symbol" | "name" | "balance" | "enabled">;
type P2PTransferInput = { receiver: string; asset: string; amount: number; note?: string; idempotencyKey: string; transactionPin: string; mobileVerificationToken?: string };
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
  referenceType?: string;
  type?: string;
  source?: string;
};
type TeamMember = {
  id: string;
  uid?: string | null;
  name: string;
  initials: string;
  level: number;
  businessAmount: number;
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
    aiCopyTradingIncome?: number;
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
  status: "NOT_SUBMITTED" | "PENDING" | "UNDER_REVIEW" | "APPROVED" | "REJECTED";
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
  attachmentUrl?: string | null;
  attachmentName?: string | null;
  status: "OPEN" | "PENDING" | "CLOSED";
  adminReply?: string | null;
  createdAt: string;
};
type NotificationItem = {
  id: string;
  type: string;
  title: string;
  message: string;
  metadata?: unknown;
  readAt: string | null;
  createdAt: string;
  unread: boolean;
};

const tabs: { id: Tab; label: string; icon: typeof Home }[] = [
  { id: "home", label: "Home", icon: Home },
  { id: "markets", label: "Markets", icon: BarChart3 },
  { id: "trade", label: "Trade", icon: LineChart },
  { id: "aiTrade", label: "AI", icon: Zap },
  { id: "wallet", label: "Asset", icon: Wallet },
];

const mobileTabs: { id: MobileNavTab; label: string; icon: typeof Home; section?: WalletSection }[] = [
  { id: "home", label: "Home", icon: Home },
  { id: "markets", label: "Markets", icon: BarChart3 },
  { id: "aiTrade", label: "AI Trade", icon: Zap },
  { id: "wallet", label: "Asset", icon: Wallet, section: "overview" },
  { id: "profile", label: "Profile", icon: Settings },
];

const card = "premium-card";
const homeMarketPulseSymbols = ["BTC","ETH","BNB","SOL","SUI","XRP","DOGE","ADA","TRX","AVAX","DOT","LINK","TON","SHIB","LTC","BCH","ATOM","APT","ARB","OP","PEPE","NEAR","INJ","SEI","FIL"];
const emptyAssetTotals: AssetTotals = { available: { spot: 0, futures: 0, aiWallet: 0 }, locked: { spot: 0, futures: 0, aiWallet: 0 }, total: { spot: 0, futures: 0, aiWallet: 0 }, portfolio: 0, aiWallet: { principal: 0, incomeEarned: 0, targetAmount: 0, unlocked: false } };
const defaultCopyTradeCounts: CopyTradeCounts = { todaysTradeCount: 0, dailyTradeLimit: 3 };
const activeAiSubscriptionMessage = "You already have an active AI Subscription. You can buy again after it expires.";

function mergeCoinSettings(baseCoins: AppCoin[], settings: Record<string,CoinSetting>): AppCoin[] {
  const bySymbol = new Map(baseCoins.map(coin => [coin.symbol, coin]));
  const merged = baseCoins.map(coin => {
    const setting=settings[coin.symbol] ?? {};
    if (coin.symbol === "SHINE") return { ...coin, ...setting, localLogoPath: "/shine.png", logoPath: "/shine.png" };
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
      logoUrl: setting.logoUrl ?? null,
      isActive: setting.isActive ?? true,
      displayOrder: setting.displayOrder ?? 9999,
    });
  }
  return merged.sort((a,b)=>(a.displayOrder??9999)-(b.displayOrder??9999));
}

function coinsFromApi(rows: (CoinSetting & { symbol: string })[]): AppCoin[] {
  const settings = Object.fromEntries(rows.map(coin => [coin.symbol, coin])) as Record<string, CoinSetting>;
  return mergeCoinSettings([], settings).map(coin => ({ ...coin, balance: 0 }));
}

function mergeAssetRecords(baseCoins: AppCoin[], assets: AssetRecord[]): AppCoin[] {
  // Futures and AI are separate cards; the holdings list is Spot-only.
  assets = assets.filter(asset => asset.walletType === "SPOT");
  const bySymbol = new Map(baseCoins.map(coin => [coin.symbol, coin]));
  const grouped = new Map<string, AssetRecord>();
  for (const asset of assets) {
    grouped.set(asset.symbol, { ...asset, balance: Number(asset.balance ?? 0) });
  }
  return Array.from(grouped.values()).map((asset, index) => {
    const base = bySymbol.get(asset.symbol);
    const logoPath = assetLogoPath(asset.symbol, base);
    return {
      ...(base ?? {
        symbol: asset.symbol,
        name: asset.name,
        pair: `${asset.symbol}USDT`,
        price: asset.symbol === "USDT" ? 1 : 0,
        change: 0,
        color: "#94a3b8",
        spark: [20,21,20,22,21,23,22,24,23],
        logoPath,
        localLogoPath: logoPath,
        isActive: asset.enabled,
        displayOrder: 9999 + index,
      }),
      name: base?.name ?? asset.name,
      logoPath,
      localLogoPath: logoPath,
      balance: Number(asset.balance ?? 0),
      isActive: asset.enabled,
    };
  }).sort((a,b)=>(a.displayOrder??9999)-(b.displayOrder??9999));
}

function assetLogoPath(symbol: string, base?: AppCoin) {
  const normalized = symbol.toUpperCase();
  if (normalized === "USDT" || normalized === "USDTBEP20" || normalized === "USDTTRC20" || normalized === "USDTERC20") return "/coin-logos/usdt.png";
  if (normalized === "SHINE") return "/shine.png";
  return base?.localLogoPath ?? base?.logoPath ?? `/coin-logos/${symbol.toLowerCase()}.png`;
}

function mapLedgerHistory(rows: WalletHistoryRecord[]): WalletActivity[] {
  return rows.map(row => {
    const display=getLedgerDisplay(row);
    return [
      row.direction === "CREDIT" ? ArrowDownLeft : ArrowUpRight,
      display.title || `${row.walletType} movement`,
      `${row.signedAmount >= 0 ? "+" : "-"}${Math.abs(Number(row.amount)).toFixed(2)} ${row.asset}`,
      display.statusLabel,
      display.dateTimeLabel,
    ] as WalletActivity;
  });
}

export default function AppShell() {
  const [tab, setTab] = useState<Tab>("home");
  const [tradeCategory, setTradeCategory] = useState<TradeCategory>("spot");
  const [walletSection, setWalletSection] = useState<WalletSection>("overview");
  const [walletAction, setWalletAction] = useState<WalletAction>(null);
  const [menu, setMenu] = useState(false);
  const [tradeMenuOpen, setTradeMenuOpen] = useState(false);
  const [balanceVisible, setBalanceVisible] = useState(false);
  const [toast, setToast] = useState("");
  const [activeCopyTrade, setActiveCopyTrade] = useState<ActiveCopyTrade | null>(null);
  const [copyTradeHistory, setCopyTradeHistory] = useState<CopyTradeHistory[]>([]);
  const [copyTradeCounts, setCopyTradeCounts] = useState<CopyTradeCounts>(defaultCopyTradeCounts);
  const [vipTradeRows, setVipTradeRows] = useState<VipTradeRow[]>([]);
  const [marketCoins, setMarketCoins] = useState<AppCoin[]>([]);
  const marketCoinsRef = useRef<AppCoin[]>([]);
  const [marketCoinsLoading, setMarketCoinsLoading] = useState(true);
  const [marketCoinsError, setMarketCoinsError] = useState("");
  const [walletAssets, setWalletAssets] = useState<AppCoin[]>([]);
  const [p2pAssets, setP2PAssets] = useState<P2PAsset[]>([]);
  const [assetTotals, setAssetTotals] = useState<AssetTotals>(emptyAssetTotals);
  const [futuresBalance, setFuturesBalance] = useState(0);
  const [aiWalletBalance, setAiWalletBalance] = useState(0);
  const [aiTradeTransferred, setAiTradeTransferred] = useState(0);
  const [aiTradePrincipalLocked, setAiTradePrincipalLocked] = useState(0);
  const [aiTradeProfitEarned, setAiTradeProfitEarned] = useState(0);
  const [transferOpen, setTransferOpen] = useState<{ from: UserWallet; to: UserWallet } | null>(null);
  const [p2pOpen, setP2POpen] = useState(false);
  const [withdrawalOpen, setWithdrawalOpen] = useState(false);
  const [verificationOpen, setVerificationOpen] = useState(false);
  const [withdrawalVerificationOpen, setWithdrawalVerificationOpen] = useState(false);
  const [logoutInProgress, setLogoutInProgress] = useState(false);
  const logoutInProgressRef = useRef(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [dashboard, setDashboard] = useState<DashboardSnapshot | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [walletLoading, setWalletLoading] = useState(true);
  const [walletRefreshing, setWalletRefreshing] = useState(false);
  const dashboardRequestRef = useRef(0);
  const walletRequestRef = useRef(0);
  const walletAbortRef = useRef<AbortController | null>(null);
  const walletLoadedRef = useRef(false);
  const walletManualRefreshRef = useRef(false);
  const [aiSubscription, setAiSubscription] = useState<AiSubscriptionStatus | null>(null);
  const [aiPurchaseConfirmOpen, setAiPurchaseConfirmOpen] = useState(false);
  const aiPurchaseConfirmationRef = useRef<((confirmed: boolean) => void) | null>(null);
  const [walletActivity, setWalletActivity] = useState<WalletActivity[]>([]);
  const [userCountry, setUserCountry] = useState("United States");
  const [userLanguage, setUserLanguage] = useState("en");
  const t = useMemo(() => getTranslator(userLanguage), [userLanguage]);

  useEffect(() => {
    marketCoinsRef.current = marketCoins;
  }, [marketCoins]);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(BALANCE_VISIBILITY_STORAGE_KEY);
      setBalanceVisible(stored !== "hidden");
    } catch {
      setBalanceVisible(true);
    }
  }, []);

  const updateBalanceVisible = useCallback((visible: boolean) => {
    setBalanceVisible(visible);
    try {
      window.localStorage.setItem(BALANCE_VISIBILITY_STORAGE_KEY, visible ? "visible" : "hidden");
    } catch {}
  }, []);
  const tabLabel = useCallback((id: Tab) => t(id === "aiTrade" ? "ai" : id === "wallet" ? "asset" : id), [t]);
  const isAdminUser = currentUser?.role === "ADMIN" || currentUser?.role === "SUPER_ADMIN";

  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
  };

  const requestAiPurchaseConfirmation = useCallback(() => new Promise<boolean>((resolve) => {
    aiPurchaseConfirmationRef.current = resolve;
    setAiPurchaseConfirmOpen(true);
  }), []);

  const resolveAiPurchaseConfirmation = useCallback((confirmed: boolean) => {
    aiPurchaseConfirmationRef.current?.(confirmed);
    aiPurchaseConfirmationRef.current = null;
    setAiPurchaseConfirmOpen(false);
  }, []);

  const applyAuthenticatedUser = useCallback((user: CurrentUser | null) => {
    setCurrentUser(user);
    if (user?.country?.trim()) setUserCountry(user.country);
    setUserLanguage(user?.language?.trim() || "en");
  }, []);

  const refreshMe = useCallback(async () => {
    const response = await fetch("/api/me", { cache: "no-store", credentials: "include" });
    const data = await response.json();
    const user = data?.authenticated ? data.user as CurrentUser : null;
    applyAuthenticatedUser(user);
    return user;
  }, [applyAuthenticatedUser]);

  const refreshDashboard = useCallback(async (user: CurrentUser | null) => {
    const requestId = ++dashboardRequestRef.current;
    setDashboardLoading(Boolean(user));
    if (!user) {
      setDashboard(null);
      setDashboardLoading(false);
      return;
    }
    const response = await fetch("/api/dashboard", { cache: "no-store", credentials: "include" });
    if (!response.ok) throw new Error("Dashboard request failed");
    const data = await response.json();
    if (requestId !== dashboardRequestRef.current) return;
    setDashboard(data?.authenticated ? data.dashboard as DashboardSnapshot : null);
    setDashboardLoading(false);
  }, []);

  const refreshCopyTradeStatus = useCallback(async (user: CurrentUser | null) => {
    if (!user) {
      setActiveCopyTrade(null);
      setCopyTradeHistory([]);
      setVipTradeRows([]);
      setCopyTradeCounts(defaultCopyTradeCounts);
      return;
    }
    const response = await fetch("/api/copy-trade/status", { cache: "no-store", credentials: "include" });
    if (!response.ok) throw new Error("Copy trade status request failed");
    const data = await response.json();
    const status = data?.status;
    setActiveCopyTrade(status?.activeTrade ? normalizeTrade(status.activeTrade) : null);
    setCopyTradeHistory(Array.isArray(status?.history) ? status.history.map(normalizeTrade) : []);
    setVipTradeRows(Array.isArray(status?.tradeRows) ? status.tradeRows as VipTradeRow[] : []);
    setCopyTradeCounts({
      todaysTradeCount: Math.max(0, Number(status?.todaysTradeCount ?? 0)),
      dailyTradeLimit: Math.max(0, Number(status?.dailyTradeLimit ?? defaultCopyTradeCounts.dailyTradeLimit)),
    });
  }, []);

  const refreshAiSubscription = useCallback(async (user: CurrentUser | null) => {
    if (!user) {
      setAiSubscription(null);
      return null;
    }
    const response = await fetch("/api/ai/subscription", { cache: "no-store", credentials: "include" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "AI request failed");
    const status = data as AiSubscriptionStatus;
    setAiSubscription(status);
    return status;
  }, []);

  const refreshAssets = useCallback(async (user: CurrentUser | null) => {
    const requestId = ++walletRequestRef.current;
    walletAbortRef.current?.abort();
    const controller = new AbortController();
    walletAbortRef.current = controller;
    if (user && !walletLoadedRef.current) setWalletLoading(true);
    if (!user) {
      setWalletAssets([]);
      setP2PAssets([]);
      setAssetTotals(emptyAssetTotals);
      setWalletActivity([]);
      setFuturesBalance(0);
      setAiWalletBalance(0);
      setWalletLoading(false);
      walletLoadedRef.current = false;
      return;
    }
    try {
      const response = await fetch("/api/assets", { cache: "no-store", credentials: "include", signal: controller.signal });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Assets request failed");
      const assets = Array.isArray(data.assets) ? data.assets as AssetRecord[] : [];
      const totals = data.totals as AssetTotals;
      const history = Array.isArray(data.history) ? data.history as WalletHistoryRecord[] : [];
      if (requestId !== walletRequestRef.current || controller.signal.aborted) return;
      setWalletAssets(mergeAssetRecords(marketCoinsRef.current, assets));
      setP2PAssets(assets.filter(asset => asset.walletType === "SPOT" && asset.enabled && Number(asset.balance ?? 0) > 0).map(asset => ({ symbol: asset.symbol, name: asset.name, balance: Number(asset.balance ?? 0), enabled: asset.enabled })));
      setAssetTotals(totals ?? emptyAssetTotals);
      setFuturesBalance(Number(totals?.total?.futures ?? 0));
      setAiWalletBalance(Number(totals?.total?.aiWallet ?? 0));
      setAiTradeTransferred(Number(totals?.aiWallet?.principal ?? 0));
      setAiTradePrincipalLocked(Number(totals?.aiWallet?.principal ?? 0));
      setAiTradeProfitEarned(Number(totals?.aiWallet?.incomeEarned ?? 0));
      setWalletActivity(mapLedgerHistory(history));
      walletLoadedRef.current = true;
    } finally {
      if (requestId === walletRequestRef.current) setWalletLoading(false);
    }
  }, []);

  const refreshNotifications = useCallback(async (user: CurrentUser | null) => {
    if (!user) {
      setNotifications([]);
      setUnreadNotifications(0);
      setNotificationOpen(false);
      return;
    }
    const response = await fetch("/api/notifications", { cache: "no-store", credentials: "include" });
    if (!response.ok) throw new Error("Notifications request failed");
    const data = await response.json();
    setNotifications(Array.isArray(data.notifications) ? data.notifications as NotificationItem[] : []);
    setUnreadNotifications(Number(data.unreadCount ?? 0));
  }, []);

  const clearAuthenticatedState = useCallback(() => {
    applyAuthenticatedUser(null);
    setDashboard(null);
    walletRequestRef.current += 1;
    walletAbortRef.current?.abort();
    setWalletLoading(false);
    setWalletRefreshing(false);
    walletLoadedRef.current = false;
    walletManualRefreshRef.current = false;
    setDashboardLoading(false);
    setFuturesBalance(0);
    setAiWalletBalance(0);
    setWalletAssets([]);
    setP2PAssets([]);
    setAssetTotals(emptyAssetTotals);
    setWalletActivity([]);
    setActiveCopyTrade(null);
    setCopyTradeHistory([]);
    setVipTradeRows([]);
    setCopyTradeCounts(defaultCopyTradeCounts);
    setAiSubscription(null);
    setNotifications([]);
    setUnreadNotifications(0);
    setNotificationOpen(false);
    setTransferOpen(null);
    setWithdrawalOpen(false);
    setVerificationOpen(false);
  }, [applyAuthenticatedUser]);

  const logout = useCallback(async () => {
    if (logoutInProgressRef.current) return;
    logoutInProgressRef.current = true;
    setLogoutInProgress(true);
    try {
      const response = await fetch("/api/auth/logout", { method: "POST", credentials: "include", cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Logout failed");
      await clearMobileNativeSession();
      clearPostLoginSplashFlags();
      clearAuthenticatedState();
      setMenu(false);
      window.location.replace("/auth?mode=login&returnTo=%2Fdashboard");
    } catch {
      notify("Unable to sign out. Please check your connection and try again.");
      logoutInProgressRef.current = false;
      setLogoutInProgress(false);
    }
  }, [clearAuthenticatedState]);

  const openAuthPage = useCallback((mode: "login" | "register" = "login") => {
    const returnTo = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    window.location.href = `/auth?mode=${mode}&returnTo=${encodeURIComponent(returnTo)}`;
  }, []);

  useEffect(() => {
    setMarketCoinsLoading(true);
    setMarketCoinsError("");
    fetch("/api/coins")
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(data => {
        if (!Array.isArray(data.coins) || !data.coins.length) {
          setMarketCoins([]);
          setMarketCoinsError("No market coins available");
          return;
        }
        setMarketCoins(coinsFromApi(data.coins));
      })
      .catch(() => {
        setMarketCoins([]);
        setMarketCoinsError("Market coins unavailable");
      })
      .finally(() => setMarketCoinsLoading(false));
  }, []);

  useEffect(() => {
    refreshMe()
      .catch(() => setUserCountry("United States"));
  }, [refreshMe]);

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
    if (!currentUser) return;
    const timer = window.setInterval(() => {
      refreshCopyTradeStatus(currentUser).catch(() => {});
    }, 20_000);
    return () => window.clearInterval(timer);
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
          setP2PAssets([]);
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

  useEffect(() => {
    if (!currentUser) return;
    const timer = window.setInterval(() => {
      refreshNotifications(currentUser).catch(() => {});
    }, 30000);
    return () => window.clearInterval(timer);
  }, [currentUser, refreshNotifications]);

  useEffect(() => {
    const refresh = () => {
      if (!currentUser) return;
      void Promise.allSettled([
        refreshMe(),
        refreshDashboard(currentUser),
        refreshCopyTradeStatus(currentUser),
        refreshAiSubscription(currentUser),
        refreshAssets(currentUser),
        refreshNotifications(currentUser),
      ]);
    };
    const reconnect = () => {
      if (!currentUser) return;
      void Promise.allSettled([
        refreshMe(),
        refreshCopyTradeStatus(currentUser),
        refreshAiSubscription(currentUser),
        refreshNotifications(currentUser),
      ]);
    };
    window.addEventListener("voltix:native-refresh", refresh);
    window.addEventListener("voltix:native-reconnect", reconnect);
    return () => {
      window.removeEventListener("voltix:native-refresh", refresh);
      window.removeEventListener("voltix:native-reconnect", reconnect);
    };
  }, [currentUser, refreshAiSubscription, refreshAssets, refreshCopyTradeStatus, refreshDashboard, refreshMe, refreshNotifications]);

  const manualRefreshWallet = useCallback(async () => {
    if (!currentUser || walletManualRefreshRef.current) return;
    walletManualRefreshRef.current = true;
    setWalletRefreshing(true);
    try {
      await Promise.all([refreshAssets(currentUser), refreshDashboard(currentUser)]);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Wallet refresh failed");
    } finally {
      walletManualRefreshRef.current = false;
      setWalletRefreshing(false);
    }
  }, [currentUser, notify, refreshAssets, refreshDashboard]);

  const syncNavigation = useCallback(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedTab = params.get("view");
    const requestedTrade = params.get("trade");
    const requestedSection = params.get("wallet");
    if(requestedTab==="copy"||requestedTab==="aiTrade"||requestedTrade==="copy"){setTab("aiTrade");setTradeCategory("copy");}
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
      setTab("aiTrade");
      updateUrl("aiTrade");
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
    const balances = { SPOT: spotBalance, FUTURES: futuresBalance, AI: aiWalletBalance };
    if (from === "AI" || amount <= 0 || amount > balances[from]) return false;
    const response = await fetch("/api/wallet", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fromWallet: from, toWallet: to, amount }) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      notify(data.error || "Transfer could not be completed");
      return false;
    }
    await Promise.all([refreshAssets(currentUser), refreshDashboard(currentUser)]);
    setTransferOpen(null);
    notify(`Successfully transferred to ${displayWalletName(to)}`);
    return true;
  }, [assetTotals, aiWalletBalance, currentUser, futuresBalance, notify, refreshAssets, refreshDashboard]);

  const createDeposit = useCallback(async ({ amount, network, payCurrency }: DepositInput) => {
    const response = await fetch("/api/deposits/nowpayments/create", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ amount, network, payCurrency }) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return { ok: false, message: data.error || "NOWPayments deposit failed" };
    await refreshAssets(currentUser);
    notify("NOWPayments deposit created");
    return { ok: true, message: "", deposit: data.deposit as DepositResult };
  }, [currentUser, notify, refreshAssets, updateUrl, walletSection]);

  const createWithdrawal = useCallback(async ({ walletType, amount, address, network, transactionPin, mobileVerificationToken, acceptEarlyWithdrawalCharge }: WithdrawalInput): Promise<WithdrawalResult> => {
    const spotBalance = Number(assetTotals.total?.spot ?? 0);
    if (walletType === "SPOT" && (amount <= 0 || amount > spotBalance)) return { ok: false, message: "Insufficient Spot Wallet balance" };
    if (walletType === "AI" && (amount <= 0 || amount > aiWalletBalance)) return { ok: false, message: "Insufficient AI Wallet balance" };
    const requiredProfit = aiTradePrincipalLocked * .6;
    const eligible = walletType !== "AI" || requiredProfit <= 0 || aiTradeProfitEarned >= requiredProfit;
    const fee = walletType === "SPOT" ? 2 + amount * .05 : 2 + amount * .05 + (eligible ? 0 : amount * .2);
    const received = amount - fee;
    if (received <= 0) return { ok: false, message: "Withdrawal amount must exceed the total fee" };
    const response = await fetch("/api/withdrawals", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ walletType, amount, address, network, transactionPin, mobileVerificationToken, acceptEarlyWithdrawalCharge }) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (data.requiresConfirmation) {
        return { ok: false, message: "", requiresConfirmation: true, breakdown: data as EarlyWithdrawalBreakdown };
      }
      hapticNotification("error").catch(() => null);
      return { ok: false, message: data.error || "Withdrawal request failed" };
    }
    await refreshAssets(currentUser);
    notify("Withdrawal request sent to admin");
    hapticNotification("success").catch(() => null);
    setWithdrawalOpen(false);
    return { ok: true, message: "" };
  }, [assetTotals, aiWalletBalance, aiTradeProfitEarned, aiTradePrincipalLocked, currentUser, notify, refreshAssets]);

  const sendP2PTransfer = useCallback(async (input: P2PTransferInput) => {
    const response = await fetch("/api/p2p/transfer", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      hapticNotification("error").catch(() => null);
      return { ok: false, message: data.error || "P2P transfer failed" };
    }
    await Promise.all([refreshAssets(currentUser), refreshDashboard(currentUser), refreshNotifications(currentUser)]);
    notify(`${input.amount.toFixed(2)} ${input.asset} sent`);
    hapticNotification("success").catch(() => null);
    return { ok: true, message: "", transfer: data.transfer };
  }, [currentUser, notify, refreshAssets, refreshDashboard, refreshNotifications]);

  const refreshAfterManualTrade = useCallback(async () => {
    await Promise.all([refreshCopyTradeStatus(currentUser), refreshAssets(currentUser)]);
    hapticNotification("success").catch(() => null);
  }, [currentUser, refreshAssets, refreshCopyTradeStatus]);

  const purchaseAi = useCallback(async () => {
    if (!currentUser) {
      openAuthPage("login");
      return { ok: false, message: "Login required" };
    }
    try {
      const latestStatus = await refreshAiSubscription(currentUser);
      if (latestStatus?.subscription?.active) {
        return { ok: false, message: activeAiSubscriptionMessage };
      }
      const confirmed = await requestAiPurchaseConfirmation();
      if (!confirmed) return { ok: true, message: "" };
      const idempotencyKey = crypto.randomUUID();
      const response = await fetch("/api/ai/subscription/purchase", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
        body: JSON.stringify({ idempotencyKey }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 401) openAuthPage("login");
        return { ok: false, message: data.error || "AI purchase failed" };
      }
      await Promise.all([
        refreshAssets(currentUser),
        refreshAiSubscription(currentUser),
        refreshDashboard(currentUser),
        refreshCopyTradeStatus(currentUser),
      ]);
      notify("AI active");
      return { ok: true, message: "" };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : "AI purchase failed" };
    }
  }, [currentUser, notify, openAuthPage, refreshAiSubscription, refreshAssets, refreshCopyTradeStatus, refreshDashboard, requestAiPurchaseConfirmation]);

  const completeActiveCopyTrade = useCallback(() => {
    refreshCopyTradeStatus(currentUser).catch(() => {});
    refreshAssets(currentUser).catch(() => {});
  }, [currentUser, refreshAssets, refreshCopyTradeStatus]);

  const markNotificationsRead = useCallback(async () => {
    if (!currentUser || !unreadNotifications) return;
    const response = await fetch("/api/notifications/read", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
    const data = await response.json().catch(() => ({}));
    if (response.ok) {
      setUnreadNotifications(Number(data.unreadCount ?? 0));
      setNotifications(current => current.map(notification => ({ ...notification, readAt: notification.readAt ?? new Date().toISOString(), unread: false })));
    }
  }, [currentUser, unreadNotifications]);

  const openWithdrawal = () => {
    if (dashboardLoading) { notify("Checking account verification..."); return; }
    if (!currentUser) { openAuthPage("login"); return; }
    if (currentUser.kycStatus !== "APPROVED") { setWithdrawalVerificationOpen(true); return; }
    window.location.href="/wallet/withdraw";
  };
  const totalBalance = Number(assetTotals.portfolio ?? 0);
  const screen = {
    home: <HomeScreen t={t} currentUser={currentUser} onNavigate={navigate} onOpenAuth={()=>openAuthPage("login")} onOpenWithdrawal={openWithdrawal} onOpenCopyTrade={()=>navigate("aiTrade")} onOpenP2P={()=>currentUser?setP2POpen(true):openAuthPage("login")} assets={marketCoins} dashboard={dashboard} dashboardLoading={dashboardLoading||walletLoading} totalBalance={totalBalance} balanceVisible={balanceVisible} setBalanceVisible={updateBalanceVisible} activeCopyTrade={activeCopyTrade} copyTradeHistory={copyTradeHistory} aiWalletBalance={aiWalletBalance} userCountry={userCountry} aiSubscription={aiSubscription} vipTradeRows={vipTradeRows} onManualTradePlaced={refreshAfterManualTrade} purchaseAi={purchaseAi} notify={notify} />,
    markets: <MarketsScreen t={t} coins={marketCoins} userCountry={userCountry} loading={marketCoinsLoading} error={marketCoinsError} />,
    trade: <TradeWorkspace category={tradeCategory} coins={marketCoins} loading={marketCoinsLoading} error={marketCoinsError} />,
    aiTrade: <AiCopyTradePage currentUser={currentUser} subscription={aiSubscription} activeTrade={activeCopyTrade} aiWalletBalance={aiWalletBalance} tradeRows={vipTradeRows} copyTradeCounts={copyTradeCounts} copyTradeHistory={copyTradeHistory} onManualTradePlaced={refreshAfterManualTrade} completeTrade={completeActiveCopyTrade} purchaseAi={purchaseAi} openLogin={()=>openAuthPage("login")} notify={notify} />,
    team: <TeamScreen notify={notify} currentUser={currentUser} />,
    wallet: <WalletScreen notify={notify} assets={walletAssets} loading={walletLoading} refreshing={walletRefreshing} onRefresh={manualRefreshWallet} totalBalance={totalBalance} spotBalance={Number(assetTotals.total?.spot??0)} futuresBalance={futuresBalance} aiWalletBalance={aiWalletBalance} aiTradeProfitEarned={aiTradeProfitEarned} aiTradeTarget={aiTradePrincipalLocked*.6} activity={walletActivity} section={walletSection} action={walletAction} balanceVisible={balanceVisible} setBalanceVisible={updateBalanceVisible} onSectionChange={changeWalletSection} onOpenTransfer={()=>setTransferOpen({from:"SPOT",to:"FUTURES"})} onOpenWithdrawal={openWithdrawal} onOpenDeposit={() => { window.location.href="/wallet/deposit"; }} onCloseAction={() => { setWalletAction(null); updateUrl("wallet", walletSection, null, true); }} onCreateDeposit={createDeposit} />,
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
            variant="default"
            onBack={() => selectTab("home")}
            onMenuButton={() => { setMenu(!menu); setNotificationOpen(false); }}
            onNotifications={() => { if (!currentUser) { openAuthPage("login"); return; } setNotificationOpen(value => !value); setMenu(false); refreshNotifications(currentUser).catch(() => {}); }}
            onMenu={() => { setMenu(!menu); setNotificationOpen(false); }}
          />
          {notificationOpen && <NotificationMenu close={() => setNotificationOpen(false)} notifications={notifications} unreadCount={unreadNotifications} markRead={markNotificationsRead} />}
          {menu && <ProfileMenu close={() => setMenu(false)} notify={notify} user={currentUser} openLogin={()=>{setMenu(false);openAuthPage("login");}} openRegister={()=>{setMenu(false);openAuthPage("register");}} logout={logout} logoutInProgress={logoutInProgress} openVerification={()=>{setMenu(false);if(!currentUser){openAuthPage("login");return;}setVerificationOpen(true);}} openHelp={()=>{setMenu(false);setHelpOpen(true);}} />}
          <div className={`mx-auto ${tab === "wallet" ? "max-w-[430px] px-0" : "max-w-[420px] px-4"} lg:max-w-6xl lg:px-8 ${tab === "home" ? "pb-20 pt-1 lg:pb-8 lg:pt-1" : tab === "aiTrade" || tab === "markets" ? "pb-36 pt-1 lg:py-8" : tab === "wallet" ? "pb-44 pt-1 lg:py-8" : "pb-20 pt-2.5 lg:py-8"}`}>{screen}</div>
        </main>
      </div>

      <BottomNav items={mobileTabs} activeId={tab} activeSection={walletSection} labelFor={(id) => id === "profile" ? "Profile" : id === "aiTrade" ? "AI Trade" : id === "wallet" ? "Wallet" : tabLabel(id)} onSelect={(id, section) => { if (id === "profile") { window.location.href = "/profile"; return; } selectTab(id, section as WalletSection | undefined); }} />
      {tradeMenuOpen&&<TradeMenu close={()=>setTradeMenuOpen(false)} select={openTrade}/>} 
      {transferOpen&&<WalletTransferModal initialFrom={transferOpen.from} initialTo={transferOpen.to} balances={{SPOT:Number(assetTotals.total?.spot??0),FUTURES:futuresBalance,AI:aiWalletBalance}} close={()=>setTransferOpen(null)} transfer={transferWallet}/>}
      {p2pOpen&&<P2PTransferModal assets={p2pAssets} close={()=>setP2POpen(false)} sendTransfer={sendP2PTransfer}/>}
      {verificationOpen&&<VerificationRequestModal close={()=>setVerificationOpen(false)} notify={notify} user={currentUser}/>} 
      <VerificationRequiredDialog open={withdrawalVerificationOpen} onCancel={()=>setWithdrawalVerificationOpen(false)} onComplete={()=>{window.location.href="/kyc";}}/>
      {helpOpen&&<HelpCenterModal close={()=>setHelpOpen(false)} notify={notify}/>} 
      {aiPurchaseConfirmOpen&&<AiSubscriptionConfirmDialog confirm={()=>resolveAiPurchaseConfirmation(true)} cancel={()=>resolveAiPurchaseConfirmation(false)} />}
      {toast && <div className="fixed left-1/2 z-[60] max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-2xl border border-lime/20 bg-[#17231e] px-4 py-3 text-center text-xs font-bold leading-5 text-white shadow-2xl [bottom:calc(96px+16px+env(safe-area-inset-bottom))] sm:max-w-[24rem] lg:bottom-8">{toast}</div>}
    </div>
  );
}

function Brand({ compact = false }: { compact?: boolean }) {
  return <img src="/logo.png" alt="VOLTIX" className={`${compact ? "h-[28px]" : "h-[34px]"} block w-auto object-contain opacity-100 mix-blend-normal filter-none transform-none`} />;
}

function AiSubscriptionConfirmDialog({ confirm, cancel }: { confirm: () => void; cancel: () => void }) {
  return <><button aria-label="Cancel AI subscription purchase" onClick={cancel} className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm" /><div className="fixed left-1/2 top-1/2 z-[80] w-[min(22rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-[#18ff8a]/20 bg-[#09120f] p-4 shadow-2xl">
    <div className="grid h-11 w-11 place-items-center rounded-xl border border-[#18ff8a]/20 bg-[#18ff8a]/10 text-[#18ff8a]"><Bot size={19}/></div>
    <h2 className="mt-4 text-lg font-black text-white">AI Subscription</h2>
    <p className="mt-2 text-sm font-semibold leading-6 text-slate-300">Do you want to buy AI Subscription for $15 for 30 days?</p>
    <div className="mt-5 grid grid-cols-2 gap-2">
      <button onClick={cancel} className="rounded-xl border border-white/[.08] bg-black/25 py-3 text-xs font-black text-slate-300">Cancel</button>
      <button onClick={confirm} className="rounded-xl bg-[#18ff8a] py-3 text-xs font-black text-[#050608]">Confirm</button>
    </div>
  </div></>;
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
  return <><button aria-label="Close notifications" onClick={close} className="fixed inset-0 z-30 bg-black/30" /><div className="fixed right-4 top-16 z-40 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-line bg-[#111c18] shadow-2xl"><div className="flex items-center justify-between border-b border-line p-4"><div><p className="font-bold">Notifications</p><p className="mt-1 text-[10px] text-slate-500">{unreadCount ? `${unreadCount} unread` : "All caught up"}</p></div>{unreadCount > 0 && <button onClick={markRead} className="rounded-lg border border-line px-3 py-1.5 text-[10px] font-bold text-lime hover:bg-white/5">Mark read</button>}</div><div className="max-h-[60vh] overflow-y-auto p-2">{notifications.length ? notifications.map(notification => { const target=notificationTarget(notification); return <div key={notification.id} onClick={()=>{if(target){close();window.location.href=target;}}} className={`rounded-xl p-3 ${target?"cursor-pointer":""} ${notification.unread ? "bg-lime/[.06]" : "hover:bg-white/[.03]"}`}><div className="flex items-start gap-3"><span className={`mt-1 h-2 w-2 rounded-full ${notification.unread ? "bg-lime" : "bg-slate-700"}`} /><div className="min-w-0 flex-1"><p className="text-sm font-bold text-white">{notification.title}</p><p className="mt-1 text-xs leading-5 text-slate-400">{notification.message}</p><p className="mt-2 text-[10px] text-slate-600">{new Date(notification.createdAt).toLocaleString()}</p></div></div></div>}) : <p className="p-8 text-center text-xs text-slate-500">No records available</p>}</div></div></>;
}

function notificationTarget(notification: NotificationItem) {
  const metadata = notification.metadata;
  if (metadata && typeof metadata === "object" && !Array.isArray(metadata) && "href" in metadata && typeof metadata.href === "string") return metadata.href;
  return notification.type === "KYC_STATUS" ? "/kyc" : null;
}

function ProfileMenu({ close,notify,user,openLogin,openRegister,logout,logoutInProgress,openVerification,openHelp }: { close: () => void;notify:(message:string)=>void;user:CurrentUser|null;openLogin:()=>void;openRegister:()=>void;logout:()=>Promise<void>;logoutInProgress:boolean;openVerification:()=>void;openHelp:()=>void }) {
  const uid=user?.uid?.trim();
  const isAdminUser = user?.role === "ADMIN" || user?.role === "SUPER_ADMIN";
  const copyUid=()=>{if(!uid){notify("UID unavailable");return;}navigator.clipboard?.writeText(uid);notify("UID copied");};
  return <><button aria-label="Close menu" onClick={close} className="fixed inset-0 z-30 bg-black/30" /><div className="fixed right-4 top-16 z-40 w-72 rounded-2xl border border-line bg-[#111c18] p-3 shadow-2xl"><div className="border-b border-line p-3"><p className="font-bold">{user?.name?.trim() || "Account"}</p><div className="mt-1 flex items-center gap-2 text-xs text-slate-500"><span>{uid?`UID ${uid}`:"Not logged in"}</span>{uid&&<button onClick={copyUid} aria-label="Copy UID" className="rounded p-1 text-slate-400 hover:bg-white/5 hover:text-lime"><Copy size={13}/></button>}<span>· {user?.vipRank || "Pro"} member</span></div></div>{user?<><Link href="/profile" onClick={close} className="mt-2 flex w-full items-center gap-3 rounded-xl p-3 text-sm text-slate-300 hover:bg-white/5"><Settings size={17}/> Profile & Settings</Link><button onClick={logout} disabled={logoutInProgress} className="flex w-full items-center gap-3 rounded-xl p-3 text-sm text-slate-300 hover:bg-white/5 disabled:opacity-50"><ShieldCheck size={17}/> {logoutInProgress?"Logging out...":"Logout"}</button></>:<><button onClick={openLogin} className="mt-2 flex w-full items-center gap-3 rounded-xl p-3 text-sm text-slate-300 hover:bg-white/5"><ShieldCheck size={17}/> Login</button><button onClick={openRegister} className="flex w-full items-center gap-3 rounded-xl p-3 text-sm text-slate-300 hover:bg-white/5"><Users size={17}/> Register</button></>}<button onClick={openVerification} className="flex w-full items-center gap-3 rounded-xl p-3 text-sm text-slate-300 hover:bg-white/5"><ShieldCheck size={17}/> Verification Request</button><button onClick={openHelp} className="flex w-full items-center gap-3 rounded-xl p-3 text-sm text-slate-300 hover:bg-white/5"><Headphones size={17}/> Help Center</button>{isAdminUser && <Link href="/admin" className="flex items-center gap-3 rounded-xl p-3 text-sm text-slate-400 hover:bg-white/5"><Settings size={17} /> Admin console</Link>}</div></>;
}

function HomeScreen({ t, currentUser, onNavigate, onOpenAuth, onOpenWithdrawal, onOpenCopyTrade, onOpenP2P, assets, dashboard, dashboardLoading, totalBalance, balanceVisible, setBalanceVisible, copyTradeHistory, aiWalletBalance, userCountry, aiSubscription, vipTradeRows, onManualTradePlaced, purchaseAi, notify }: { t: ReturnType<typeof getTranslator>; currentUser: CurrentUser | null; onNavigate: (tab: Tab, section?: WalletSection, action?: WalletAction) => void; onOpenAuth: () => void; onOpenWithdrawal: () => void; onOpenCopyTrade: () => void; onOpenP2P: () => void; assets: AppCoin[]; dashboard: DashboardSnapshot | null; dashboardLoading: boolean; totalBalance: number; balanceVisible: boolean; setBalanceVisible: (v: boolean) => void; activeCopyTrade: ActiveCopyTrade | null; copyTradeHistory: CopyTradeHistory[]; aiWalletBalance: number; userCountry: string; aiSubscription: AiSubscriptionStatus | null; vipTradeRows: VipTradeRow[]; onManualTradePlaced: () => void | Promise<void>; purchaseAi: () => Promise<{ok:boolean;message:string}>; notify: (message: string) => void }) {
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
  const pulseCoins=marketPulseAssets.filter(coin=>["BTC","ETH","BNB","SOL"].includes(coin.symbol)).slice(0,4);
  const shortcuts: { icon: typeof Home; label: string; onClick: () => void }[] = [
    { icon: ArrowDownToLine, label: "Deposit", onClick: () => { window.location.href = "/wallet/deposit"; } },
    { icon: Send, label: "Withdraw", onClick: onOpenWithdrawal },
    { icon: Send, label: "P2P", onClick: onOpenP2P },
    { icon: Users, label: "Invite", onClick: () => onNavigate("team") },
  ];
  return <div className="mx-auto max-w-[390px] space-y-2 overflow-x-hidden">
    {currentUser && dashboardLoading ? <BalanceLoadingCard /> : currentUser ? (
      <VoltixPortfolioHero
        currentUser={currentUser}
        total={totalBalance}
        todaysProfit={todaysProfit}
        balanceVisible={balanceVisible}
        setBalanceVisible={setBalanceVisible}
      />
    ) : <WelcomeCard t={t} onOpenAuth={onOpenAuth} />}

    <div className="grid grid-cols-4 gap-2">
      {shortcuts.map(({icon:Icon,label,onClick}) => <HomeActionTile key={label} icon={Icon} label={label} onClick={onClick} />)}
    </div>

    <AiOverviewCard balanceVisible={balanceVisible} />
    <VipTradeRowsCard rows={vipTradeRows} onTradePlaced={onManualTradePlaced} />
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
function BalanceLoadingCard() { return <GlassCard className="home-hero-card relative h-[158px] overflow-hidden rounded-[21px] p-4" aria-busy="true"><div className="h-full animate-pulse space-y-3"><div className="h-3 w-24 rounded bg-white/10"/><div className="h-5 w-40 rounded bg-white/10"/><div className="mt-6 h-8 w-44 rounded bg-[#18ff8a]/10"/></div></GlassCard>; }
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
  const kycApproved = currentUser.kycStatus === "APPROVED";
  return <GlassCard className="home-hero-card relative h-[158px] overflow-hidden rounded-[21px] p-4">
    <div className="relative grid h-full grid-cols-[minmax(0,1fr)_108px] items-center gap-1">
      <div className="min-w-0">
        <p className="text-[12px] font-semibold text-slate-400">Welcome Back,</p>
        <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-1.5 pr-1">
          <h2 className="max-w-full text-[19px] font-bold leading-tight text-white">{currentUser.name?.trim() || "Voltix User"}</h2>
          {kycApproved&&<CheckCircle2 size={14} className="shrink-0 text-[#18ff8a]" fill="rgba(24,255,138,.18)" aria-label="Verified account" role="img"/>}
          <span className="flex h-6 shrink-0 items-center gap-0.5 rounded-full border border-[#18ff8a]/30 bg-[#18ff8a]/10 px-1 pr-1.5 text-[8px] font-black text-[#c9ffe4]"><img src={getVipIconPath(currentUser.vipRank)} alt={`${currentUser.vipRank || "VIP 0"} badge`} className="h-5 w-5 object-contain"/>{currentUser.vipRank || "VIP 0"}</span>
        </div>
        <p className="mt-1.5 text-[9px] font-bold uppercase tracking-[.12em] text-slate-500">Total Balance</p>
        <div className="mt-1 flex min-w-0 flex-wrap items-end gap-x-2 gap-y-1">
          <p className="min-w-0 text-left text-[27px] font-black leading-none text-[#18ff8a] drop-shadow-[0_0_14px_rgba(24,255,138,.32)]">
            {balanceVisible ? usd(total) : BALANCE_MASK}
          </p>
          <button type="button" onClick={() => setBalanceVisible(!balanceVisible)} className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-[#18ff8a]/20 bg-[#18ff8a]/10 text-[#18ff8a]" aria-label={balanceVisible ? "Hide wallet balance" : "Show wallet balance"} aria-pressed={!balanceVisible}>
            {balanceVisible ? <Eye size={15} /> : <EyeOff size={15} />}
          </button>
          <div className={`inline-flex shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-black leading-none min-[390px]:text-[11px] ${todaysProfit >= 0 ? "border-[#18ff8a]/20 bg-[#18ff8a]/10 text-[#18ff8a]" : "border-danger/20 bg-danger/10 text-danger"}`}>
            {balanceVisible ? `${todaysProfit >= 0 ? "+" : ""}${usd(todaysProfit)} today` : BALANCE_MASK}
          </div>
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

type AiOverviewRange = "today" | "week" | "month";
type AiOverviewData = { range: AiOverviewRange; totalIncome: number; currency: string; points: { label: string; value: number }[] };
const overviewRangeLabels: Record<AiOverviewRange, string> = { today: "Today", week: "This Week", month: "This Month" };

function useAiTradingOverview() {
  const [range,setRange]=useState<AiOverviewRange>("today");
  const [data,setData]=useState<AiOverviewData|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [retryKey,setRetryKey]=useState(0);
  useEffect(()=>{
    const controller=new AbortController();
    setLoading(true);
    setError("");
    fetch(`/api/ai-trading/overview?range=${range}`,{credentials:"include",cache:"no-store",signal:controller.signal})
      .then(async response=>{const body=await response.json().catch(()=>({}));if(!response.ok)throw new Error(body.error||"Overview unavailable");return body as AiOverviewData;})
      .then(next=>{if(!controller.signal.aborted)setData(next);})
      .catch(err=>{if(!controller.signal.aborted)setError(err instanceof Error?err.message:"Overview unavailable");})
      .finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return()=>controller.abort();
  },[range,retryKey]);
  return {range,setRange,data,loading,error,retry:()=>setRetryKey(value=>value+1)};
}

function AiOverviewRangeSelector({range,onChange}:{range:AiOverviewRange;onChange:(range:AiOverviewRange)=>void}) {
  return <label className="relative flex h-7 w-[104px] max-w-full shrink-0 items-center rounded-full border border-[#18ff8a]/15 bg-[#0b1511] text-[10px] font-black text-slate-300">
    <select aria-label="AI trading overview range" value={range} onChange={event=>onChange(event.target.value as AiOverviewRange)} className="h-full w-full appearance-none rounded-full bg-transparent pl-2.5 pr-6 outline-none">
      <option value="today">Today</option><option value="week">This Week</option><option value="month">This Month</option>
    </select>
    <ChevronDown size={10} className="pointer-events-none absolute right-2"/>
  </label>;
}

function AiOverviewCard({ balanceVisible }: { balanceVisible: boolean }) {
  const {range,setRange,data,loading,error,retry}=useAiTradingOverview();
  return <GlassCard className="home-depth-card h-[126px] rounded-[20px] p-3">
    <div className="flex items-start justify-between gap-3">
      <h3 className="text-[16px] font-bold leading-tight text-white">AI Copy Trading Overview</h3>
      <AiOverviewRangeSelector range={range} onChange={setRange}/>
    </div>
    <div className="mt-2 grid grid-cols-[minmax(0,1fr)_136px] items-end gap-2.5">
      <div>
        <p className="text-[9px] font-bold uppercase tracking-[.12em] text-slate-500">Total Income</p>
        <p className={`mt-0.5 text-[24px] font-black leading-none text-[#18ff8a] transition-opacity ${loading&&data?"opacity-55":""}`}>{balanceVisible ? data?usd(data.totalIncome):"—" : BALANCE_MASK}</p>
        <p className="mt-0.5 text-[9px] font-bold text-slate-500">{error?<button type="button" onClick={retry} className="text-[#f6c85f]">Retry overview</button>:loading?`Loading ${overviewRangeLabels[range].toLowerCase()}…`:data?.totalIncome?`${data.totalIncome>=0?"+":""}${data.totalIncome.toFixed(2)} ${data.currency}`:"No income in this range"}</p>
      </div>
      <IncomeChart points={data?.points??[]} loading={loading} />
    </div>
  </GlassCard>;
}

function IncomeChart({ points,loading }: { points: {label:string;value:number}[];loading:boolean }) {
  const data=points.map(point=>point.value);
  if (!points.length) return <div className="grid h-[64px] w-[136px] place-items-center rounded-xl border border-white/[.06] bg-black/20 text-center text-[10px] font-bold text-slate-600">{loading?"Loading…":"No chart data"}</div>;
  const width=136, height=50;
  const cumulative=data.reduce<number[]>((series,value,index)=>[...series,(series[index-1]??0)+value],[]);
  const min=Math.min(...cumulative,0), max=Math.max(...cumulative,1);
  const polylinePoints=cumulative.map((value,index)=>`${(index/Math.max(cumulative.length-1,1))*width},${height-8-((value-min)/Math.max(max-min,1))*(height-18)}`).join(" ");
  const labelIndexes=points.length>12?new Set([0,Math.floor((points.length-1)/2),points.length-1]):new Set(points.map((_,index)=>index));
  return <div className={`h-[64px] w-[136px] transition-opacity ${loading?"opacity-55":""}`}><svg className="h-[50px] w-[136px] drop-shadow-[0_0_12px_rgba(24,255,138,.38)]" viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
    <defs><linearGradient id="incomeFill" x1="0" x2="0" y1="0" y2="1"><stop stopColor="#18ff8a" stopOpacity=".34"/><stop offset="1" stopColor="#18ff8a" stopOpacity="0"/></linearGradient></defs>
    <polyline points={`0,${height} ${polylinePoints} ${width},${height}`} fill="url(#incomeFill)" stroke="none" />
    <polyline points={polylinePoints} fill="none" stroke="#18ff8a" strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" />
  </svg><div className="relative h-[12px] text-[7px] font-bold text-slate-600">{points.map((point,index)=>labelIndexes.has(index)?<span key={`${point.label}-${index}`} className="absolute -translate-x-1/2 whitespace-nowrap" style={{left:`${(index/Math.max(points.length-1,1))*100}%`}}>{point.label}</span>:null)}</div></div>;
}

function VipTradeRowsCard({ rows, onTradePlaced }: { rows: VipTradeRow[]; onTradePlaced: () => void | Promise<void> }) {
  const [error,setError]=useState("");
  const [wizardOpen,setWizardOpen]=useState(false);
  const [nowTick,setNowTick]=useState(0);
  const countdownKey=tradeRowsCountdownKey(rows);
  useEffect(() => {
    const timer = window.setInterval(() => setNowTick(value => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => setNowTick(0), [countdownKey]);
  const nextRow=rows.find(row=>row.tradeStatus==="LIVE") ?? rows.find(row=>row.tradeStatus==="UPCOMING") ?? rows[0];
  const nextTime=nextRow ? readableTradeTime(nextRow) : "";
  const start=(row:VipTradeRow)=>{
    setError("");
    if(!isTradeButtonEnabled(row,nowTick)){setError(row.reason || row.message || "Trade not available.");return;}
    if(!row.eligible){setError(row.message || "You are not eligible for this trade.");return;}
    setWizardOpen(true);
  };
  return <><GlassCard className="home-depth-card overflow-hidden rounded-[20px] p-3">
    <div className="flex items-start justify-between gap-3 pb-1.5">
      <h3 className="text-[16px] font-black text-white">VIP Trade Rows</h3>
      <div className="text-right"><p className="text-[8px] font-black uppercase tracking-[.12em] text-slate-600">Trade Time</p><p className="mt-0.5 text-[10px] font-black text-[#18ff8a]">{nextTime}</p></div>
    </div>
    <div className="space-y-1.5">
      {rows.length ? rows.map(row=><VipTradeRowItem key={row.id} row={row} tick={nowTick} start={()=>start(row)} />) : <EmptyState title="No VIP trade rows available" icon={LineChart} />}
    </div>
    {error&&<p className="mt-3 border-t border-[#18ff8a]/10 pt-3 text-xs font-bold text-danger">{error}</p>}
  </GlassCard>{wizardOpen&&<ManualTradeWizard onClose={()=>setWizardOpen(false)} onPlaced={onTradePlaced}/>}</>;
}

function vipAccent(row: VipTradeRow) {
  const label=row.label.toLowerCase();
  if(label.includes("7") || label.includes("10")) return "#ff7a1a";
  if(label.includes("5") || label.includes("6")) return "#ffd54a";
  if(label.includes("3") || label.includes("4")) return "#9b5cff";
  if(label.includes("1") || label.includes("2")) return "#18c8ff";
  return "#18ff8a";
}

function VipTradeRowItem({ row, tick, start }: { row: VipTradeRow; tick: number; start: () => void }) {
  const accent=vipAccent(row);
  const status=localTradeStatus(row,tick);
  const label=displayVipLabel(row.vipRange??row.label);
  const longLabel=label.length>20;
  const countdown=tradeCountdownLabel(row,tick);
  const tradeEnabled=isTradeButtonEnabled(row,tick);
  const actionLabel=tradeButtonLabel(row,status,tradeEnabled);
  return <div className="vip-row flex h-[48px] items-center gap-1.5 rounded-[13px] px-2 py-1" style={{"--vip-accent":accent} as CSSProperties}>
    <div className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] text-[8px] font-black text-[#050807]" style={{background:`linear-gradient(145deg, ${accent}, ${accent}99)`,boxShadow:`0 0 18px ${accent}33`}}>VIP</div>
    <div className="min-w-0 flex-1">
      <div className="flex min-w-0 items-center gap-1.5">
        <p className={`shrink-0 whitespace-nowrap font-black leading-none text-white ${longLabel ? "text-[10px] min-[390px]:text-[11px]" : "text-[13px]"}`}>{label}</p>
        <span className="flex h-[18px] shrink-0 items-center rounded-full border px-1.5 text-[8px] font-black" style={{borderColor:`${accent}33`,backgroundColor:`${accent}14`,color:accent}}>{status}</span>
      </div>
      <p className="mt-0.5 truncate text-[9px] font-bold text-slate-400">{countdown || (!tradeEnabled&&status==="LIVE"?actionLabel:`${(row.dailyReturnMin??row.dailyPercentMin).toFixed(1)}% - ${(row.dailyReturnMax??row.dailyPercentMax).toFixed(1)}% Daily Return`)}</p>
    </div>
    <button onClick={start} disabled={!tradeEnabled} className="h-8 w-[96px] shrink-0 rounded-[10px] px-1 text-[9px] font-black leading-tight text-[#050807] disabled:opacity-50" style={{background:accent,boxShadow:`0 0 18px ${accent}2e`}}>{actionLabel}</button>
  </div>;
}

function HomeAiSubscriptionCard({ currentUser, status, purchaseAi, onOpenAuth, notify }: { currentUser: CurrentUser | null; status: AiSubscriptionStatus | null; purchaseAi: () => Promise<{ok:boolean;message:string}>; onOpenAuth: () => void; notify: (message: string) => void }) {
  const [loading,setLoading]=useState(false);
  const active=Boolean(status?.subscription?.active);
  const expiry=status?.subscription?.expiresAt ? new Date(status.subscription.expiresAt) : null;
  const action=async()=>{
    if(!currentUser){onOpenAuth();return;}
    if(active){notify(activeAiSubscriptionMessage);return;}
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

type LeaderboardTrader = { id: string; name: string; uid: string; vipRank: string; roi: number; winRate: number; totalProfit: number; followers: number; totalTrades: number };
function TopCopyTraders({ t = getTranslator("en") }: { t?: ReturnType<typeof getTranslator> }) {
  const [traders,setTraders]=useState<LeaderboardTrader[]>([]);
  useEffect(()=>{let active=true;fetch("/api/copy-traders/leaderboard").then(r=>r.ok?r.json():Promise.reject()).then(data=>{if(active)setTraders(Array.isArray(data.traders)?data.traders:[]);}).catch(()=>{if(active)setTraders([]);});return()=>{active=false};},[]);
  return <GlassCard className="overflow-hidden rounded-[28px]"><SectionHeader title={t("topCopyTraders")} />{traders.length?<div className="divide-y divide-line/60">{traders.map((trader,index)=><div key={trader.id} className="flex items-center gap-2 px-3 py-3 sm:gap-3 sm:px-5"><div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-lime/10 text-xs font-black text-lime ring-1 ring-lime/25 sm:h-10 sm:w-10">{index+1}</div><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{trader.name}</p><p className="mt-0.5 text-[10px] leading-snug text-slate-500">ROI {trader.roi.toFixed(2)}% · Win {trader.winRate.toFixed(1)}% · {trader.totalTrades} trades</p></div><div className="w-[86px] shrink-0 text-right"><p className="text-xs font-black text-lime sm:text-sm">{usd(trader.totalProfit)}</p><p className="text-[9px] text-slate-500 sm:text-[10px]">{trader.followers} followers</p></div></div>)}</div>:<EmptyState title={t("noCopyTraders")} icon={Users} />}</GlassCard>;
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

function MarketsHeroVisual() {
  return <svg viewBox="0 0 180 136" className="markets-ref-hero-svg" aria-hidden="true">
    <defs>
      <radialGradient id="marketsHeroGlow" cx="50%" cy="50%" r="58%"><stop stopColor="#18ff8a" stopOpacity=".48"/><stop offset="1" stopColor="#18ff8a" stopOpacity="0"/></radialGradient>
      <linearGradient id="marketsHeroV" x1="59" y1="29" x2="106" y2="88"><stop stopColor="#f7fff9"/><stop offset=".45" stopColor="#18ff8a"/><stop offset="1" stopColor="#036c44"/></linearGradient>
      <linearGradient id="marketsHeroEth" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#dfe9ff"/><stop offset="1" stopColor="#6f86ff"/></linearGradient>
      <filter id="marketsHeroBlur" x="0" y="0" width="180" height="136"><feGaussianBlur stdDeviation="4"/></filter>
    </defs>
    <g opacity=".35">
      <path d="M12 108H168M28 94H152M42 80H138" stroke="#18ff8a" strokeOpacity=".18"/>
      <path d="M42 116L86 66L136 116M62 116L96 74L152 116" fill="none" stroke="#18ff8a" strokeOpacity=".13"/>
    </g>
    <g opacity=".55">{[0,1,2,3,4].map(i=><rect key={i} x={118+i*8} y={72-i*8} width="5" height={28+i*7} rx="2" fill="#18ff8a" opacity={.32+i*.1}/>)}</g>
    <ellipse cx="88" cy="105" rx="60" ry="19" fill="url(#marketsHeroGlow)" filter="url(#marketsHeroBlur)" className="markets-ref-pulse"/>
    <ellipse cx="88" cy="101" rx="58" ry="15" fill="#06110d" stroke="#18ff8a" strokeOpacity=".38" strokeDasharray="26 13" className="markets-ref-orbit"/>
    <ellipse cx="88" cy="101" rx="38" ry="9" fill="#020806" stroke="#0d5e40"/>
    <g className="markets-ref-float">
      <circle cx="86" cy="59" r="34" fill="rgba(24,255,138,.1)" stroke="#18ff8a" strokeOpacity=".36"/>
      <path d="M70 38H60L79 82L86 95L93 82L112 38H101L86 72L70 38Z" fill="url(#marketsHeroV)" stroke="#eafff4" strokeOpacity=".3"/>
      <path d="M101 38H112L93 82L86 95V72L101 38Z" fill="#006b43" opacity=".9"/>
      <path d="M70 38H60L79 82L86 95V72L70 38Z" fill="#9cffd9" opacity=".25"/>
    </g>
    <g className="markets-ref-coin-a">
      <circle cx="43" cy="44" r="17" fill="#f7931a" stroke="#ffd38c" strokeOpacity=".8"/>
      <text x="43" y="50" textAnchor="middle" fill="#fff7df" fontSize="18" fontWeight="900">B</text>
    </g>
    <g className="markets-ref-coin-b">
      <circle cx="140" cy="39" r="16" fill="#121827" stroke="#7f95ff" strokeOpacity=".85"/>
      <path d="M140 23l10 17-10 6-10-6 10-17Z" fill="url(#marketsHeroEth)"/>
      <path d="M130 43l10 6 10-6-10 13-10-13Z" fill="#8fa0ff" opacity=".75"/>
    </g>
    <path d="M30 77c18-21 34 6 49-8s25-13 43-31" fill="none" stroke="#18ff8a" strokeWidth="2" strokeLinecap="round" className="markets-ref-line"/>
    {[22,54,132,151,116,69].map((x,i)=><circle key={x} cx={x} cy={26+(i*17)%66} r="1.5" fill="#b8ffe0" opacity=".65" className="markets-ref-particle"/>)}
  </svg>;
}

function MarketCoinLogo({coin}:{coin:MarketCoin}) {
  const [localFailed,setLocalFailed]=useState(false);
  const [remoteFailed,setRemoteFailed]=useState(false);
  useEffect(()=>{setLocalFailed(false);setRemoteFailed(false);},[coin.localLogoPath,coin.logoUrl]);
  if (coin.localLogoPath && !localFailed) {
    return <span className="markets-ref-logo"><img src={coin.localLogoPath} alt={`${coin.symbol} logo`} onError={()=>setLocalFailed(true)}/></span>;
  }
  if (coin.logoUrl && !remoteFailed) {
    return <span className="markets-ref-logo"><img src={coin.logoUrl} alt={`${coin.symbol} logo`} onError={()=>setRemoteFailed(true)}/></span>;
  }
  return <span className="markets-ref-logo"><MarketCoinFallback symbol={coin.symbol} color={coin.color}/></span>;
}

function MarketCoinFallback({symbol,color}:{symbol:string;color:string}) {
  const id=`marketLogo${symbol.replace(/[^a-zA-Z0-9]/g,"")}`;
  if (symbol==="BTC") return <svg viewBox="0 0 42 42"><circle cx="21" cy="21" r="21" fill="#f7931a"/><text x="21" y="28" textAnchor="middle" fill="#fff7df" fontSize="22" fontWeight="900">B</text></svg>;
  if (symbol==="ETH") return <svg viewBox="0 0 42 42"><circle cx="21" cy="21" r="21" fill="#151a2f"/><path d="M21 6l11 16-11 6-11-6L21 6Z" fill="#dfe7ff"/><path d="M10 24l11 7 11-7-11 13-11-13Z" fill="#8292ff"/></svg>;
  if (symbol==="BNB") return <svg viewBox="0 0 42 42"><circle cx="21" cy="21" r="21" fill="#f3ba2f"/><path d="M21 8l6 6-6 6-6-6 6-6Zm-9 9l6 6-6 6-6-6 6-6Zm18 0l6 6-6 6-6-6 6-6Zm-9 9l6 6-6 6-6-6 6-6Z" fill="#1d1600"/></svg>;
  if (symbol==="SOL") return <svg viewBox="0 0 42 42"><defs><linearGradient id={`${id}Sol`} x1="6" y1="8" x2="36" y2="34"><stop stopColor="#00ffa3"/><stop offset=".55" stopColor="#dc1fff"/><stop offset="1" stopColor="#03e1ff"/></linearGradient></defs><circle cx="21" cy="21" r="21" fill="#111827"/><path d="M12 12h21l-4 5H8l4-5Zm-4 9h21l5 5H13l-5-5Zm4 9h21l-4 5H8l4-5Z" fill={`url(#${id}Sol)`}/></svg>;
  if (symbol==="XRP") return <svg viewBox="0 0 42 42"><circle cx="21" cy="21" r="21" fill="#f8fafc"/><path d="M12 13h5l4 4 4-4h5l-6.5 6.4a3.6 3.6 0 0 1-5 0L12 13Zm18 16h-5l-4-4-4 4h-5l6.5-6.4a3.6 3.6 0 0 1 5 0L30 29Z" fill="#0f172a"/></svg>;
  if (symbol==="ADA") return <svg viewBox="0 0 42 42"><circle cx="21" cy="21" r="21" fill="#1e5eff"/>{[0,1,2,3,4,5,6,7].map(i=><circle key={i} cx={21+Math.cos(i*.785)*10} cy={21+Math.sin(i*.785)*10} r="1.8" fill="#dbeafe"/>)}<circle cx="21" cy="21" r="3" fill="#fff"/></svg>;
  if (symbol==="DOGE") return <svg viewBox="0 0 42 42"><circle cx="21" cy="21" r="21" fill="#c2a633"/><text x="21" y="28" textAnchor="middle" fill="#fff8cf" fontSize="22" fontWeight="900">D</text></svg>;
  if (symbol==="MATIC" || symbol==="POL") return <svg viewBox="0 0 42 42"><circle cx="21" cy="21" r="21" fill="#8247e5"/><path d="M12 17l6-4 6 4v8l-6 4-6-4v-8Zm12 0l6-4 6 4v8l-6 4-6-4" fill="none" stroke="#f5f3ff" strokeWidth="2.4" strokeLinejoin="round"/></svg>;
  return <svg viewBox="0 0 42 42"><circle cx="21" cy="21" r="21" fill={color}/><text x="21" y="26" textAnchor="middle" fill="#fff" fontSize="12" fontWeight="900">{symbol.slice(0,3)}</text></svg>;
}

function MarketsMiniSpark({coin}:{coin:MarketCoin}) {
  const positive=coin.change>=0;
  const values=coin.spark?.length?coin.spark:[20,21,20,22,21,23,22,24,23];
  const min=Math.min(...values);
  const max=Math.max(...values);
  const span=Math.max(max-min,1);
  const points=values.map((value,index)=>`${((index/(values.length-1 || 1))*100).toFixed(1)},${(32-((value-min)/span)*26).toFixed(1)}`).join(" ");
  const color=positive?"#18ff8a":"#ff4f6d";
  return <svg viewBox="0 0 100 36" preserveAspectRatio="none" className="markets-ref-chart" aria-hidden="true">
    <path d={`M0 36 L ${points} L100 36 Z`} fill={color} opacity=".11"/>
    <polyline points={points} fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="market-spark-line"/>
  </svg>;
}

function MarketsTableRow({coin,localCurrency,onTrade}:{coin:MarketCoin;localCurrency:ReturnType<typeof currencyConfigForCountry>;onTrade:()=>void}) {
  const positive=coin.change>=0;
  const volume=Number(coin.quoteVolume ?? coin.volume ?? 0);
  return <article className="markets-table-row">
    <button onClick={onTrade} className="markets-coin-cell" aria-label={`Open ${coin.name} market`}>
      <MarketCoinLogo coin={coin}/>
      <span className="min-w-0">
        <span className="markets-coin-name">{coin.name}</span>
        <span className="markets-coin-symbol">{coin.symbol}</span>
      </span>
    </button>
    <div className="markets-price-cell">
      <strong>{formatMarketPrice(coin.price)}</strong>
      <span>{coin.live?formatLocalCurrency(coin.price, localCurrency):"--"}</span>
    </div>
    <div className={`markets-change-pill ${positive?"markets-change-up":"markets-change-down"}`}>{coin.live?`${positive?"+":""}${coin.change.toFixed(2)}%`:"--"}</div>
    <div className="markets-chart-cell"><MarketsMiniSpark coin={coin}/>{volume>0&&<span>${compact(volume)}</span>}</div>
    <button onClick={onTrade} className="markets-star-button" aria-label={`Watch ${coin.symbol}`}><Star size={21}/></button>
  </article>;
}

function MarketsPromoCard() {
  return <section className="markets-promo-card">
    <svg viewBox="0 0 96 94" className="markets-promo-svg" aria-hidden="true">
      <defs>
        <radialGradient id="marketsPromoGlow" cx="50%" cy="60%" r="58%"><stop stopColor="#18ff8a" stopOpacity=".4"/><stop offset="1" stopColor="#18ff8a" stopOpacity="0"/></radialGradient>
      </defs>
      <ellipse cx="48" cy="75" rx="38" ry="13" fill="url(#marketsPromoGlow)"/>
      <rect x="28" y="14" width="38" height="62" rx="9" fill="#07110d" stroke="#18ff8a" strokeOpacity=".5"/>
      <rect x="33" y="20" width="28" height="48" rx="5" fill="#020806"/>
      <path d="M36 55c8-17 14 4 21-13" fill="none" stroke="#18ff8a" strokeWidth="2.2" strokeLinecap="round"/>
      <rect x="37" y="28" width="4" height="16" rx="2" fill="#18ff8a" opacity=".45"/>
      <rect x="45" y="34" width="4" height="10" rx="2" fill="#58d8ff" opacity=".5"/>
      <rect x="53" y="25" width="4" height="19" rx="2" fill="#18ff8a" opacity=".65"/>
      <circle cx="70" cy="30" r="9" fill="#f7931a" opacity=".95"/>
      <circle cx="24" cy="39" r="7" fill="#6f86ff" opacity=".9"/>
    </svg>
    <div className="min-w-0 flex-1">
      <h3>Track Smarter. Trade Better.</h3>
      <p>Real-time data, advanced charts and deep market insights.</p>
    </div>
    <button type="button">Explore Charts <ArrowUpRight size={14}/></button>
  </section>;
}

function MarketsScreen({coins:marketBase,userCountry,loading,error}:{t: ReturnType<typeof getTranslator>; coins:AppCoin[];userCountry:string;loading:boolean;error:string}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All Coins");
  const live=useLiveTickers();
  const tickerMap=useMemo(()=>new Map(live.map(ticker=>[ticker.symbol,ticker])),[live]);
  const localCurrency=useMemo(()=>currencyConfigForCountry(userCountry),[userCountry]);
  const marketCoins=useMemo<MarketCoin[]>(()=>marketBase.filter(coin=>coin.isActive).map(coin=>{const ticker=tickerMap.get(coin.pair);return {...coin,price:ticker?.price??0,change:ticker?.changePercent??0,volume:ticker?.volume,quoteVolume:ticker?.quoteVolume,live:Boolean(ticker?.price)};}),[marketBase,tickerMap]);
  const displayMarketCoins=useMemo(()=>marketCoins.slice(0,150),[marketCoins]);
  const preferredSymbols=["BTC","ETH","BNB","SOL","XRP","ADA","DOGE","MATIC","POL"];
  const preferredCoins=preferredSymbols.reduce<MarketCoin[]>((rows,symbol)=>{const coin=displayMarketCoins.find(item=>item.symbol===symbol); if(coin) rows.push(coin); return rows;},[]);
  const baseCoins=preferredCoins.length?preferredCoins:displayMarketCoins.filter(coin=>coin.symbol!=="USDT").slice(0,8);
  const visibleCoins=useMemo(()=>{
    const normalizedQuery=query.trim().toLowerCase();
    const source=category==="Top Gainers"
      ? [...displayMarketCoins].filter(coin=>coin.change>0).sort((a,b)=>b.change-a.change).slice(0,8)
      : category==="Top Losers"
        ? [...displayMarketCoins].filter(coin=>coin.change<0).sort((a,b)=>a.change-b.change).slice(0,8)
        : category==="DeFi"
          ? displayMarketCoins.filter(coin=>["UNI","AAVE","COMP","CRV","MKR","INJ"].includes(coin.symbol)).slice(0,8)
          : category==="Watchlist"
            ? baseCoins
            : displayMarketCoins;
    return source.filter(coin=>`${coin.symbol}${coin.name}${coin.pair}`.toLowerCase().includes(normalizedQuery));
  },[baseCoins,category,displayMarketCoins,query]);
  const openTrade=(coin:MarketCoin)=>{window.location.href=`/markets/${coin.pair}`;};
  const chips=["Watchlist","All Coins","Top Gainers","Top Losers","DeFi"];
  return <div className="markets-ref-page -mx-4 -mt-1 min-h-screen overflow-x-hidden px-4 pb-6">
    <MarketAtmosphere/>
    <div className="relative z-10 space-y-3">
      <section className="markets-ref-hero">
        <div className="relative z-10 min-w-0">
          <h1>Markets</h1>
          <p>Live prices, charts &amp; market data</p>
        </div>
        <MarketsHeroVisual/>
      </section>

      <div className="markets-ref-search-row">
        <label className="markets-ref-search">
          <Search size={18}/>
          <input value={query} onChange={event=>setQuery(event.target.value)} placeholder="Search coins..." />
        </label>
        <button type="button" className="markets-ref-filter"><SlidersHorizontal size={16}/>Filters</button>
      </div>

      <div className="markets-ref-chips no-scrollbar">
        {chips.map(chip=><button key={chip} type="button" onClick={()=>setCategory(chip)} className={`markets-ref-chip ${category===chip?"markets-ref-chip-active":""}`}>{chip}</button>)}
      </div>

      <section className="markets-table-card">
        <div className="markets-table-head">
          <span>Coin</span>
          <span>Price</span>
          <span>24H Change</span>
          <span>24H Chart</span>
          <span>Star</span>
        </div>
        <div>
          {visibleCoins.length ? visibleCoins.map(coin=><MarketsTableRow key={coin.symbol} coin={coin} localCurrency={localCurrency} onTrade={()=>openTrade(coin)}/>) : <div className="markets-empty-state">{loading ? "Loading market data..." : error || "No real market data found."}</div>}
        </div>
      </section>

      <MarketsPromoCard/>
    </div>
  </div>;
}

function TradeWorkspace({category,coins,loading,error}:{category:TradeCategory;coins:AppCoin[];loading:boolean;error:string}) {
  return <div className="space-y-5"><div><h2 className="text-2xl font-black">Trade</h2></div><TradingCategoryPage category={category==="copy"?"spot":category} coins={coins} loading={loading} error={error}/></div>;
}

function AiCopyTradePage({currentUser,subscription,activeTrade: _activeTrade,aiWalletBalance,tradeRows,copyTradeCounts,copyTradeHistory,onManualTradePlaced,completeTrade: _completeTrade,purchaseAi,openLogin,notify}:{currentUser:CurrentUser|null;subscription:AiSubscriptionStatus|null;activeTrade:ActiveCopyTrade|null;aiWalletBalance:number;tradeRows:VipTradeRow[];copyTradeCounts:CopyTradeCounts;copyTradeHistory:CopyTradeHistory[];onManualTradePlaced:()=>void|Promise<void>;completeTrade:()=>void;purchaseAi:()=>Promise<{ok:boolean;message:string}>;openLogin:()=>void;notify:(message:string)=>void}) {
  const active=Boolean(subscription?.subscription?.active);
  const today=new Date().toDateString();
  const creditedHistory=useMemo(()=>copyTradeHistory.filter(isCreditedCopyTrade),[copyTradeHistory]);
  const todayIncome=creditedHistory.reduce((sum,row)=>{
    const date=new Date(row.date);
    return Number.isNaN(date.getTime()) || date.toDateString()!==today ? sum : sum+Number(row.profit ?? 0);
  }, 0);
  const allowedTrades=copyTradeCounts.dailyTradeLimit;
  const currentTrades=Math.min(copyTradeCounts.todaysTradeCount, allowedTrades);
  return <div className="ai-trade-page -mx-4 -mt-1 min-h-screen overflow-x-hidden px-4 pb-2">
    <section className="ai-trade-hero">
      <div className="relative z-10">
        <h1>AI Trade</h1>
        <p>Smart AI. Auto Trade. Daily Income.</p>
      </div>
      <AiTradeHeroVisual/>
    </section>
    <AiTopStats balance={aiWalletBalance} todayIncome={todayIncome} currentTrades={currentTrades} allowedTrades={allowedTrades} active={active}/>
    <AiTradeOverviewCard/>
    <TopCopyTraders/>
    <VipTradeRowsCard rows={tradeRows.slice(0,5)} onTradePlaced={onManualTradePlaced}/>
    <AiInfoStrip/>
    <AiSubscriptionPanel currentUser={currentUser} status={subscription} purchaseAi={purchaseAi} openLogin={openLogin} notify={notify}/>
  </div>;
}

function isCreditedCopyTrade(row: CopyTradeHistory) {
  return row.status === "INCOME_CREDITED";
}

function AiTradeHeroVisual() {
  return <svg viewBox="0 0 180 136" className="ai-hero-svg" aria-hidden="true">
    <defs>
      <linearGradient id="aiHeroV" x1="61" y1="26" x2="107" y2="92"><stop stopColor="#eafff4"/><stop offset=".45" stopColor="#18ff8a"/><stop offset="1" stopColor="#047a49"/></linearGradient>
      <radialGradient id="aiHeroGlow" cx="50%" cy="50%" r="55%"><stop stopColor="#18ff8a" stopOpacity=".45"/><stop offset="1" stopColor="#18ff8a" stopOpacity="0"/></radialGradient>
      <filter id="aiHeroBlur" x="0" y="0" width="180" height="136"><feGaussianBlur stdDeviation="4"/></filter>
    </defs>
    <path d="M14 106H166M28 92H152M41 79H139" stroke="#18ff8a" strokeOpacity=".13"/>
    <g opacity=".42">{[0,1,2,3,4].map(i=><rect key={i} x={118+i*8} y={64-i*8} width="5" height={34+i*8} rx="2" fill="#18ff8a" opacity={.35+i*.09}/>)}</g>
    <ellipse cx="88" cy="103" rx="58" ry="18" fill="url(#aiHeroGlow)" filter="url(#aiHeroBlur)" className="ai-svg-pulse"/>
    <g className="ai-svg-orbit"><ellipse cx="88" cy="99" rx="58" ry="15" fill="#06110d" stroke="#18ff8a" strokeOpacity=".42" strokeDasharray="28 15"/></g>
    <ellipse cx="88" cy="99" rx="38" ry="9" fill="#020806" stroke="#0d5e40"/>
    <g className="ai-svg-float">
      <circle cx="86" cy="58" r="33" fill="rgba(24,255,138,.1)" stroke="#18ff8a" strokeOpacity=".35"/>
      <path d="M71 37H61L79 82L86 95L93 82L111 37H101L86 72L71 37Z" fill="url(#aiHeroV)" stroke="#eafff4" strokeOpacity=".34"/>
      <path d="M101 37H111L93 82L86 95V72L101 37Z" fill="#006b43" opacity=".88"/>
      <path d="M71 37H61L79 82L86 95V72L71 37Z" fill="#9cffd9" opacity=".26"/>
    </g>
    <g className="ai-bot" transform="translate(118 48)">
      <rect x="0" y="10" width="29" height="25" rx="9" fill="#08140f" stroke="#18ff8a" strokeOpacity=".55"/>
      <circle cx="9" cy="23" r="2.5" fill="#18ff8a"/><circle cx="20" cy="23" r="2.5" fill="#18ff8a"/>
      <path d="M14 10V2M8 2h12" stroke="#18ff8a" strokeLinecap="round"/>
    </g>
    <path d="M28 68c16-24 34 7 48-10s27-13 38-24" fill="none" stroke="#18ff8a" strokeWidth="2" strokeLinecap="round" className="ai-chart-line"/>
    <g fill="#9cffd9">{[24,145,154,43,132].map((x,i)=><circle key={x} cx={x} cy={30+i*16%62} r="1.5" opacity=".55" className="ai-svg-particle"/>)}</g>
  </svg>;
}

function AiTopStats({balance,todayIncome,currentTrades,allowedTrades,active}:{balance:number;todayIncome:number;currentTrades:number;allowedTrades:number;active:boolean}) {
  return <section className="ai-glass ai-top-stats">
    <AiStat icon={Wallet} tone="green" label="AI Wallet Balance" value={`${balance.toFixed(2)} USDT`}/>
    <AiStat icon={LineChart} tone="purple" label="Today's Income" value={usd(todayIncome)} trend={todayIncome>0?"+ today":undefined}/>
    <AiStat icon={BarChart3} tone="blue" label="Today's Trades" value={`${currentTrades}/${allowedTrades || 0}`}/>
    <AiStat icon={Trophy} tone="gold" label="AI Subscription" value={active?"Active":"Inactive"}/>
  </section>;
}

function AiStat({icon:Icon,tone,label,value,trend}:{icon:typeof Home;tone:"green"|"purple"|"blue"|"gold";label:string;value:string;trend?:string}) {
  return <div className="ai-stat">
    <span className={`ai-stat-icon ai-stat-${tone}`}><Icon size={16}/></span>
    <p>{label}</p>
    <strong>{value}</strong>
    {trend&&<em>{trend}</em>}
  </div>;
}

function AiTradeOverviewCard() {
  const {range,setRange,data,loading,error,retry}=useAiTradingOverview();
  return <section className="ai-glass ai-overview-card">
    <div className="flex items-center justify-between gap-3">
      <h2>AI Copy Trading Overview</h2>
      <AiOverviewRangeSelector range={range} onChange={setRange}/>
    </div>
    <div className="mt-3 grid grid-cols-[105px_minmax(0,1fr)] gap-2.5">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Total Income</p>
        <strong className={`mt-1 block text-[24px] font-black leading-none text-[#18ff8a] transition-opacity ${loading&&data?"opacity-55":""}`}>{data?usd(data.totalIncome):"—"}</strong>
        <span className="mt-1 block text-[10px] font-black text-slate-500">{error?<button type="button" onClick={retry} className="text-[#f6c85f]">Retry overview</button>:loading?`Loading ${overviewRangeLabels[range].toLowerCase()}…`:data?.totalIncome?`+${data.totalIncome.toFixed(2)} ${data.currency}`:"No income in this range"}</span>
      </div>
      <AiIncomeChart points={data?.points??[]} totalIncome={data?.totalIncome??0} loading={loading}/>
    </div>
  </section>;
}

function AiIncomeChart({points,totalIncome,loading}:{points:{label:string;value:number}[];totalIncome:number;loading:boolean}) {
  const width=210,height=140;
  const series=points.length?points.map(point=>point.value):[0];
  const max=Math.max(...series,1), min=0;
  const polylinePoints=series.map((value,index)=>`${28+(index/Math.max(series.length-1,1))*168},${height-28-((value-min)/Math.max(max-min,1))*88}`).join(" ");
  const labelIndexes=points.length>12?new Set([0,Math.floor((points.length-1)/2),points.length-1]):new Set(points.map((_,index)=>index));
  return <svg viewBox={`0 0 ${width} ${height}`} className={`ai-income-chart transition-opacity ${loading?"opacity-55":""}`} preserveAspectRatio="none" aria-hidden="true">
    <defs><linearGradient id="aiIncomeFill" x1="0" x2="0" y1="0" y2="1"><stop stopColor="#18ff8a" stopOpacity=".28"/><stop offset="1" stopColor="#18ff8a" stopOpacity="0"/></linearGradient></defs>
    {[0,.33,.66,1].map(ratio=><g key={ratio}><text x="0" y={height-28-ratio*88} fill="#64748b" fontSize="9">${(max*ratio).toFixed(max<10?1:0)}</text><line x1="25" x2="205" y1={height-31-ratio*88} y2={height-31-ratio*88} stroke="#ffffff" strokeOpacity=".06"/></g>)}
    <path d={`M28 ${height-28} L ${polylinePoints} L196 ${height-28} Z`} fill="url(#aiIncomeFill)"/>
    <polyline points={polylinePoints} fill="none" stroke="#18ff8a" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="ai-chart-line"/>
    {points.map((point,index)=>labelIndexes.has(index)?<text key={`${point.label}-${index}`} x={28+(index/Math.max(points.length-1,1))*168} y="135" textAnchor="middle" fill="#64748b" fontSize="8">{point.label}</text>:null)}
    <g transform="translate(118 12)" className="ai-tooltip"><rect width="78" height="24" rx="10" fill="#0b1712" stroke="#18ff8a" strokeOpacity=".34"/><text x="39" y="15" textAnchor="middle" fill="#18ff8a" fontSize="10" fontWeight="800">{usd(totalIncome)}</text></g>
  </svg>;
}

function displayVipLabel(label:string) {
  const clean=label.replace(/\s+/g," ").trim();
  if (/7/.test(clean) && /10/.test(clean)) return "VIP 7 to VIP 10";
  if (/5/.test(clean) && /6/.test(clean)) return "VIP 5 / VIP 6";
  if (/3/.test(clean) && /4/.test(clean)) return "VIP 3 / VIP 4";
  if (/1/.test(clean) && /2/.test(clean)) return "VIP 1 / VIP 2";
  if (/0/.test(clean)) return "VIP 0";
  return clean;
}

function localTradeStatus(row: VipTradeRow, tick: number): "UPCOMING" | "LIVE" | "CLOSED" {
  const status=row.tradeStatus??(row.available?"LIVE":"CLOSED");
  const untilOpen = Math.max(0, Number(row.secondsUntilOpen ?? 0) - tick);
  const untilClose = Math.max(0, Number(row.secondsUntilClose ?? 0) - tick);
  if (status === "UPCOMING") return untilOpen > 0 ? "UPCOMING" : untilClose > 0 ? "LIVE" : "CLOSED";
  if (status === "LIVE") return untilClose > 0 ? "LIVE" : "CLOSED";
  return status;
}

function isTradeButtonEnabled(row: VipTradeRow, tick: number) {
  return localTradeStatus(row,tick) === "LIVE" && Boolean(row.canTrade || row.canTradeWhenLive);
}

function tradeButtonLabel(row: VipTradeRow, status: "UPCOMING" | "LIVE" | "CLOSED", enabled: boolean) {
  if (enabled) return "Trade";
  if (status === "UPCOMING") return "Soon";
  if (status === "CLOSED") return "Closed";
  return tradeDisabledReason(row);
}

function tradeDisabledReason(row: VipTradeRow) {
  const reason=(row.reason || row.message || "").toLowerCase();
  if (reason.includes("ai wallet")) return "Activate AI Wallet";
  if (reason.includes("vip")) return "VIP Not Eligible";
  if (reason.includes("daily") || reason.includes("limit")) return "Limit Reached";
  if (reason.includes("package")) return "Package Required";
  return "Not Eligible";
}

function readableTradeTime(row: VipTradeRow) {
  const open = row.openTime || row.currentTradeTime || "";
  const close = row.closeTime || "";
  const timezone = row.timezone || "";
  if (!open || !close) return "";
  return `${open} - ${close}${timezone ? ` ${timezone}` : ""}`;
}

function tradeRowsCountdownKey(rows: VipTradeRow[]) {
  return rows.map(row => [row.id,row.tradeStatus,row.openTime,row.closeTime,row.secondsUntilOpen,row.secondsUntilClose,row.canTrade,row.canTradeWhenLive].join(":")).join("|");
}

function tradeCountdownLabel(row: VipTradeRow, tick: number) {
  const untilOpen = Math.max(0, Number(row.secondsUntilOpen ?? 0) - tick);
  const untilClose = Math.max(0, Number(row.secondsUntilClose ?? 0) - tick);
  const status=localTradeStatus(row,tick);
  if (status === "UPCOMING" && untilOpen > 0) return `Starts in ${formatDuration(untilOpen)}`;
  if (status === "LIVE" && untilClose > 0) return `Closes in ${formatDuration(untilClose)}`;
  return "";
}

function formatDuration(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function AiInfoStrip() {
  return <section className="ai-glass ai-info-strip">
    <span><ShieldCheck size={19}/></span>
    <p>AI Subscription users get auto trades in live window. Manual trade available for non-subscribers.</p>
    <button><span>How it works?</span><ChevronRight size={13}/></button>
  </section>;
}

function AiSubscriptionPanel({currentUser,status,purchaseAi,openLogin,notify}:{currentUser:CurrentUser|null;status:AiSubscriptionStatus|null;purchaseAi:()=>Promise<{ok:boolean;message:string}>;openLogin:()=>void;notify:(message:string)=>void}) {
  const [loading,setLoading]=useState(false);
  const active=Boolean(status?.subscription?.active);
  const expiry=status?.subscription?.expiresAt ? new Date(status.subscription.expiresAt) : null;
  const action=async()=>{
    if(!currentUser){openLogin();return;}
    if(active){notify(activeAiSubscriptionMessage);return;}
    setLoading(true);
    const result=await purchaseAi();
    setLoading(false);
    if(!result.ok)notify(result.message || "AI purchase failed");
  };
  return <section className="ai-glass ai-subscription-panel">
    <AiCubeSvg/>
    <div className="min-w-0 flex-1">
      <h2>AI Subscription</h2>
      <p className={active?"text-[#18ff8a]":"text-slate-500"}>{active?"Active":"Inactive"}</p>
      <span>{active&&expiry?`Valid till ${formatDate(expiry)}`:"Purchase to enable auto trades"}</span>
    </div>
    <button onClick={action} disabled={loading}>{loading?"Wait":active?"Manage":"Purchase"}</button>
  </section>;
}

function AiCubeSvg() {
  return <svg width="70" height="70" viewBox="0 0 70 70" className="ai-cube-svg" aria-hidden="true">
    <defs><linearGradient id="aiCube" x1="14" y1="8" x2="58" y2="62"><stop stopColor="#f4fff9"/><stop offset=".48" stopColor="#18ff8a"/><stop offset="1" stopColor="#047a49"/></linearGradient></defs>
    <ellipse cx="35" cy="55" rx="24" ry="7" fill="#18ff8a" opacity=".16"/>
    <path d="M35 7 56 19v24L35 55 14 43V19Z" fill="url(#aiCube)" fillOpacity=".18" stroke="#18ff8a"/>
    <path d="M14 19 35 31 56 19M35 31v24" stroke="#eafff4" strokeOpacity=".34"/>
    <text x="35" y="39" textAnchor="middle" fill="#eafff4" fontSize="13" fontWeight="900">AI</text>
  </svg>;
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
    if(active){
      setError(activeAiSubscriptionMessage);
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
    <button onClick={purchase} disabled={loading} className="mt-5 w-full rounded-xl bg-lime py-3 text-xs font-black text-ink disabled:opacity-60 sm:w-auto sm:px-7">{loading?"Please wait...":active?"Manage":"Purchase AI"}</button>
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

function TradingCategoryPage({category: _category,coins,loading,error}:{category:Exclude<TradeCategory,"copy">;coins:AppCoin[];loading:boolean;error:string}) {
  const [symbol,setSymbol]=useState("BTCUSDT");
  const pairOptions=useMemo(()=>coins.filter(coin=>coin.isActive&&coin.symbol!=="USDT").slice(0,8).map(coin=>coin.pair),[coins]);
  useEffect(()=>{
    if(pairOptions.length&&!pairOptions.includes(symbol))setSymbol(pairOptions[0]);
  },[pairOptions,symbol]);
  if(!pairOptions.length)return <section className={`${card} p-5 text-sm text-slate-400`}>{loading?"Loading trading pairs...":error||"No trading pairs available."}</section>;
  return <div className="space-y-5"><label className="flex w-fit items-center gap-2 rounded-xl border border-line bg-panel px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">Pair<select value={symbol} onChange={event=>setSymbol(event.target.value)} className="bg-transparent text-xs font-black text-white outline-none">{pairOptions.map(pair=><option key={pair} value={pair} className="bg-ink">{pair.replace("USDT","/USDT")}</option>)}</select></label><CandlestickChart symbol={symbol}/><OrderBookPanel symbol={symbol}/><section className={`${card} p-5`}><div className="flex items-center justify-between"><h3 className="font-bold">Order entry</h3><span className="rounded-full bg-white/5 px-3 py-1 text-[10px] font-bold text-slate-400">{symbol.replace("USDT","/USDT")}</span></div><div className="mt-5 grid grid-cols-2 gap-3"><button disabled className="rounded-xl bg-mint/40 py-3 text-xs font-black text-ink/70">Buy Coming Soon</button><button disabled className="rounded-xl bg-danger/40 py-3 text-xs font-black text-white/70">Sell Coming Soon</button></div></section></div>;
}

function CopyTradeScreen({activeTrade,aiWalletBalance,tradeRows,startTrade,completeTrade}:{activeTrade:ActiveCopyTrade|null;aiWalletBalance:number;tradeRows:VipTradeRow[];startTrade:(rowId:string)=>Promise<{ok:boolean;message:string}>;completeTrade:()=>void}) {
  const [error,setError]=useState("");
  const [loadingRow,setLoadingRow]=useState("");
  const [nowTick,setNowTick]=useState(0);
  const countdownKey=tradeRowsCountdownKey(tradeRows);
  useEffect(() => {
    const timer = window.setInterval(() => setNowTick(value => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => setNowTick(0), [countdownKey]);
  const rows=tradeRows.length?tradeRows:[];
  const start=async(row:VipTradeRow)=>{
    setError("");
    if(!isTradeButtonEnabled(row,nowTick)){setError(row.reason || "Trade not available.");return;}
    if(!row.eligible){setError("You are not eligible for this trade.");return;}
    setLoadingRow(row.id);
    const result=await startTrade(row.id);
    setLoadingRow("");
    if(!result.ok){setError(result.message);return;}
    setError("");
  };
  return <div className="space-y-5"><section className={`${card} overflow-hidden`}><div className="flex items-center justify-between border-b border-line px-5 py-4"><h3 className="font-bold">Copy Trade Income</h3><ShieldCheck size={20} className="text-lime"/></div>{activeTrade?<div className="p-4 sm:p-5"><TradeActiveCard onClick={()=>{}} trade={activeTrade} previewAmount={activeTrade.amount}/></div>:<div className="divide-y divide-line/70">{rows.map(row=>{const status=localTradeStatus(row,nowTick);const countdown=tradeCountdownLabel(row,nowTick);const tradeEnabled=isTradeButtonEnabled(row,nowTick);const actionLabel=tradeButtonLabel(row,status,tradeEnabled);return <div key={row.id} className="flex items-center gap-3 px-4 py-4 sm:px-5"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-lime/10 text-lime"><LineChart size={18}/></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-black">{displayVipLabel(row.vipRange??row.label)}</p><span className={`rounded-full px-2 py-0.5 text-[9px] font-black ${status==="LIVE"?"bg-lime/10 text-lime":status==="UPCOMING"?"bg-[#f6c85f]/10 text-[#f6c85f]":"bg-white/5 text-slate-500"}`}>{status}</span></div><p className="mt-1 text-[10px] text-slate-500">Trade time: {readableTradeTime(row)}{countdown?` | ${countdown}`:""}</p><p className="mt-1 text-[10px] text-slate-500">Trade amount: ${Number(row.tradeAmount ?? aiWalletBalance*.01).toFixed(2)} | Daily {row.dailyReturnMin??row.dailyPercentMin}% - {row.dailyReturnMax??row.dailyPercentMax}%</p>{!tradeEnabled&&status==="LIVE"&&<p className="mt-1 text-[10px] text-danger">{actionLabel}</p>}</div><button onClick={()=>start(row)} disabled={loadingRow===row.id||!tradeEnabled} className="w-[112px] shrink-0 rounded-lg bg-lime px-3 py-2 text-[10px] font-black leading-tight text-ink disabled:opacity-50">{loadingRow===row.id?"Wait":actionLabel}</button></div>})}</div>}{error&&<p className="border-t border-line px-5 py-3 text-xs text-danger">{error}</p>}</section></div>;
}
function WalletScreen({notify,assets,loading,refreshing,onRefresh,totalBalance,spotBalance,futuresBalance,aiWalletBalance,aiTradeProfitEarned,aiTradeTarget,activity,section,action,balanceVisible,setBalanceVisible,onSectionChange,onOpenTransfer,onOpenWithdrawal,onOpenDeposit,onCloseAction,onCreateDeposit}:{notify:(s:string)=>void;assets:AppCoin[];loading:boolean;refreshing:boolean;onRefresh:()=>void;totalBalance:number;spotBalance:number;futuresBalance:number;aiWalletBalance:number;aiTradeProfitEarned:number;aiTradeTarget:number;activity:WalletActivity[];section:WalletSection;action:WalletAction;balanceVisible:boolean;setBalanceVisible:(value:boolean)=>void;onSectionChange:(section:WalletSection)=>void;onOpenTransfer:()=>void;onOpenWithdrawal:()=>void;onOpenDeposit:()=>void;onCloseAction:()=>void;onCreateDeposit:(input:DepositInput)=>Promise<{ok:boolean;message:string;deposit?:DepositResult}>}) {
 const live=useLiveTickers(); const tickerMap=useMemo(()=>new Map(live.map(ticker=>[ticker.symbol,ticker])),[live]); const activeAssets=useMemo(()=>assets.filter(coin=>coin.isActive).map(coin=>{const ticker=tickerMap.get(coin.pair);return ticker?{...coin,price:ticker.price,change:ticker.changePercent}:coin;}),[assets,tickerMap]);
if(loading)return <div className="wallet-page -mt-1 min-h-screen" aria-busy="true"><WalletHero/><section className="wallet-glass wallet-total-card animate-pulse"><div className="h-16 w-48 rounded-xl bg-white/10"/></section><section className="wallet-type-grid animate-pulse">{[0,1,2].map(item=><div key={item} className="wallet-glass wallet-type-card h-24"><div className="h-4 w-24 rounded bg-white/10"/></div>)}</section></div>;
return <div className="wallet-page -mt-1 min-h-screen">
  <WalletHero/>
  <WalletTotalCard total={totalBalance} balanceVisible={balanceVisible} setBalanceVisible={setBalanceVisible} onOpenDeposit={onOpenDeposit} onOpenWithdrawal={onOpenWithdrawal}/>
  <WalletTypeCards spot={spotBalance} ai={aiWalletBalance} futures={futuresBalance} balanceVisible={balanceVisible}/>
  <WalletQuickActions onOpenDeposit={onOpenDeposit} onOpenWithdrawal={onOpenWithdrawal} onOpenTransfer={onOpenTransfer} onHistory={()=>onSectionChange("ledger")} onAddressBook={()=>notify("Address book unavailable")}/>
  <WalletBalancesCard assets={activeAssets} balanceVisible={balanceVisible} onOpenDeposit={onOpenDeposit} onOpenWithdrawal={onOpenWithdrawal}/>
  {section==="ledger"&&<section className="wallet-glass wallet-ledger-card"><div className="flex justify-between gap-3"><div><h3>Wallet ledger</h3><p>All balance movements and AI income credits</p></div><button onClick={()=>notify("Ledger export prepared")}>Export</button></div><ActivityRows rows={activity}/></section>}
  <WalletSecurityCard/>
</div>;
}

function WalletBalanceRow({label,balance}:{label:string;balance:number}) { return <div className="flex items-center justify-between gap-4 px-4 py-4 sm:px-5"><p className="text-sm font-bold">{label}</p><p className="text-sm font-black">{balance.toFixed(2)} USDT</p></div> }

function WalletHero() {
  return <section className="wallet-hero"><div className="relative z-10"><h1>Wallet</h1><p>Manage your assets securely</p></div><WalletHeroSvg/></section>;
}

function WalletHeroSvg() {
  return <svg viewBox="0 0 180 136" className="wallet-hero-svg" aria-hidden="true"><defs><linearGradient id="walletCase" x1="42" y1="35" x2="132" y2="96"><stop stopColor="#f4fff9"/><stop offset=".36" stopColor="#18ff8a"/><stop offset="1" stopColor="#047a49"/></linearGradient><radialGradient id="walletGlow" cx="50%" cy="50%" r="55%"><stop stopColor="#18ff8a" stopOpacity=".42"/><stop offset="1" stopColor="#18ff8a" stopOpacity="0"/></radialGradient><filter id="walletBlur"><feGaussianBlur stdDeviation="4"/></filter></defs><ellipse cx="91" cy="104" rx="62" ry="18" fill="url(#walletGlow)" filter="url(#walletBlur)" className="wallet-svg-pulse"/><g className="wallet-svg-orbit"><ellipse cx="91" cy="100" rx="58" ry="15" fill="#06110d" stroke="#18ff8a" strokeOpacity=".42" strokeDasharray="28 15"/></g><rect x="44" y="47" width="88" height="54" rx="14" fill="#07130f" stroke="#18ff8a" strokeOpacity=".5"/><path d="M56 47h64c8 0 12 5 12 12v5H44v-5c0-8 5-12 12-12Z" fill="url(#walletCase)" fillOpacity=".22"/><rect x="111" y="64" width="30" height="22" rx="8" fill="#0b1712" stroke="#18ff8a" strokeOpacity=".55"/><circle cx="123" cy="75" r="3" fill="#18ff8a"/><path d="M74 61h-9l16 30 5 9 5-9 16-30h-9L86 81 74 61Z" fill="url(#walletCase)" stroke="#eafff4" strokeOpacity=".28"/><g className="wallet-coin-a"><circle cx="42" cy="42" r="14" fill="#06110d" stroke="#18ff8a"/><text x="42" y="45" textAnchor="middle" fill="#18ff8a" fontSize="7" fontWeight="900">USDT</text></g><g className="wallet-coin-b"><circle cx="142" cy="38" r="13" fill="#120d05" stroke="#f6c85f"/><text x="142" y="41" textAnchor="middle" fill="#f6c85f" fontSize="7" fontWeight="900">BTC</text></g><g fill="#9cffd9">{[28,151,34,148].map((x,i)=><circle key={x} cx={x} cy={72+i*9} r="1.4" opacity=".5" className="wallet-svg-particle"/>)}</g></svg>;
}

function WalletTotalCard({total,balanceVisible,setBalanceVisible,onOpenDeposit,onOpenWithdrawal}:{total:number;balanceVisible:boolean;setBalanceVisible:(value:boolean)=>void;onOpenDeposit:()=>void;onOpenWithdrawal:()=>void}) {
  return <section className="wallet-glass wallet-total-card"><div className="min-w-0"><div className="flex items-center gap-2"><p>Total Wallet Balance</p><button type="button" onClick={() => setBalanceVisible(!balanceVisible)} className="grid h-7 w-7 place-items-center rounded-full border border-[#18ff8a]/20 bg-[#18ff8a]/10 text-[#18ff8a]" aria-label={balanceVisible ? "Hide wallet balance" : "Show wallet balance"} aria-pressed={!balanceVisible}>{balanceVisible ? <Eye size={15}/> : <EyeOff size={15}/>}</button></div><h2>{balanceVisible ? usd(total) : BALANCE_MASK}</h2><div className="mt-2 flex items-center gap-2"><span>{balanceVisible ? `${total.toFixed(2)} USDT` : `${BALANCE_MASK} USDT`}</span><em>{balanceVisible ? total>0?"+0.00% today":"0.00% today" : BALANCE_MASK}</em></div></div><div className="wallet-total-actions"><button onClick={onOpenDeposit}><Plus size={16}/>Add Funds</button><button onClick={onOpenWithdrawal}><Send size={16}/>Withdraw</button></div></section>;
}

function WalletTypeCards({spot,ai,futures,balanceVisible}:{spot:number;ai:number;futures:number;balanceVisible:boolean}) {
  const items=[
    ["Spot Wallet",spot,Wallet,"green"],
    ["AI Wallet",ai,Bot,"purple"],
    ["Futures Wallet",futures,LineChart,"blue"],
  ] as const;
  return <section className="wallet-type-grid">{items.map(([label,value,Icon,tone])=><div key={label} className="wallet-glass wallet-type-card"><div className="wallet-type-head"><span className={`wallet-type-icon wallet-type-${tone}`}><Icon size={16}/></span><p>{label}</p></div><div className="wallet-type-body"><strong>{balanceVisible ? value.toFixed(2) : BALANCE_MASK}</strong></div></div>)}</section>;
}

function WalletQuickActions({onOpenDeposit,onOpenWithdrawal,onOpenTransfer,onHistory,onAddressBook}:{onOpenDeposit:()=>void;onOpenWithdrawal:()=>void;onOpenTransfer:()=>void;onHistory:()=>void;onAddressBook:()=>void}) {
  const actions=[["Deposit",ArrowDownToLine,onOpenDeposit],["Withdraw",Send,onOpenWithdrawal],["Transfer",ArrowLeftRight,onOpenTransfer],["History",FileClock,onHistory],["Address Book",QrCode,onAddressBook]] as const;
  return <section className="wallet-glass wallet-actions">{actions.map(([label,Icon,onClick])=><button key={label} onClick={onClick}><span><Icon size={18}/></span><p>{label==="Address Book"?<><b>Address</b><b>Book</b></>:label}</p></button>)}</section>;
}

function WalletBalancesCard({assets,balanceVisible,onOpenDeposit,onOpenWithdrawal}:{assets:(AppCoin&{volume?:number;live?:boolean})[];balanceVisible:boolean;onOpenDeposit:()=>void;onOpenWithdrawal:()=>void}) {
  return <section className="wallet-glass wallet-balances-card"><div className="wallet-card-head"><h2>Wallet Balances</h2><label><span>Hide Small Balances</span><input type="checkbox" /></label></div><div className="wallet-asset-list">{assets.length?assets.map(asset=><WalletAssetRow key={asset.symbol} asset={asset} balanceVisible={balanceVisible} onOpenDeposit={onOpenDeposit} onOpenWithdrawal={onOpenWithdrawal}/>):<EmptyState title="No wallet assets available" icon={Wallet}/>}</div></section>;
}

function WalletAssetRow({asset,balanceVisible,onOpenDeposit,onOpenWithdrawal}:{asset:AppCoin&{volume?:number;live?:boolean};balanceVisible:boolean;onOpenDeposit:()=>void;onOpenWithdrawal:()=>void}) {
  const value=asset.balance*asset.price;
  return <article className="wallet-asset-row"><CoinMark symbol={asset.symbol} color={asset.color} logoPath={assetLogoPath(asset.symbol, asset)} /><div className="min-w-0"><div className="flex items-center gap-1.5"><p>{asset.symbol}</p><span>{asset.symbol==="USDT"?"BEP20":asset.symbol==="SHINE"?"Solana":"Spot"}</span></div><em>{asset.name}</em></div><div className="min-w-0 text-right"><strong>{balanceVisible ? compact(asset.balance) : BALANCE_MASK}</strong><small>{balanceVisible ? usd(value) : BALANCE_MASK}</small></div><div className="wallet-asset-actions">{asset.symbol==="USDT"?<><button onClick={onOpenDeposit}>+</button><button onClick={onOpenWithdrawal}>-</button></>:<ChevronRight size={18}/>}</div></article>;
}

function WalletSecurityCard() {
  return <section className="wallet-glass wallet-security-card"><ShieldLockSvg/><div className="min-w-0 flex-1"><h2>Your assets are safe with Voltix</h2><p>Bank-grade security & instant transactions</p></div><button>Security Center</button></section>;
}

function ShieldLockSvg() {
  return <svg width="62" height="62" viewBox="0 0 62 62" className="wallet-shield-svg" aria-hidden="true"><defs><linearGradient id="shieldGrad" x1="15" y1="5" x2="47" y2="55"><stop stopColor="#eafff4"/><stop offset=".42" stopColor="#18ff8a"/><stop offset="1" stopColor="#047a49"/></linearGradient></defs><ellipse cx="31" cy="52" rx="22" ry="6" fill="#18ff8a" opacity=".16"/><path d="M31 5 49 13v15c0 13-8 21-18 27C21 49 13 41 13 28V13Z" fill="url(#shieldGrad)" fillOpacity=".18" stroke="#18ff8a"/><rect x="22" y="28" width="18" height="14" rx="4" fill="#07130f" stroke="#eafff4" strokeOpacity=".55"/><path d="M26 28v-5a5 5 0 0 1 10 0v5" stroke="#18ff8a" strokeWidth="2"/></svg>;
}

function ActivityRows({rows}:{rows:readonly WalletActivity[]}) { return <div className="mt-4 space-y-4">{rows.length?rows.map(([I,t,a,s,d],index)=><div className="flex items-center gap-3" key={`${t}-${a}-${index}`}><div className="shrink-0 rounded-xl bg-white/5 p-2.5 text-slate-400"><I size={17}/></div><div className="min-w-0 flex-1"><p className="text-sm font-semibold leading-snug">{t}</p><p className="text-[10px] text-mint">{s}</p><p className="mt-0.5 text-[9px] leading-tight text-slate-500">{d}</p></div><p className="shrink-0 text-right text-xs font-bold">{a}</p></div>):<p className="py-6 text-center text-xs text-slate-500">No records available</p>}</div> }

function DepositModal({close,notify,createDeposit}:{close:()=>void;notify:(s:string)=>void;createDeposit:(input:DepositInput)=>Promise<{ok:boolean;message:string;deposit?:DepositResult}>}) { const [amount,setAmount]=useState(""); const [network,setNetwork]=useState("BSC"); const [payCurrency,setPayCurrency]=useState("usdtbsc"); const [error,setError]=useState(""); const [submitting,setSubmitting]=useState(false); const [deposit,setDeposit]=useState<DepositResult|null>(null); const value=Number(amount); const payAddress=deposit?.payAddress ?? ""; const qrValue=payAddress || deposit?.providerPaymentId || ""; const copyPayment=()=>{if(!payAddress){notify("Payment address unavailable");return;}navigator.clipboard?.writeText(payAddress);notify("Payment address copied");}; const submit=async()=>{if(value<=0){setError("Enter a valid deposit amount");return;}setSubmitting(true);const result=await createDeposit({amount:value,network,payCurrency});setSubmitting(false);if(!result.ok){setError(result.message||"NOWPayments deposit failed");return;}setError("");setDeposit(result.deposit??null);}; return <div className="fixed inset-0 z-[70] grid place-items-end bg-black/70 p-0 backdrop-blur-sm sm:place-items-center sm:p-4"><div className="w-full max-w-md rounded-t-3xl border border-line bg-[#111c18] p-6 sm:rounded-3xl"><div className="flex justify-between"><div><h3 className="text-xl font-black">Create Deposit</h3><p className="mt-1 text-xs text-slate-500">Send only the selected coin/network via NOWPayments.</p></div><button onClick={close}><X/></button></div>{deposit?<><div className="mx-auto my-6 grid h-44 w-44 place-items-center rounded-2xl bg-white p-3">{qrValue?<img src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(qrValue)}`} alt="NOWPayments payment QR code" className="h-full w-full object-contain"/>:<div className="grid h-full w-full place-items-center bg-ink p-2 text-center text-[10px] font-bold text-slate-500">Payment QR unavailable</div>}</div><div className="space-y-2 rounded-xl border border-line bg-ink/60 p-4 text-xs"><LineItem label="Payment ID" value={deposit.providerPaymentId ?? "Pending"}/><LineItem label="Status" value={deposit.paymentStatus ?? deposit.status}/><LineItem label="Amount" value={`${deposit.amount.toFixed(2)} ${deposit.asset}`}/><LineItem label="Currency" value={deposit.payCurrency ?? payCurrency.toUpperCase()}/><LineItem label="Network" value={deposit.networkName}/></div><button onClick={copyPayment} className="mt-3 flex w-full items-center gap-3 rounded-xl border border-line bg-ink p-3 text-left"><span className="min-w-0 flex-1 break-all text-xs text-slate-300">{payAddress || "Payment address unavailable"}</span><Copy size={16} className="shrink-0 text-lime"/></button><div className="mt-4 rounded-xl bg-[#2a2412] p-3 text-[11px] leading-5 text-[#c9b98d]">Deposit will credit to Spot Wallet only after NOWPayments marks the payment confirmed or finished.</div></>:<><label className="mt-5 block text-xs font-bold text-slate-400">Amount<input inputMode="decimal" value={amount} onChange={e=>{setAmount(e.target.value);setError("");}} placeholder="0.00" className="mt-2 w-full rounded-xl border border-line bg-ink px-4 py-3 text-white outline-none focus:border-lime/50"/></label><label className="mt-4 block text-xs font-bold text-slate-400">Network<select value={network} onChange={e=>{setNetwork(e.target.value);setPayCurrency(e.target.value==="TRON"?"usdttrc20":e.target.value==="ETH"?"usdterc20":"usdtbsc");}} className="mt-2 w-full rounded-xl border border-line bg-ink p-3 text-white"><option value="BSC">BNB Smart Chain (BEP20)</option><option value="TRON">TRON (TRC20)</option><option value="ETH">Ethereum (ERC20)</option></select></label><label className="mt-4 block text-xs font-bold text-slate-400">Payment currency<select value={payCurrency} onChange={e=>setPayCurrency(e.target.value)} className="mt-2 w-full rounded-xl border border-line bg-ink p-3 text-white"><option value="usdtbsc">USDT BSC</option><option value="usdttrc20">USDT TRC20</option><option value="usdterc20">USDT ERC20</option><option value="btc">BTC</option><option value="eth">ETH</option></select></label><div className="mt-4 rounded-xl bg-[#2a2412] p-3 text-[11px] leading-5 text-[#c9b98d]">Minimum deposit: 10 USDT. Send only the selected coin/network via NOWPayments. Manual tx hashes are not accepted.</div></>}{error&&<p className="mt-2 text-xs text-danger">{error}</p>}<button onClick={submit} disabled={submitting||Boolean(deposit)} className="mt-5 w-full rounded-xl bg-lime py-3.5 text-xs font-black text-ink disabled:opacity-60">{submitting?"Creating...":deposit?"Payment Created":"Create Deposit"}</button></div></div> }

function TeamScreen({notify,currentUser}:{notify:(s:string)=>void;currentUser:CurrentUser|null}) {
  const [shareOpen,setShareOpen]=useState(false);
  const [team,setTeam]=useState<TeamSnapshot | null>(null);
  useEffect(()=>{
    let active=true;
    if(!currentUser){
      setTeam(null);
      return;
    }
    fetch("/api/team",{cache:"no-store",credentials:"include"})
      .then(response=>response.ok?response.json():Promise.reject())
      .then(data=>{if(active)setTeam(data?.authenticated?data.team:null);})
      .catch(()=>{if(active)setTeam(null);});
    return()=>{active=false;};
  },[currentUser]);
  const stats=team?.stats ?? {};
  const members=team?.members ?? [];
  const referralLink=useMemo(() => {
    const fallback = buildReferralLink(team?.referralUid, getClientAppOrigin()) ?? "";
    const link = team?.referralLink || fallback;
    if (/^https?:\/\/localhost(?::\d+)?\b/i.test(link)) return fallback;
    return link;
  }, [team?.referralLink, team?.referralUid]);
  const copyReferral=()=>{if(!referralLink){notify("Referral link unavailable");return;}navigator.clipboard?.writeText(referralLink);fetch("/api/audit/referral-copy",{method:"POST",credentials:"include"}).catch(()=>{});notify("Referral link copied");};
  const shareReferral=async()=>{if(!referralLink){notify("Referral link unavailable");return;}const shared=await nativeShareReferral(referralLink).catch(()=>false);if(!shared)setShareOpen(true);};

  return <div className="space-y-5">
    <div><h2 className="text-2xl font-black">My Network</h2><p className="mt-1 text-sm text-slate-500">Grow your team and unlock rewards</p></div>
    <section className="rounded-2xl border border-lime/20 bg-gradient-to-br from-[#18291f] to-panel px-4 py-3"><div className="flex min-w-0 items-center gap-3"><div className="min-w-0 flex-1"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Referral Link</p><p className="mt-1 truncate text-xs font-bold text-white sm:text-sm">{referralLink || "Referral link unavailable"}</p></div><div className="flex shrink-0 items-center gap-2"><button onClick={copyReferral} aria-label="Copy referral link" className="grid h-9 w-9 place-items-center rounded-xl bg-lime text-ink"><Copy size={15}/></button><button onClick={shareReferral} aria-label="Share referral link" className="grid h-9 w-9 place-items-center rounded-xl border border-line bg-white/5 text-lime"><Share2 size={15}/></button></div></div></section>
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4"><Stat label="Direct team" value={String(stats.directTeamCount ?? 0)} /><Stat label="Total network" value={String(stats.totalNetworkCount ?? 0)} /><Stat label="Active" value={String(stats.activeUsersCount ?? 0)} /><Stat label="Team volume" value={usd(stats.teamVolume ?? 0)} /></div>
    <section className={`${card} overflow-hidden`}>
      <div className="flex items-center justify-between gap-3 border-b border-line p-5"><div className="min-w-0"><h3 className="font-bold">Team members</h3><p className="mt-1 text-xs text-slate-500">Across all levels</p></div><div className="flex shrink-0 items-center gap-2"><Link href="/team/top-up" className="rounded-xl border border-lime/30 bg-lime px-3 py-2 text-[10px] font-black text-ink shadow-[0_0_18px_rgba(24,255,138,.18)]">Top-up Team</Link><button className="flex items-center gap-1 text-xs text-slate-400">All levels <ChevronDown size={14}/></button></div></div>
      {members.length?members.map((m,i)=><div key={m.id} className="flex items-center gap-3 border-b border-line/60 p-4 last:border-0"><div className={`grid h-10 w-10 place-items-center rounded-full text-xs font-black ${i<3?"bg-lime/10 text-lime":"bg-white/5 text-slate-400"}`}>{m.initials}</div><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><p className="truncate text-sm font-bold">{m.name}</p><span className="rounded bg-white/5 px-1.5 py-0.5 text-[9px] text-slate-500">L{m.level}</span></div><p className="mt-1 text-[10px] text-slate-500">Joined {joinedLabel(m.joinedAt)}</p></div><div className="text-right"><p className="text-xs font-bold">{usd(m.businessAmount)}</p><p className="mt-1 text-[10px] text-mint">• {m.status}</p></div></div>):<div className="p-5 text-xs text-slate-500">No team members yet</div>}
    </section>
    {shareOpen&&referralLink&&<ReferralShareSheet link={referralLink} close={()=>setShareOpen(false)} copied={()=>{copyReferral();setShareOpen(false);}}/>}
  </div>;
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

function P2PTransferModal({assets,close,sendTransfer}:{assets:P2PAsset[];close:()=>void;sendTransfer:(input:P2PTransferInput)=>Promise<{ok:boolean;message:string;transfer?:unknown}>}) {
  const ordered=useMemo(()=>[...assets].sort((a,b)=>a.symbol==="USDT"?-1:b.symbol==="USDT"?1:a.symbol.localeCompare(b.symbol)),[assets]);
  const [asset,setAsset]=useState(ordered[0]?.symbol ?? "USDT");
  const [receiver,setReceiver]=useState("");
  const [amount,setAmount]=useState("");
  const [note,setNote]=useState("");
  const [error,setError]=useState("");
  const [confirming,setConfirming]=useState(false);
  const [submitting,setSubmitting]=useState(false);
  const [idempotencyKey,setIdempotencyKey]=useState("");
  const [transactionPin,setTransactionPin]=useState("");
  const [mobileVerificationToken,setMobileVerificationToken]=useState("");
  const selected=ordered.find(item=>item.symbol===asset) ?? ordered[0];
  const value=Number(amount)||0;
  const reset=()=>{setError("");setConfirming(false);};
  const review=()=>{setError("");if(!selected){setError("No available asset to send");return;}if(!receiver.trim()){setError("Enter receiver UID or email");return;}if(value<=0){setError("Enter a valid amount");return;}if(value>selected.balance){setError(`Insufficient ${selected.symbol} balance`);return;}setIdempotencyKey(crypto.randomUUID());setConfirming(true);};
  const useBiometric=async()=>{setError("");const token=await requestMobileTransactionToken("p2p").catch(()=>null);if(!token){setError("Biometric unavailable. Use Transaction PIN.");return;}setMobileVerificationToken(token);};
  const submit=async()=>{if(!selected||submitting)return;if(!mobileVerificationToken&&!transactionPin){setError("Transaction PIN required.");return;}if(!mobileVerificationToken&&transactionPin.length<6){setError("Enter a valid 6-digit Transaction PIN.");return;}setSubmitting(true);const result=await sendTransfer({receiver:receiver.trim(),asset:selected.symbol,amount:value,note:note.trim()||undefined,idempotencyKey,transactionPin,mobileVerificationToken});setSubmitting(false);if(!result.ok){setTransactionPin("");setMobileVerificationToken("");setConfirming(false);setError(result.message||"P2P transfer failed");return;}setTransactionPin("");setMobileVerificationToken("");close();};
  return <div className="fixed inset-0 z-[80] grid place-items-end bg-black/70 backdrop-blur-sm sm:place-items-center sm:p-4"><div className="flex max-h-[92vh] w-full max-w-md flex-col rounded-t-3xl border border-line bg-[#111c18] sm:rounded-3xl"><header className="flex items-start justify-between border-b border-line p-5"><div><h3 className="text-xl font-black">P2P Transfer</h3><p className="mt-1 text-xs text-slate-500">Internal user-to-user Spot Wallet transfer.</p></div><button onClick={close} aria-label="Close P2P transfer"><X/></button></header>{confirming&&selected?<><div className="flex-1 space-y-4 overflow-y-auto p-5"><div className="rounded-2xl border border-lime/20 bg-lime/[.06] p-4"><div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-xl bg-lime text-ink"><Send size={19}/></span><p className="text-sm font-bold text-white">You are sending {value.toFixed(8).replace(/\.?0+$/,"")} {selected.symbol} to {receiver.trim()}</p></div></div><div className="space-y-2 rounded-xl border border-line bg-ink/60 p-4"><LineItem label="Asset" value={selected.symbol}/><LineItem label="Amount" value={`${value.toFixed(8).replace(/\.?0+$/,"")} ${selected.symbol}`}/><LineItem label="Receiver" value={receiver.trim()}/>{note.trim()&&<LineItem label="Note" value={note.trim()}/>}</div><TransactionPinInput label="Transaction PIN" value={transactionPin} onChange={setTransactionPin} autoFocus/><button type="button" onClick={useBiometric} className="w-full rounded-xl border border-lime/30 bg-lime/10 py-3 text-xs font-black text-lime">{mobileVerificationToken?"Biometric ready":"Use biometric instead"}</button>{error&&<p className="text-xs text-danger">{error}</p>}</div><div className="grid grid-cols-2 gap-3 border-t border-line p-4"><button onClick={()=>setConfirming(false)} disabled={submitting} className="rounded-xl border border-line py-3 text-xs font-black text-slate-300 disabled:opacity-60">Cancel</button><button onClick={submit} disabled={submitting||(!mobileVerificationToken&&transactionPin.length!==6)} className="rounded-xl bg-lime py-3 text-xs font-black text-ink disabled:opacity-60">{submitting?"Sending...":"Confirm"}</button></div></>:<><div className="flex-1 space-y-4 overflow-y-auto p-5"><label className="block text-xs font-bold text-slate-400">Select coin/asset<select value={asset} onChange={e=>{setAsset(e.target.value);reset();}} className="mt-2 w-full rounded-xl border border-line bg-ink p-3 text-white">{ordered.length?ordered.map(item=><option key={item.symbol} value={item.symbol}>{item.symbol} - {item.name}</option>):<option value="USDT">No available assets</option>}</select></label><div className="rounded-xl border border-line bg-ink/60 p-4"><LineItem label="Available balance" value={selected?`${selected.balance.toFixed(8).replace(/\.?0+$/,"")} ${selected.symbol}`:"0"}/><LineItem label="Source" value="Spot Wallet"/></div><label className="block text-xs font-bold text-slate-400">Receiver UID or email<input value={receiver} onChange={e=>{setReceiver(e.target.value);reset();}} placeholder="UID or email" className="mt-2 w-full rounded-xl border border-line bg-ink px-4 py-3 text-white outline-none focus:border-lime/50"/></label><label className="block text-xs font-bold text-slate-400">Amount<div className={`mt-2 flex items-center rounded-xl border bg-ink ${error?"border-danger/60":"border-line focus-within:border-lime/50"}`}><input inputMode="decimal" value={amount} onChange={e=>{setAmount(e.target.value);reset();}} placeholder="0.00" className="min-w-0 flex-1 bg-transparent px-4 py-3 text-white outline-none"/>{selected&&<button onClick={()=>{setAmount(String(selected.balance));reset();}} className="px-4 text-xs font-black text-lime">MAX</button>}<span className="pr-4 text-xs text-slate-500">{selected?.symbol??""}</span></div></label><label className="block text-xs font-bold text-slate-400">Note optional<textarea value={note} onChange={e=>{setNote(e.target.value);reset();}} rows={3} maxLength={160} className="mt-2 w-full resize-none rounded-xl border border-line bg-ink p-3 text-white outline-none focus:border-lime/50"/></label>{error&&<p className="text-xs text-danger">{error}</p>}</div><div className="border-t border-line p-4"><button onClick={review} disabled={!ordered.length} className="w-full rounded-xl bg-lime py-3.5 text-xs font-black text-ink disabled:opacity-60">Confirm Transfer</button></div></>}</div></div>;
}

function WalletTransferModal({initialFrom,initialTo,balances,close,transfer}:{initialFrom:UserWallet;initialTo:UserWallet;balances:Record<UserWallet,number>;close:()=>void;transfer:(from:UserWallet,to:UserWallet,amount:number)=>Promise<boolean>}) {
  const sourceWallets:UserWallet[]=["SPOT","FUTURES"];
  const transferWallets:UserWallet[]=["SPOT","FUTURES","AI"];
  const [from,setFrom]=useState<UserWallet>(sourceWallets.includes(initialFrom)?initialFrom:"SPOT");
  const [to,setTo]=useState<UserWallet>(initialTo==="AI"||initialTo!==from?initialTo:"FUTURES");
  const [amount,setAmount]=useState("");
  const [error,setError]=useState("");
  const [confirming,setConfirming]=useState(false);
  const destinations=transferWallets.filter(wallet=>wallet!==from);
  const value=Number(amount)||0;
  const label=(wallet:UserWallet)=>displayWalletName(wallet);
  const resetReview=()=>{setConfirming(false);setError("");};
  const changeFrom=(wallet:UserWallet)=>{setFrom(wallet);if(wallet===to)setTo(transferWallets.find(item=>item!==wallet)!);resetReview();};
  const changeTo=(wallet:UserWallet)=>{setTo(wallet);resetReview();};
  const swap=()=>{if(to==="AI")return;const nextFrom=to;setTo(from);setFrom(nextFrom);resetReview();};
  const review=()=>{if(value<=0){setError("Enter a valid amount");return;}if(value>balances[from]){setError(`Insufficient ${displayWalletName(from)} balance`);return;}setConfirming(true);};
  const continueTransfer=async()=>{if(!await transfer(from,to,value)){setConfirming(false);setError("Transfer could not be completed");}};
  return <div className="fixed inset-0 z-[70] bg-[#0a120f] sm:grid sm:place-items-center sm:bg-black/70 sm:p-4 sm:backdrop-blur-sm"><div className="flex min-h-full w-full flex-col bg-[#111c18] sm:min-h-0 sm:max-w-md sm:rounded-3xl sm:border sm:border-line"><header className="flex items-center justify-between border-b border-line px-5 py-4"><h3 className="text-xl font-black">Transfer</h3><button onClick={close} aria-label="Close transfer"><X/></button></header>{confirming?<><div className="flex-1 space-y-5 overflow-y-auto px-5 py-5 pb-28"><section className="rounded-xl border border-line bg-ink/60 p-4 text-xs leading-5 text-slate-400"><p>Review this transfer before continuing. AI funds cannot be transferred back to Spot or Futures.</p></section><div className="space-y-2 rounded-xl border border-line bg-ink/60 p-4"><LineItem label="Transfer amount" value={`${value.toFixed(2)} USDT`}/><LineItem label="Receivable amount" value={`${value.toFixed(2)} USDT`}/></div></div><div className="fixed inset-x-0 bottom-0 grid grid-cols-2 gap-3 border-t border-line bg-[#111c18] p-4 sm:static sm:rounded-b-3xl"><button onClick={()=>setConfirming(false)} className="rounded-xl border border-line py-4 text-sm font-black text-slate-300">Cancel</button><button onClick={continueTransfer} className="rounded-xl bg-lime py-4 text-sm font-black text-ink">Continue</button></div></>:<><div className="flex-1 space-y-5 overflow-y-auto px-5 py-5 pb-28"><section className="relative rounded-2xl border border-line bg-ink/60 p-4"><label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">From<select value={from} onChange={e=>changeFrom(e.target.value as UserWallet)} className="mt-2 w-full bg-transparent text-base font-bold text-white outline-none">{sourceWallets.map(wallet=><option key={wallet} value={wallet} className="bg-ink">{label(wallet)}</option>)}</select></label><div className="my-4 border-t border-line"/><label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">To<select value={to} onChange={e=>changeTo(e.target.value as UserWallet)} className="mt-2 w-full bg-transparent text-base font-bold text-white outline-none">{destinations.map(wallet=><option key={wallet} value={wallet} className="bg-ink">{label(wallet)}</option>)}</select></label><button onClick={swap} disabled={to==="AI"} className="absolute right-5 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full border border-line bg-panel text-lime disabled:opacity-30" aria-label="Swap wallets"><ArrowLeftRight size={18} className="rotate-90"/></button></section><label className="block text-xs font-bold text-slate-400">Coin<select className="mt-2 w-full rounded-xl border border-line bg-ink p-4 text-sm font-bold text-white"><option>USDT</option></select></label><div><div className="flex items-center justify-between"><label className="text-xs font-bold text-slate-400">Amount</label><span className="text-[11px] text-slate-500">Available {balances[from].toFixed(2)} USDT</span></div><div className={`mt-2 flex items-center rounded-xl border bg-ink ${error?"border-danger/60":"border-line focus-within:border-lime/50"}`}><input inputMode="decimal" value={amount} onChange={e=>{setAmount(e.target.value);resetReview();}} placeholder="0.00" className="min-w-0 flex-1 bg-transparent px-4 py-4 text-lg font-bold outline-none"/><button onClick={()=>{setAmount(balances[from].toFixed(2));resetReview();}} className="px-4 text-xs font-black text-lime">MAX</button><span className="pr-4 text-xs text-slate-500">USDT</span></div>{error&&<p className="mt-2 text-xs text-danger">{error}</p>}</div></div><div className="fixed inset-x-0 bottom-0 border-t border-line bg-[#111c18] p-4 sm:static sm:rounded-b-3xl"><button onClick={review} className="w-full rounded-xl bg-lime py-4 text-sm font-black text-ink">Confirm Transfer</button></div></>}</div></div>
}

function WithdrawalModal({balances,aiTradeWithdrawalUnlocked:_aiTradeWithdrawalUnlocked,close,withdraw}:{balances:Record<"SPOT"|"AI",number>;aiTradeWithdrawalUnlocked:boolean;close:()=>void;withdraw:(input:WithdrawalInput)=>Promise<WithdrawalResult>}) {
  const [walletType,setWalletType]=useState<"SPOT"|"AI">("SPOT");
  const [address,setAddress]=useState("");
  const [network,setNetwork]=useState("BSC");
  const [amount,setAmount]=useState("");
  const [transactionPin,setTransactionPin]=useState("");
  const [mobileVerificationToken,setMobileVerificationToken]=useState("");
  const [error,setError]=useState("");
  const [earlyBreakdown,setEarlyBreakdown]=useState<EarlyWithdrawalBreakdown|null>(null);
  const [submitting,setSubmitting]=useState(false);
  const value=Number(amount)||0;
  const available=balances[walletType];
  const fixedFee=value>0?2:0;
  const percentageFee=value*.05;
  const totalFee=fixedFee+percentageFee;
  const received=Math.max(0,value-totalFee);
  const label=(wallet:"SPOT"|"AI")=>displayWalletName(wallet).replace(" Wallet","");
  const useBiometric=async()=>{setError("");const token=await requestMobileTransactionToken("withdrawal").catch(()=>null);if(!token){setError("Biometric unavailable. Use Transaction PIN.");return;}setMobileVerificationToken(token);};
  const submit=async(acceptEarlyWithdrawalCharge=false)=>{setError("");if(!address.trim()){setError("Enter an external wallet or exchange address");return;}if(value<=0){setError("Enter a valid withdrawal amount");return;}if(value>available){setError(`Insufficient ${displayWalletName(walletType)} balance`);return;}if(received<=0){setError("Withdrawal amount must exceed the total fee");return;}if(!mobileVerificationToken&&!transactionPin){setError("Transaction PIN required.");return;}if(!mobileVerificationToken&&transactionPin.length<6){setError("Enter a valid 6-digit Transaction PIN.");return;}setSubmitting(true);const result=await withdraw({walletType,amount:value,address,network,transactionPin,mobileVerificationToken,acceptEarlyWithdrawalCharge});setSubmitting(false);if(result.requiresConfirmation&&result.breakdown){setEarlyBreakdown(result.breakdown);return;}if(!result.ok){setTransactionPin("");setMobileVerificationToken("");setError(result.message||"Withdrawal request failed");return;}setTransactionPin("");setMobileVerificationToken("");};
  const early=earlyBreakdown;
  return <div className="fixed inset-0 z-[70] grid place-items-end bg-black/70 backdrop-blur-sm sm:place-items-center sm:p-4"><div className="w-full max-w-md rounded-t-3xl border border-line bg-[#111c18] p-6 sm:rounded-3xl"><div className="flex items-start justify-between"><div><h3 className="text-xl font-black">Send</h3><p className="mt-1 text-xs text-slate-500">Withdrawals are manual after balance validation.</p></div><button onClick={close} aria-label="Close withdrawal"><X/></button></div>{early?<><div className="mt-5 rounded-xl border border-lime/20 bg-ink/60 p-4 text-xs leading-5 text-slate-300"><h3 className="text-lg font-black text-white">Early Withdrawal</h3><div className="mt-3 rounded-xl border border-white/[.08] bg-black/20 p-3"><p className="font-bold text-lime">Current Progress:</p><p className="mt-1">{early.completedPercentage.toFixed(2)}% Completed</p></div><div className="mt-3"><p className="font-bold text-lime">Early Withdrawal Charges:</p><p className="mt-1">- 20%</p><p>- 5% Withdrawal Fee</p><p>- $2 Fixed Fee</p></div><p className="mt-3">Press "Confirm Withdrawal" to continue.</p></div><div className="mt-4 space-y-2 rounded-xl border border-line bg-ink/60 p-4"><LineItem label="Capital Amount" value={`$${early.capitalAmount.toFixed(2)}`}/><LineItem label="Earned Profit" value={`$${early.earnedProfit.toFixed(2)}`}/><LineItem label="Required Profit" value={`$${early.requiredProfit.toFixed(2)}`}/><LineItem label="Withdrawal Amount" value={`$${early.withdrawalAmount.toFixed(2)}`}/><LineItem label="20% Early Withdrawal Charge" value={`$${early.earlyWithdrawalCharge.toFixed(2)}`}/><LineItem label="5% Withdrawal Fee" value={`$${early.percentageFee.toFixed(2)}`}/><LineItem label="Fixed Fee" value={`$${early.fixedFee.toFixed(2)}`}/><LineItem label="Total Fees" value={`$${early.totalFees.toFixed(2)}`}/><LineItem label="Net Receivable" value={`$${early.netAmount.toFixed(2)}`}/></div><div className="mt-5 grid grid-cols-2 gap-3"><button onClick={()=>setEarlyBreakdown(null)} disabled={submitting} className="rounded-xl border border-line py-3 text-xs font-black text-slate-300 disabled:opacity-60">Cancel</button><button onClick={()=>submit(true)} disabled={submitting} className="rounded-xl bg-lime py-3 text-xs font-black text-ink disabled:opacity-60">{submitting?"Submitting...":"Confirm Withdrawal"}</button></div></>:<><label className="mt-5 block text-xs font-bold text-slate-400">Wallet<select value={walletType} onChange={e=>{setWalletType(e.target.value as "SPOT"|"AI");setError("");setMobileVerificationToken("");setEarlyBreakdown(null);}} className="mt-2 w-full rounded-xl border border-line bg-ink p-3 text-white"><option value="SPOT">Spot Wallet</option><option value="AI">AI Wallet</option></select></label><label className="mt-4 block text-xs font-bold text-slate-400">Amount</label><div className={`mt-2 flex items-center rounded-xl border bg-ink ${error?"border-danger/60":"border-line"}`}><input inputMode="decimal" value={amount} onChange={e=>{setAmount(e.target.value);setError("");setMobileVerificationToken("");setEarlyBreakdown(null);}} placeholder="0.00" className="min-w-0 flex-1 bg-transparent px-4 py-3.5 outline-none"/><button onClick={()=>setAmount(available.toFixed(2))} className="px-4 text-xs font-black text-lime">MAX</button><span className="pr-4 text-xs text-slate-500">USDT</span></div><p className="mt-1 text-[10px] text-slate-500">Available: {available.toFixed(2)} USDT</p><label className="mt-4 block text-xs font-bold text-slate-400">External wallet or exchange address<input value={address} onChange={e=>{setAddress(e.target.value);setError("");setMobileVerificationToken("");setEarlyBreakdown(null);}} placeholder="0x... or exchange deposit address" className="mt-2 w-full rounded-xl border border-line bg-ink px-4 py-3 text-white outline-none focus:border-lime/50"/></label><label className="mt-4 block text-xs font-bold text-slate-400">Network<select value={network} onChange={e=>setNetwork(e.target.value)} className="mt-2 w-full rounded-xl border border-line bg-ink p-3 text-white"><option value="BSC">BNB Smart Chain (BEP20)</option><option value="TRON">TRON (TRC20)</option><option value="ETH">Ethereum (ERC20)</option></select></label><div className="mt-4"><TransactionPinInput label="Transaction PIN" value={transactionPin} onChange={setTransactionPin} autoFocus/></div><button type="button" onClick={useBiometric} className="mt-3 w-full rounded-xl border border-lime/30 bg-lime/10 py-3 text-xs font-black text-lime">{mobileVerificationToken?"Biometric ready":"Use biometric instead"}</button>{error&&<p className="mt-2 text-xs text-danger">{error}</p>}<div className="mt-4 space-y-2 rounded-xl border border-line bg-ink/60 p-4"><LineItem label="Wallet" value={`${label(walletType)} Wallet`}/><LineItem label="Withdrawal Amount" value={`${value.toFixed(2)} USDT`}/><LineItem label="5% Withdrawal Fee" value={`${percentageFee.toFixed(2)} USDT`}/><LineItem label="$2 Fixed Fee" value={`${fixedFee.toFixed(2)} USDT`}/><LineItem label="Net Receivable" value={`${received.toFixed(2)} USDT`}/></div><button onClick={()=>submit()} disabled={submitting||(!mobileVerificationToken&&transactionPin.length!==6)} className="mt-5 w-full rounded-xl bg-lime py-3.5 text-xs font-black text-ink disabled:opacity-60">{submitting?"Submitting...":"Confirm Send"}</button></>}</div></div>
}

function VerificationRequestModal({close,notify,user}:{close:()=>void;notify:(message:string)=>void;user:CurrentUser|null}) {
  const [fullName,setFullName]=useState(user?.name?.trim() ?? "");
  const [dateOfBirth,setDateOfBirth]=useState("");
  const [country,setCountry]=useState(user?.country?.trim() ?? "");
  const [address,setAddress]=useState("");
  const [governmentIdType,setGovernmentIdType]=useState(getKycDocumentTypes(user?.country)[0]);
  const [governmentIdNumber,setGovernmentIdNumber]=useState("");
  const [frontIdImageUrl,setFrontIdImageUrl]=useState("");
  const [backIdImageUrl,setBackIdImageUrl]=useState("");
  const [selfieImageUrl,setSelfieImageUrl]=useState("");
  const [kyc,setKyc]=useState<KycSnapshot|null>(null);
  const [error,setError]=useState("");
  const [loading,setLoading]=useState(false);
  useEffect(()=>{let active=true;if(!user){setKyc(null);return;}fetch("/api/kyc",{cache:"no-store",credentials:"include"}).then(response=>response.ok?response.json():Promise.reject()).then(data=>{if(!active)return;const snapshot=data as KycSnapshot;setKyc(snapshot);const request=snapshot.request;if(request){setFullName(request.fullName??"");setDateOfBirth(request.dateOfBirth??"");setCountry(request.country??user.country??"");setAddress(request.address??"");setGovernmentIdType(request.governmentIdType??"Aadhaar Card");setGovernmentIdNumber(request.governmentIdNumber??"");setFrontIdImageUrl(request.frontIdImageUrl??"");setBackIdImageUrl(request.backIdImageUrl??"");setSelfieImageUrl(request.selfieImageUrl??"");}}).catch(()=>{if(active)setKyc(null);});return()=>{active=false};},[user]);
  const locked=kyc?.status==="APPROVED"||kyc?.status==="PENDING"||kyc?.status==="UNDER_REVIEW";
  const documentTypes=useMemo(()=>getKycDocumentTypes(country),[country]);
  const backRequired=kycDocumentRequiresBackPhoto(governmentIdType);
  useEffect(()=>{if(!documentTypes.includes(governmentIdType))setGovernmentIdType(documentTypes[0]);},[documentTypes,governmentIdType]);
  const submit=async()=>{setError("");if(!user){setError("Login required");notify("Login required");return;}if(locked){setError(kyc?.status==="APPROVED"?"Verification is already approved":"Verification request is pending");return;}if(!fullName.trim()||!dateOfBirth.trim()||!country.trim()||!address.trim()||!governmentIdNumber.trim()||!frontIdImageUrl.trim()||backRequired&&!backIdImageUrl.trim()||!selfieImageUrl.trim()){setError("Complete all verification fields");return;}setLoading(true);const response=await fetch("/api/kyc",{method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({fullName,dateOfBirth,country,address,governmentIdType,governmentIdNumber,frontIdImageUrl,backIdImageUrl,selfieImageUrl})});const data=await response.json().catch(()=>({}));setLoading(false);if(!response.ok){setError(data.error||"Verification request failed");return;}notify(data.message||"Your KYC has been submitted successfully. It is now under review.");close();};
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
          <label className="block text-xs font-bold text-slate-400">Government ID type<select value={governmentIdType} disabled={locked} onChange={e=>setGovernmentIdType(e.target.value)} className="mt-2 w-full rounded-xl border border-line bg-ink p-3 text-white disabled:text-slate-500">{documentTypes.map(type=><option key={type} value={type}>{type}</option>)}</select></label>
          <FormField label="Government ID number" value={governmentIdNumber} onChange={setGovernmentIdNumber} placeholder="Enter document number" readOnly={locked}/>
          <FormField label="Front ID image URL" value={frontIdImageUrl} onChange={setFrontIdImageUrl} placeholder="https://..." readOnly={locked}/>
          <FormField label={backRequired?"Back ID image URL":"Back ID image URL optional"} value={backIdImageUrl} onChange={setBackIdImageUrl} placeholder="https://..." readOnly={locked}/>
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
  const refreshTickets=()=>fetch("/api/support",{cache:"no-store",credentials:"include"}).then(response=>response.ok?response.json():Promise.reject()).then(data=>setTickets(Array.isArray(data.tickets)?data.tickets:[])).catch(()=>setTickets([]));
  useEffect(()=>{refreshTickets();},[]);
  const sendMessage=(text=input)=>{const clean=text.trim();if(!clean)return;setMessages(current=>[...current,{from:"user",text:clean},{from:"ai",text:"Raise a support ticket below if you need account review."}]);setInput("");};
  return <div className="fixed inset-0 z-[80] grid place-items-end bg-black/70 backdrop-blur-sm sm:place-items-center sm:p-4"><div className="flex h-[85vh] w-full max-w-md flex-col rounded-t-3xl border border-line bg-[#111c18] sm:rounded-3xl"><header className="flex items-center justify-between border-b border-line p-5"><div><h3 className="text-xl font-black">Help Center</h3><p className="mt-1 text-xs text-lime">AI assistant online</p></div><button onClick={close}><X/></button></header>{ticketOpen?<SupportTicketForm close={()=>setTicketOpen(false)} submitted={()=>{notify("Support ticket submitted");refreshTickets();setTicketOpen(false);}}/>:<><div className="border-b border-line p-3"><p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">Common help topics</p><div className="flex gap-2 overflow-x-auto no-scrollbar">{["Deposit pending","Transfer fee","Copy trade","Verification"].map(topic=><button key={topic} onClick={()=>sendMessage(topic)} className="whitespace-nowrap rounded-full border border-line px-3 py-1.5 text-[11px] text-slate-300">{topic}</button>)}</div></div><div className="flex-1 space-y-3 overflow-y-auto p-4">{messages.map((message,index)=><div key={index} className={`max-w-[85%] rounded-2xl px-4 py-3 text-xs leading-5 ${message.from==="user"?"ml-auto bg-lime text-ink":"bg-ink text-slate-300"}`}>{message.text}</div>)}<div className="pt-2"><p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">Tickets</p>{tickets.length?tickets.slice(0,3).map(ticket=><div key={ticket.id} className="mb-2 rounded-xl border border-line bg-ink/60 p-3 text-xs"><div className="flex justify-between gap-3"><span className="font-bold">{ticket.subject}</span><span className="text-lime">{ticket.status}</span></div>{ticket.attachmentUrl&&<a href={ticket.attachmentUrl} className="mt-2 inline-flex items-center gap-1.5 text-lime"><FileText size={13}/>{ticket.attachmentName||"Attachment"}</a>}{ticket.adminReply&&<p className="mt-2 text-slate-400">{ticket.adminReply}</p>}</div>):<p className="rounded-xl border border-line bg-ink/60 p-3 text-center text-xs text-slate-500">No records available</p>}</div></div><div className="border-t border-line p-4"><button onClick={()=>setTicketOpen(true)} className="mb-3 w-full rounded-xl border border-line py-2.5 text-xs font-bold text-lime">Raise Ticket</button><div className="flex gap-2"><input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")sendMessage();}} placeholder="Type your message..." className="min-w-0 flex-1 rounded-xl border border-line bg-ink px-4 py-3 text-xs outline-none focus:border-lime/50"/><button onClick={()=>sendMessage()} className="rounded-xl bg-lime px-4 text-ink"><Send size={17}/></button></div></div></>}</div></div>;
}

function SupportTicketForm({close,submitted}:{close:()=>void;submitted:()=>void}) { const [subject,setSubject]=useState(""); const [message,setMessage]=useState(""); const [attachment,setAttachment]=useState<File|null>(null); const [error,setError]=useState(""); const [loading,setLoading]=useState(false); const chooseAttachment=(file?:File)=>{setError("");if(!file){setAttachment(null);return;}if(!["image/jpeg","image/png","application/pdf"].includes(file.type)){setError("Only JPG, JPEG, PNG, or PDF attachments are allowed");return;}if(file.size>10*1024*1024){setError("Attachment must be 10MB or smaller");return;}setAttachment(file);}; const submit=async()=>{setError("");if(!subject.trim()||!message.trim()){setError("Complete all ticket fields");return;}const form=new FormData();form.set("subject",subject);form.set("message",message);if(attachment)form.set("attachment",attachment);setLoading(true);const response=await fetch("/api/support",{method:"POST",credentials:"include",body:form});const data=await response.json().catch(()=>({}));setLoading(false);if(!response.ok){setError(data.error||"Support ticket failed");return;}submitted();}; return <div className="flex-1 overflow-y-auto p-5"><button onClick={close} className="text-xs font-bold text-lime">Back to chat</button><h4 className="mt-4 text-lg font-black">Raise Ticket</h4><div className="mt-5 space-y-4"><FormField label="Subject" value={subject} onChange={setSubject} placeholder="Brief issue summary"/><label className="block text-xs font-bold text-slate-400">Message<textarea value={message} onChange={e=>setMessage(e.target.value)} rows={5} className="mt-2 w-full resize-none rounded-xl border border-line bg-ink p-3 text-white outline-none focus:border-lime/50"/></label><label className="block text-xs font-bold text-slate-400">Attachment<input type="file" accept=".jpg,.jpeg,.png,.pdf" onChange={e=>chooseAttachment(e.target.files?.[0])} className="mt-2 w-full rounded-xl border border-line bg-ink p-3 text-xs text-white outline-none file:mr-3 file:rounded-lg file:border-0 file:bg-lime file:px-3 file:py-1.5 file:text-xs file:font-black file:text-ink"/></label>{attachment&&<p className="text-xs text-slate-500">{attachment.name}</p>}</div>{error&&<p className="mt-3 text-xs text-danger">{error}</p>}<button onClick={submit} disabled={loading} className="mt-6 w-full rounded-xl bg-lime py-3.5 text-sm font-black text-ink disabled:opacity-60">{loading?"Submitting...":"Submit Ticket"}</button></div> }

function FormField({label,value,onChange,placeholder,readOnly}:{label:string;value:string;onChange:(value:string)=>void;placeholder?:string;readOnly?:boolean}) { return <label className="block text-xs font-bold text-slate-400">{label}<input value={value} readOnly={readOnly} onChange={e=>onChange(e.target.value)} placeholder={placeholder} className="mt-2 w-full rounded-xl border border-line bg-ink p-3 text-white outline-none focus:border-lime/50 read-only:text-slate-500"/></label> }

function LineItem({label,value}:{label:string;value:string}) { return <div className="flex justify-between text-xs"><span className="text-slate-500">{label}</span><span className="font-bold">{value}</span></div> }


function Stat({label,value,trend}:{label:string;value:string;trend?:string}) { return <div className="rounded-xl border border-line bg-ink/50 p-3"><p className="text-[10px] text-slate-500">{label}</p><div className="mt-1 flex items-end gap-1"><p className="font-black">{value}</p>{trend&&<span className="text-[9px] text-mint">{trend}</span>}</div></div> }




