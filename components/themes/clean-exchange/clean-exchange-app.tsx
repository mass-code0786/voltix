"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ComponentType } from "react";
import {
  ArrowDownToLine, ArrowLeftRight, ArrowUpFromLine, Bell, Bot, ChevronRight, Clock3,
  FileClock, History, Home, LineChart, MoreHorizontal, Search, Star, Wallet, Zap,
} from "lucide-react";
import { useLiveTickers } from "@/lib/use-market-data";
import styles from "./clean-exchange.module.css";

export type CleanSection = "home" | "markets" | "ai-trade" | "futures" | "wallet";
type Asset = { walletType: "SPOT" | "FUTURES" | "AI"; symbol: string; name: string; balance: number; usdValue?: number | null };
type Totals = { available?: Partial<Record<"spot" | "futures" | "aiWallet", number>>; total?: Partial<Record<"spot" | "futures" | "aiWallet", number>>; portfolio?: number };
type WalletSummary = { totalBalanceUsd?: number; todayIncome?: number };
type Dashboard = { summary?: { totalPortfolio?: number; todaysProfit?: number; aiCopyTradingIncome?: number }; user?: { vipRank?: string | null } };
type Coin = { symbol: string; name: string; pair?: string; localLogoPath?: string | null; logoUrl?: string | null; isActive?: boolean };
type Trade = { id?: string; pair?: string | null; rowLabel?: string; amount?: number; profit?: number; returnPercent?: number; remainingTime?: number; status?: string; date?: string; creditDueAt?: string };
type CopyStatus = { activeTrade?: Trade | null; history?: Trade[]; todaysTradeCount?: number; dailyTradeLimit?: number; tradeRows?: Array<{ label?: string; openTime?: string; closeTime?: string; tradeStatus?: string }> };
type HistoryRow = { id: string; title: string; asset: string; signedAmount: number; createdAt: string; status: string };
type Snapshot = { assets: Asset[]; totals: Totals; walletSummary: WalletSummary | null; dashboard: Dashboard | null; coins: Coin[]; copy: CopyStatus; history: HistoryRow[]; aiToday: number; subscription: { subscription?: { active?: boolean; remainingDays?: number } | null } | null };

const empty: Snapshot = { assets: [], totals: {}, walletSummary: null, dashboard: null, coins: [], copy: {}, history: [], aiToday: 0, subscription: null };
const routes: Record<CleanSection, string> = { home: "/clean-preview", markets: "/clean-preview/markets", "ai-trade": "/clean-preview/ai-trade", futures: "/clean-preview/futures", wallet: "/clean-preview/wallet" };

export default function CleanExchangeApp({ section }: { section: CleanSection }) {
  const [data, setData] = useState<Snapshot>(empty);
  const [loading, setLoading] = useState(true);
  const tickers = useLiveTickers();

  useEffect(() => {
    const controller = new AbortController();
    const json = (url: string) => fetch(url, { credentials: "include", cache: "no-store", signal: controller.signal }).then(r => r.ok ? r.json() : null).catch(() => null);
    Promise.all([json("/api/assets"), json("/api/dashboard"), json("/api/coins"), json("/api/copy-trade/status"), json("/api/wallet/history"), json("/api/ai-trading/overview?range=today"), json("/api/ai/subscription")]).then(([assets, dashboard, coins, copy, history, ai, subscription]) => {
      if (controller.signal.aborted) return;
      setData({ assets: assets?.assets ?? [], totals: assets?.totals ?? {}, walletSummary: assets?.walletSummary ?? null, dashboard: dashboard?.dashboard ?? null, coins: (coins?.coins ?? []).filter((c: Coin) => c.isActive !== false), copy: copy?.status ?? {}, history: history?.history ?? [], aiToday: Number(ai?.totalIncome ?? 0), subscription });
      setLoading(false);
    });
    return () => controller.abort();
  }, []);

  const markets = useMemo(() => data.coins.map(coin => {
    const pair = coin.pair || `${coin.symbol}USDT`;
    const ticker = tickers.find(item => item.symbol === pair);
    return { ...coin, pair, price: Number(ticker?.price ?? 0), change: Number(ticker?.changePercent ?? 0), volume: Number(ticker?.quoteVolume ?? 0) };
  }).filter(row => row.price > 0), [data.coins, tickers]);

  return <main className={styles.app}>
    <div className={styles.phone}>
      <CleanHeader />
      <div className={styles.content} aria-busy={loading}>
        {section === "home" && <HomePage data={data} markets={markets} loading={loading} />}
        {section === "markets" && <MarketsPage markets={markets} loading={loading} />}
        {section === "ai-trade" && <AiPage data={data} loading={loading} />}
        {section === "futures" && <FuturesPage data={data} markets={markets} loading={loading} />}
        {section === "wallet" && <WalletPage data={data} loading={loading} />}
      </div>
      <CleanBottomNavigation active={section} />
    </div>
  </main>;
}

function CleanHeader() {
  return <header className={styles.header}>
    <Link href="/clean-preview" aria-label="Voltix clean preview home"><img src="/logo.png" alt="Voltix" /></Link>
    <div className={styles.headerActions}><Search /><Link href="/profile/notifications" aria-label="Notifications"><Bell /></Link></div>
  </header>;
}

function HomePage({ data, markets, loading }: { data: Snapshot; markets: Market[]; loading: boolean }) {
  const total = totalBalance(data), today = todayIncome(data);
  return <>
    <section className={styles.balanceHero}>
      <p className={styles.eyebrow}>Total Balance</p><Money value={total} loading={loading} large />
      <p className={styles.muted}>Across your Voltix wallets</p>
      <p className={today >= 0 ? styles.positive : styles.negative}>Today {signedMoney(today)}</p>
    </section>
    <QuickActions compact />
    <Link href="/clean-preview/ai-trade" className={styles.promo}><div><span className={styles.promoIcon}><Bot /></span><h2>AI Copy Trading</h2><p>Use your active Voltix AI trade windows.</p><b>View AI Trade <ChevronRight /></b></div><Bot className={styles.promoBot} /></Link>
    <SectionTitle title="Market Overview" href="/clean-preview/markets" />
    <div className={styles.marketCards}>{markets.slice(0, 3).map(row => <MarketCard key={row.symbol} row={row} />)}{!markets.length && <Empty label="Live markets unavailable" />}</div>
    <SectionTitle title="My Wallets" href="/clean-preview/wallet" />
    <div className={styles.walletStrip}>{walletRows(data).map(row => <div className={styles.walletMini} key={row.key}><Wallet /><span>{row.label}</span><b>{money(row.value)}</b></div>)}</div>
    {data.dashboard?.user?.vipRank && <Link href="/profile/vip-benefits" className={styles.vip}><span>V</span><div><b>{data.dashboard.user.vipRank}</b><small>View your existing VIP benefits</small></div><ChevronRight /></Link>}
  </>;
}

type Market = Coin & { pair: string; price: number; change: number; volume: number };
function MarketsPage({ markets, loading }: { markets: Market[]; loading: boolean }) {
  const [filter, setFilter] = useState("All");
  const shown = filter === "Top Gainers" ? [...markets].sort((a, b) => b.change - a.change) : filter === "Top Losers" ? [...markets].sort((a, b) => a.change - b.change) : markets;
  return <>
    <PageTitle title="Markets" subtitle="Live Voltix cryptocurrency markets" />
    <div className={styles.marketSummary}><div><small>Live pairs</small><b>{loading ? "—" : markets.length}</b></div><div><small>24h gainers</small><b className={styles.positive}>{markets.filter(m => m.change > 0).length}</b></div><LineChart /></div>
    <div className={styles.pills}>{["All", "Top Gainers", "Top Losers"].map(item => <button key={item} className={filter === item ? styles.activePill : ""} onClick={() => setFilter(item)}>{item}</button>)}</div>
    <div className={styles.tableHead}><span>Pair / Volume</span><span>Last Price</span><span>24h Change</span></div>
    <div className={styles.marketList}>{shown.slice(0, 12).map(row => <MarketRow key={row.symbol} row={row} />)}{!loading && !shown.length && <Empty label="No live market data" />}</div>
  </>;
}

function AiPage({ data, loading }: { data: Snapshot; loading: boolean }) {
  const ai = walletValue(data, "aiWallet"), active = data.copy.activeTrade, history = data.copy.history ?? [];
  return <>
    <PageTitle title="AI Trade" subtitle="Your real Voltix AI trading activity" />
    <section className={`${styles.summaryCard} ${styles.aiSummary}`}><div><small>Total AI Balance</small><Money value={ai} loading={loading} large /></div><div><small>Today&apos;s Profit</small><b className={styles.positive}>{signedMoney(data.aiToday)}</b><small>{data.subscription?.subscription?.active ? `${data.subscription.subscription.remainingDays ?? 0} subscription days left` : "No active subscription"}</small></div><Bot /></section>
    <div className={styles.aiActions}><Stat icon={Bot} label="AI Trading" value={active ? "Running" : "No active trade"} /><Stat icon={Clock3} label="Trade History" value={`${history.length} records`} /><Stat icon={FileClock} label="Subscription" value={data.subscription?.subscription?.active ? "Active" : "Inactive"} /></div>
    <SectionTitle title="Active AI Trade" />
    {active ? <article className={styles.tradeCard}><div className={styles.tradeTop}><CoinLogo symbol={(active.pair ?? "AI").replace("USDT", "")} /><div><b>{formatPair(active.pair)}</b><small>{active.status ?? "Active"}</small></div><span className={styles.status}>Running</span></div><div className={styles.statGrid}><Metric label="Amount" value={money(Number(active.amount ?? 0))} /><Metric label="Profit" value={signedMoney(Number(active.profit ?? 0))} /><Metric label="Return" value={`${Number(active.returnPercent ?? 0).toFixed(2)}%`} /></div>{active.creditDueAt && <p className={styles.tradeNote}>Credit due {date(active.creditDueAt)}</p>}</article> : <Empty label="No active AI trade" />}
    <SectionTitle title="Trade windows" />
    <div className={styles.windowList}>{(data.copy.tradeRows ?? []).slice(0, 3).map((row, index) => <div key={`${row.label}-${index}`}><span>{row.label ?? `Trade ${index + 1}`}</span><b>{row.openTime && row.closeTime ? `${row.openTime} – ${row.closeTime}` : row.tradeStatus ?? "Scheduled"}</b></div>)}{!(data.copy.tradeRows ?? []).length && <Empty label="No trade windows available" />}</div>
    <Link className={styles.primaryButton} href="/dashboard?tab=aiTrade">Open AI trading</Link>
  </>;
}

function FuturesPage({ data, markets, loading }: { data: Snapshot; markets: Market[]; loading: boolean }) {
  return <>
    <PageTitle title="Futures" subtitle="Your implemented Voltix futures wallet and live markets" />
    <section className={styles.summaryCard}><div><small>Total Futures Balance</small><Money value={walletValue(data, "futures")} loading={loading} large /></div><Zap /></section>
    <div className={styles.twoActions}><Link href="/dashboard?tab=wallet&section=overview"><ArrowLeftRight />Transfer</Link><Link href="/dashboard?tab=wallet&section=ledger"><History />History</Link></div>
    <SectionTitle title="Live markets" href="/clean-preview/markets" />
    <div className={styles.tableHead}><span>Pair / Volume</span><span>Last Price</span><span>24h Change</span></div>
    <div className={styles.marketList}>{markets.slice(0, 8).map(row => <MarketRow key={row.symbol} row={row} />)}{!loading && !markets.length && <Empty label="No live market data" />}</div>
  </>;
}

function WalletPage({ data, loading }: { data: Snapshot; loading: boolean }) {
  const rows = walletRows(data);
  return <>
    <PageTitle title="My Wallet" subtitle="Manage your Voltix assets" />
    <section className={`${styles.balanceHero} ${styles.walletHero}`}><p className={styles.eyebrow}>Total Wallet Balance</p><Money value={totalBalance(data)} loading={loading} large /><p className={todayIncome(data) >= 0 ? styles.positive : styles.negative}>Today {signedMoney(todayIncome(data))}</p><Wallet /></section>
    <QuickActions />
    <SectionTitle title="Wallets" />
    <div className={styles.walletList}>{rows.map(row => <Link key={row.key} href="/dashboard?tab=wallet"><span className={styles.walletIcon}><row.icon /></span><div><b>{row.label} Wallet</b><small>Available</small></div><strong>{money(row.value)}</strong><ChevronRight /></Link>)}</div>
    <SectionTitle title="Recent Transactions" href="/dashboard?tab=wallet&section=ledger" />
    <div className={styles.transactions}>{data.history.slice(0, 4).map(item => <div key={item.id}><span className={styles.txIcon}><ArrowDownToLine /></span><div><b>{item.title}</b><small>{item.asset} · {date(item.createdAt)}</small></div><strong className={item.signedAmount >= 0 ? styles.positive : styles.negative}>{signedMoney(item.signedAmount, item.asset)}</strong></div>)}{!loading && !data.history.length && <Empty label="No transactions yet" />}</div>
  </>;
}

function QuickActions({ compact = false }: { compact?: boolean }) {
  const actions: Array<[string, string, ComponentType<{ size?: number }>, string]> = [["Deposit", "/wallet/deposit", ArrowDownToLine, "deposit"], ["Withdraw", "/wallet/withdraw", ArrowUpFromLine, "withdraw"], ["Transfer", "/dashboard?tab=wallet", ArrowLeftRight, "transfer"], [compact ? "More" : "History", "/dashboard?tab=wallet&section=ledger", compact ? MoreHorizontal : History, "history"]];
  return <nav className={styles.quickActions}>{actions.map(([label, href, Icon]) => <Link href={href} key={label}><Icon /><span>{label}</span></Link>)}</nav>;
}

function CleanBottomNavigation({ active }: { active: CleanSection }) {
  const items: Array<[CleanSection, string, ComponentType<{ size?: number }>]> = [["home", "Home", Home], ["markets", "Markets", LineChart], ["ai-trade", "AI Trade", Bot], ["futures", "Futures", FileClock], ["wallet", "Wallet", Wallet]];
  return <nav className={styles.bottomNav}>{items.map(([id, label, Icon]) => <Link key={id} href={routes[id]} aria-current={active === id ? "page" : undefined}><Icon /><span>{label}</span></Link>)}</nav>;
}

function PageTitle({ title, subtitle }: { title: string; subtitle: string }) { return <div className={styles.pageTitle}><h1>{title}</h1><p>{subtitle}</p></div>; }
function SectionTitle({ title, href }: { title: string; href?: string }) { return <div className={styles.sectionTitle}><h2>{title}</h2>{href && <Link href={href}>View all <ChevronRight /></Link>}</div>; }
function Empty({ label }: { label: string }) { return <div className={styles.empty}>{label}</div>; }
function Money({ value, loading, large }: { value: number; loading?: boolean; large?: boolean }) { return <strong className={large ? styles.moneyLarge : ""}>{loading ? "—" : money(value)}</strong>; }
function Stat({ icon: Icon, label, value }: { icon: ComponentType<{ size?: number }>; label: string; value: string }) { return <div><Icon /><b>{label}</b><small>{value}</small></div>; }
function Metric({ label, value }: { label: string; value: string }) { return <div><small>{label}</small><b>{value}</b></div>; }
function CoinLogo({ symbol, path }: { symbol: string; path?: string | null }) { return path ? <img className={styles.coinLogo} src={path} alt="" /> : <span className={styles.coinFallback}>{symbol.slice(0, 2)}</span>; }
function MarketRow({ row }: { row: Market }) { return <Link href={`/markets/${row.pair}`} className={styles.marketRow}><Star className={styles.star} /><CoinLogo symbol={row.symbol} path={row.localLogoPath} /><div><b>{row.symbol}<small>/ USDT</small></b><small>Vol {compact(row.volume)}</small></div><div><b>{price(row.price)}</b><small>≈ {money(row.price)}</small></div><strong className={row.change >= 0 ? styles.positive : styles.negative}>{signed(row.change)}%</strong></Link>; }
function MarketCard({ row }: { row: Market }) { return <Link href={`/markets/${row.pair}`} className={styles.marketCard}><div><CoinLogo symbol={row.symbol} path={row.localLogoPath} /><b>{row.symbol}</b></div><strong>{price(row.price)}</strong><span className={row.change >= 0 ? styles.positive : styles.negative}>{signed(row.change)}%</span></Link>; }

function walletValue(data: Snapshot, key: "spot" | "futures" | "aiWallet") { return Number(data.totals.total?.[key] ?? data.totals.available?.[key] ?? 0); }
function walletRows(data: Snapshot) { return [{ key: "spot", label: "Spot", value: walletValue(data, "spot"), icon: Wallet }, { key: "ai", label: "AI", value: walletValue(data, "aiWallet"), icon: Bot }, { key: "futures", label: "Futures", value: walletValue(data, "futures"), icon: LineChart }]; }
function totalBalance(data: Snapshot) { return Number(data.walletSummary?.totalBalanceUsd ?? data.totals.portfolio ?? data.dashboard?.summary?.totalPortfolio ?? 0); }
function todayIncome(data: Snapshot) { return Number(data.walletSummary?.todayIncome ?? data.dashboard?.summary?.todaysProfit ?? 0); }
function money(value: number) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number.isFinite(value) ? value : 0); }
function signedMoney(value: number, asset = "USDT") { const n = Number.isFinite(value) ? value : 0; return `${n >= 0 ? "+" : "−"}${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${asset}`; }
function signed(value: number) { return `${value >= 0 ? "+" : ""}${value.toFixed(2)}`; }
function compact(value: number) { return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(value || 0); }
function price(value: number) { return value >= 1 ? value.toLocaleString("en-US", { maximumFractionDigits: 2 }) : value.toLocaleString("en-US", { maximumFractionDigits: 6 }); }
function date(value: string) { const d = new Date(value); return Number.isNaN(d.getTime()) ? value : d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); }
function formatPair(pair?: string | null) { return pair ? pair.replace(/USDT$/, " / USDT") : "AI Trade"; }
