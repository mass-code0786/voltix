"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ComponentType } from "react";
import {
  ArrowDownToLine, ArrowLeftRight, ArrowUpFromLine, Bell, Bot, BrainCircuit, ChevronRight, Clock3,
  Eye, EyeOff, FileClock, Gift, Headphones, History, Home, Info, LineChart, MoreHorizontal,
  QrCode, Search, ShieldCheck, Star, Wallet, Zap,
} from "lucide-react";
import { useLiveTickers } from "@/lib/use-market-data";
import styles from "./clean-exchange.module.css";

export type CleanSection = "home" | "markets" | "ai-trade" | "futures" | "wallet";
type Asset = { walletType: "SPOT" | "FUTURES" | "AI"; symbol: string; name: string; balance: number; usdValue?: number | null };
type Totals = { available?: Partial<Record<"spot" | "futures" | "aiWallet", number>>; total?: Partial<Record<"spot" | "futures" | "aiWallet", number>>; portfolio?: number };
type WalletSummary = { totalBalanceUsd?: number; todayIncome?: number; shineUsdValue?: number; shineBalance?: number };
type Dashboard = { summary?: { totalPortfolio?: number; todaysProfit?: number; aiCopyTradingIncome?: number }; user?: { vipRank?: string | null }; wallet?: { balances?: { funding?: number } } };
type Coin = { symbol: string; name: string; pair?: string; localLogoPath?: string | null; logoUrl?: string | null; isActive?: boolean };
type Trade = { id?: string; pair?: string | null; rowLabel?: string; amount?: number; profit?: number; calculatedProfit?: number; returnPercent?: number; remainingTime?: number; status?: string; date?: string; startedAt?: string; completesAt?: string; creditDueAt?: string };
type TradeRow = { kind?: string; label?: string; openTime?: string; closeTime?: string; tradeStatus?: string; promotionDay?: number; totalPromotionDays?: number; extraTradesUsed?: number; extraTradesRemaining?: number };
type CopyStatus = { activeTrade?: Trade | null; history?: Trade[]; todaysTradeCount?: number; todaysCompletedTrades?: number; dailyTradeLimit?: number; tradeRows?: TradeRow[] };
type HistoryRow = { id: string; title: string; asset: string; signedAmount: number; createdAt: string; status: string };
type Snapshot = { assets: Asset[]; totals: Totals; walletSummary: WalletSummary | null; dashboard: Dashboard | null; coins: Coin[]; copy: CopyStatus; history: HistoryRow[]; aiToday: number; unreadCount: number; subscription: { subscription?: { active?: boolean; remainingDays?: number } | null } | null };

const empty: Snapshot = { assets: [], totals: {}, walletSummary: null, dashboard: null, coins: [], copy: {}, history: [], aiToday: 0, unreadCount: 0, subscription: null };
const previewRoutes: Record<CleanSection, string> = { home: "/clean-preview", markets: "/clean-preview/markets", "ai-trade": "/clean-preview/ai-trade", futures: "/clean-preview/futures", wallet: "/clean-preview/wallet" };
const productionRoutes: Record<CleanSection, string> = { home: "/dashboard", markets: "/dashboard?view=markets", "ai-trade": "/dashboard?view=aiTrade", futures: "/dashboard?view=trade&trade=futures", wallet: "/dashboard?view=wallet" };

export default function CleanExchangeApp({ section, routeMode = "preview" }: { section: CleanSection; routeMode?: "preview" | "production" }) {
  const [data, setData] = useState<Snapshot>(empty);
  const [loading, setLoading] = useState(true);
  const [balancesVisible, setBalancesVisible] = useState(true);
  const tickers = useLiveTickers();

  useEffect(() => {
    const controller = new AbortController();
    const json = (url: string) => fetch(url, { credentials: "include", cache: "no-store", signal: controller.signal }).then(r => r.ok ? r.json() : null).catch(() => null);
    Promise.all([json("/api/assets"), json("/api/dashboard"), json("/api/coins"), json("/api/copy-trade/status"), json("/api/wallet/history"), json("/api/ai-trading/overview?range=today"), json("/api/ai/subscription"), json("/api/notifications")]).then(([assets, dashboard, coins, copy, history, ai, subscription, notifications]) => {
      if (controller.signal.aborted) return;
      setData({ assets: assets?.assets ?? [], totals: assets?.totals ?? {}, walletSummary: assets?.walletSummary ?? null, dashboard: dashboard?.dashboard ?? null, coins: (coins?.coins ?? []).filter((c: Coin) => c.isActive !== false), copy: copy?.status ?? {}, history: history?.history ?? [], aiToday: Number(ai?.totalIncome ?? 0), unreadCount: Number(notifications?.unreadCount ?? 0), subscription });
      setLoading(false);
    });
    return () => controller.abort();
  }, []);

  const markets = useMemo(() => data.coins.map(coin => {
    const pair = coin.pair || `${coin.symbol}USDT`;
    const ticker = tickers.find(item => item.symbol === pair);
    return { ...coin, pair, price: Number(ticker?.price ?? 0), change: Number(ticker?.changePercent ?? 0), volume: Number(ticker?.quoteVolume ?? 0) };
  }).filter(row => row.price > 0), [data.coins, tickers]);

  const routes = routeMode === "production" ? productionRoutes : previewRoutes;
  return <main className={styles.app}>
    <div className={`${styles.phone} ${section === "home" ? styles.homeShell : ""}`}>
      <CleanHeader routes={routes} section={section} unreadCount={data.unreadCount} />
      <div className={`${styles.content} ${styles[`${section.replace("-", "")}Page`] ?? ""}`} aria-busy={loading}>
        {section === "home" && <HomePage data={data} markets={markets} loading={loading} routes={routes} visible={balancesVisible} onToggle={() => setBalancesVisible(value => !value)} />}
        {section === "markets" && <MarketsPage markets={markets} loading={loading} />}
        {section === "ai-trade" && <AiPage data={data} markets={markets} loading={loading} visible={balancesVisible} onToggle={() => setBalancesVisible(value => !value)} />}
        {section === "futures" && <FuturesPage data={data} markets={markets} loading={loading} marketsHref={routes.markets} />}
        {section === "wallet" && <WalletPage data={data} markets={markets} loading={loading} visible={balancesVisible} onToggle={() => setBalancesVisible(value => !value)} />}
      </div>
      <CleanBottomNavigation active={section} routes={routes} />
    </div>
  </main>;
}

function CleanHeader({ routes, section, unreadCount }: { routes: Record<CleanSection, string>; section: CleanSection; unreadCount: number }) {
  const recordsHref = section === "ai-trade" ? "/dashboard?view=aiTrade&tab=history" : "/dashboard?view=wallet&wallet=ledger";
  return <header className={styles.header}>
    <Link href={routes.home} className={styles.brand} aria-label="Voltix home"><span>V</span><b>VOLTIX</b></Link>
    <div className={styles.headerActions}>
      {section === "home" ? <><Link href={routes.markets} aria-label="Search"><Search /></Link><Link href="/wallet/deposit" aria-label="Scan"><QrCode /></Link><Link href="/profile/support" aria-label="Support"><Headphones /></Link></> : <><Link href={recordsHref} aria-label="Records"><FileClock /></Link><Link href={recordsHref} aria-label="Recent activity"><History /></Link></>}
      <Link href="/profile/notifications" aria-label="Notifications" className={styles.notificationLink}><Bell />{unreadCount > 0 && <span aria-label={`${unreadCount} unread notifications`}>{unreadCount > 9 ? "9+" : unreadCount}</span>}</Link>
    </div>
  </header>;
}

function HomePage({ data, markets, loading, routes, visible, onToggle }: { data: Snapshot; markets: Market[]; loading: boolean; routes: Record<CleanSection, string>; visible: boolean; onToggle: () => void }) {
  const total = totalBalance(data), today = todayIncome(data);
  const btc = btcEquivalent(total, markets), change = changePercent(total, today);
  return <>
    <section className={styles.balanceHero}>
      <div className={styles.balanceLabel}><p className={styles.eyebrow}>Total Balance</p><button onClick={onToggle} aria-label={visible ? "Hide balance" : "Show balance"}>{visible ? <Eye /> : <EyeOff />}</button></div>
      <BalanceMoney value={total} loading={loading} visible={visible} />
      <p className={styles.btcEquivalent}>{visible ? `≈ ${btc.toFixed(8)} BTC` : "≈ •••••••• BTC"} <Info /></p>
      <div className={styles.changeRow}><span>24h Change</span><b className={today >= 0 ? styles.positive : styles.negative}>{visible ? `${signedMoney(today)} (${signed(change)}%)` : "••••••"}</b></div>
    </section>
    <QuickActions compact />
    <Link href={routes["ai-trade"]} className={styles.promo}><div><span className={styles.aiIndicator}><Bot /> AI</span><h2>AI Copy Trading</h2><p>Smart trades. Better profits.</p><b>Start Trading <ChevronRight /></b></div><div className={styles.promoVisual} aria-hidden="true"><Bot className={styles.promoBot} /></div></Link>
    <SectionTitle title="Market Overview" href={routes.markets} />
    <div className={styles.marketCards}>{loading ? <SkeletonCards count={3} /> : markets.slice(0, 3).map(row => <MarketCard key={row.symbol} row={row} />)}{!loading && !markets.length && <Empty label="Live markets unavailable" />}</div>
    <SectionTitle title="My Wallets" href={routes.wallet} />
    <div className={styles.walletStrip}>{walletRows(data).map(row => <div className={styles.walletMini} key={row.key}><row.icon /><span>{row.label}</span><small>Funds</small>{loading ? <i className={`${styles.skeleton} ${styles.inlineSkeleton}`} /> : <b>{visible ? money(row.value) : "••••"}</b>}</div>)}</div>
    <Link href="/profile/vip-benefits" className={styles.vip}><span>V</span><div><small>Current VIP rank</small><b>{data.dashboard?.user?.vipRank ?? "Not available"}</b><small>Unlock exclusive benefits and higher rewards</small></div><strong>View Benefits</strong><ChevronRight /></Link>
  </>;
}

type Market = Coin & { pair: string; price: number; change: number; volume: number };
function MarketsPage({ markets, loading }: { markets: Market[]; loading: boolean }) {
  const [filter, setFilter] = useState("All");
  const shown = filter === "Top Gainers" ? [...markets].sort((a, b) => b.change - a.change) : filter === "Top Losers" ? [...markets].sort((a, b) => a.change - b.change) : markets;
  return <>
    <PageTitle title="Markets" subtitle="Live Voltix cryptocurrency markets" />
    <div className={styles.marketSummary}><div><small>Live pairs</small>{loading ? <i className={`${styles.skeleton} ${styles.inlineSkeleton}`} /> : <b>{markets.length}</b>}</div><div><small>24h gainers</small>{loading ? <i className={`${styles.skeleton} ${styles.inlineSkeleton}`} /> : <b className={styles.positive}>{markets.filter(m => m.change > 0).length}</b>}</div><LineChart /></div>
    <div className={styles.pills}>{["All", "Top Gainers", "Top Losers"].map(item => <button key={item} className={filter === item ? styles.activePill : ""} onClick={() => setFilter(item)}>{item}</button>)}</div>
    <div className={styles.tableHead}><span>Pair / Volume</span><span>Last Price</span><span>24h Change</span></div>
    <div className={styles.marketList}>{loading ? <SkeletonRows count={9} /> : shown.slice(0, 9).map(row => <MarketRow key={row.symbol} row={row} />)}{!loading && !shown.length && <Empty label="No live market data" />}</div>
    {!loading && <TickerRail rows={shown.slice(0, 3)} />}
  </>;
}

function AiPageLegacy({ data, loading }: { data: Snapshot; loading: boolean }) {
  const ai = walletValue(data, "aiWallet"), active = data.copy.activeTrade, history = data.copy.history ?? [];
  return <>
    <PageTitle title="AI Trade" subtitle="Your real Voltix AI trading activity" />
    <section className={`${styles.summaryCard} ${styles.aiSummary}`}><div><small>Total AI Balance</small><Money value={ai} loading={loading} large /></div><div><small>Today&apos;s Profit</small>{loading ? <i className={`${styles.skeleton} ${styles.inlineSkeleton}`} /> : <><b className={styles.positive}>{signedMoney(data.aiToday)}</b><small>{data.subscription?.subscription?.active ? `${data.subscription.subscription.remainingDays ?? 0} subscription days left` : "No active subscription"}</small></>}</div><Bot /></section>
    <div className={styles.aiActions}><Stat icon={Bot} label="AI Trading" value="Trade center" /><Stat icon={Clock3} label="Active Trades" value={active ? "1 running" : "None running"} /><Stat icon={History} label="Trade History" value={`${history.length} records`} /><Stat icon={FileClock} label="Subscription" value={data.subscription?.subscription?.active ? "Active" : "Inactive"} /></div>
    <SectionTitle title="Active AI Trade" />
    {loading ? <SkeletonPanel /> : active ? <article className={styles.tradeCard}><div className={styles.tradeTop}><CoinLogo symbol={(active.pair ?? "AI").replace("USDT", "")} /><div><b>{formatPair(active.pair)}</b><small>{active.status ?? "Active"}</small></div><span className={styles.status}>Running</span></div><div className={styles.statGrid}><Metric label="Amount" value={money(Number(active.amount ?? 0))} /><Metric label="Profit" value={signedMoney(Number(active.profit ?? 0))} /><Metric label="Return" value={`${Number(active.returnPercent ?? 0).toFixed(2)}%`} /></div>{active.creditDueAt && <p className={styles.tradeNote}>Credit due {date(active.creditDueAt)}</p>}</article> : <Empty label="No active AI trade" />}
    <SectionTitle title="Trade windows" />
    <div className={styles.windowList}>{(data.copy.tradeRows ?? []).slice(0, 3).map((row, index) => <div key={`${row.label}-${index}`}><span>{row.label ?? `Trade ${index + 1}`}</span><b>{row.openTime && row.closeTime ? `${row.openTime} – ${row.closeTime}` : row.tradeStatus ?? "Scheduled"}</b></div>)}{!(data.copy.tradeRows ?? []).length && <Empty label="No trade windows available" />}</div>
    <Link className={styles.primaryButton} href="/dashboard?view=aiTrade">Open AI trading</Link>
  </>;
}

function AiPage({ data, markets, loading, visible, onToggle }: { data: Snapshot; markets: Market[]; loading: boolean; visible: boolean; onToggle: () => void }) {
  const ai = walletValue(data, "aiWallet"), active = data.copy.activeTrade, history = data.copy.history ?? [];
  const roi = ai > 0 ? data.aiToday / ai * 100 : 0, promo = (data.copy.tradeRows ?? []).find(row => row.kind === "PROMOTION");
  return <>
    <div className={styles.aiHero}><div><span className={styles.aiIndicator}><Bot /> AI</span><h1>AI Trade</h1><p>Smart AI. Smarter Profits.</p></div><Bot /></div>
    <section className={`${styles.summaryCard} ${styles.aiSummary}`}><div className={styles.aiBalanceMain}><div className={styles.balanceLabel}><small>Total AI Balance</small><button onClick={onToggle} aria-label={visible ? "Hide balance" : "Show balance"}>{visible ? <Eye /> : <EyeOff />}</button></div><BalanceMoney value={ai} loading={loading} visible={visible} /><small className={styles.btcEquivalent}>{visible ? `≈ ${btcEquivalent(ai, markets).toFixed(8)} BTC` : "≈ •••••••• BTC"} <Info /></small></div><div className={styles.aiProfitStats}><Metric label="Today’s Profit" value={visible ? signedMoney(data.aiToday) : "••••"} /><Metric label="Today’s ROI" value={visible ? `${signed(roi)}%` : "••••"} /></div><ChevronRight /></section>
    <div className={styles.aiActions}><Stat icon={Bot} label="AI Trading" value="Start New Trade" /><Stat icon={Clock3} label="Active Trades" value={`${active ? 1 : 0} Running`} /><Stat icon={History} label="Trade History" value={`${data.copy.todaysCompletedTrades ?? history.length} Completed`} /><Stat icon={BrainCircuit} label="AI Strategies" value="Smart Models" /></div>
    <SectionTitle title="Active AI Trade" />
    {loading ? <SkeletonPanel /> : <article className={`${styles.tradeCard} ${!active ? styles.emptyTradeCard : ""}`}><div className={styles.tradeTop}><CoinLogo symbol={(active?.pair ?? "AI").replace("USDT", "")} /><div><b>{formatPair(active?.pair)}</b><small>Long or Short direction: {active ? "Not provided" : "—"}</small></div><span className={active ? styles.status : styles.neutralStatus}>{active ? "Running" : "No active trade"}</span></div><div className={styles.tradeDetails}><Metric label="Amount" value={active ? money(Number(active.amount ?? 0)) : "—"} /><Metric label="Start Time" value={active?.startedAt ? date(active.startedAt) : "—"} /><Metric label="Estimated Completion" value={active?.completesAt ? date(active.completesAt) : "—"} /><Metric label="Remaining countdown" value={active ? countdown(active.remainingTime) : "—"} /><Metric label="Estimated Profit" value={active ? signedMoney(Number(active.calculatedProfit ?? active.profit ?? 0)) : "—"} /><Metric label="Estimated ROI" value={active ? `${Number(active.returnPercent ?? 0).toFixed(2)}%` : "—"} /><Metric label="AI Model" value={active ? "Voltix AI" : "—"} /></div><Link aria-disabled={!active} href={active ? "/dashboard?view=aiTrade" : "#"}>View Details <ChevronRight /></Link></article>}
    <div className={styles.planHeading}><SectionTitle title="AI Trade Plan (Daily)" /><Link href="/dashboard?view=aiTrade">Rules</Link></div>
    <div className={styles.tradePlan}><PlanRow icon={Bot} label="Regular Trade" value={`${data.copy.todaysTradeCount ?? 0}/${data.copy.dailyTradeLimit ?? 1}`} note="One trade per day" /><PlanRow icon={Gift} label="Extra Trade" value={`${promo?.extraTradesUsed ?? 0}/${(promo?.extraTradesUsed ?? 0) + (promo?.extraTradesRemaining ?? 0)}`} note="For first deposit users" /><PlanRow icon={Clock3} label="Remaining bonus days" value={promo ? String(Math.max(0, Number(promo.totalPromotionDays ?? 0) - Number(promo.promotionDay ?? 0))) : "0"} note="Extra-trade eligibility" /><PlanRow icon={FileClock} label="Profit Credit Time" value={active?.creditDueAt ? date(active.creditDueAt) : "Scheduled"} note="After trade completion" /></div>
    <div className={styles.aiInfo}><ShieldCheck /><span><b>AI analysis</b> Voltix evaluates the supported market and your eligible trade window before a trade starts.</span></div>
    <section className={styles.aiCta}><div><h2>How AI Trade Works?</h2><Link href="/dashboard?view=aiTrade">Learn More</Link><p>Start New AI Trade</p><small>Use an eligible window and available AI balance.</small></div><Link href="/dashboard?view=aiTrade" aria-label="Start New AI Trade"><ChevronRight /></Link></section>
  </>;
}

function FuturesPage({ data, markets, loading, marketsHref }: { data: Snapshot; markets: Market[]; loading: boolean; marketsHref: string }) {
  const [symbol, setSymbol] = useState("All");
  const filtered = symbol === "All" ? markets : markets.filter(row => row.symbol === symbol);
  return <>
    <PageTitle title="Futures" subtitle="Your implemented Voltix futures wallet and live markets" />
    <section className={styles.summaryCard}><div><small>Total Futures Balance</small><Money value={walletValue(data, "futures")} loading={loading} large /></div><Zap /></section>
    <div className={styles.twoActions}><Link href="/dashboard?view=wallet"><ArrowLeftRight />Transfer</Link><Link href="/dashboard?view=wallet&wallet=ledger"><History />History</Link></div>
    <SectionTitle title="Live markets" href={marketsHref} />
    <div className={styles.futuresFilters}>{["All", "BTC", "ETH", "SOL", "BNB"].filter(item => item === "All" || markets.some(row => row.symbol === item)).map(item => <button key={item} className={symbol === item ? styles.activeFutureFilter : ""} onClick={() => setSymbol(item)}>{item}</button>)}</div>
    <div className={styles.tableHead}><span>Pair / Volume</span><span>Last Price</span><span>24h Change</span></div>
    <div className={styles.marketList}>{loading ? <SkeletonRows count={7} /> : filtered.slice(0, 7).map(row => <MarketRow key={row.symbol} row={row} />)}{!loading && !filtered.length && <Empty label="No live market data" />}</div>
  </>;
}

function WalletPage({ data, markets, loading, visible, onToggle }: { data: Snapshot; markets: Market[]; loading: boolean; visible: boolean; onToggle: () => void }) {
  const rows = walletRows(data);
  const total = totalBalance(data), today = todayIncome(data);
  return <>
    <div className={styles.walletTitle}><PageTitle title="My Wallet" subtitle="Manage your assets easily" /><button onClick={onToggle}>{visible ? <EyeOff /> : <Eye />}{visible ? "Hide Balance" : "Show Balance"}</button></div>
    <section className={`${styles.balanceHero} ${styles.walletHero}`}><div className={styles.balanceLabel}><p className={styles.eyebrow}>Total Wallet Balance</p><button onClick={onToggle} aria-label={visible ? "Hide balance" : "Show balance"}>{visible ? <Eye /> : <EyeOff />}</button></div><BalanceMoney value={total} loading={loading} visible={visible} /><p className={styles.btcEquivalent}>{visible ? `≈ ${btcEquivalent(total, markets).toFixed(8)} BTC` : "≈ •••••••• BTC"} <Info /></p><div className={styles.changeRow}><span>24h Change</span><b className={today >= 0 ? styles.positive : styles.negative}>{visible ? `${signedMoney(today)} (${signed(changePercent(total, today))}%)` : "••••••"}</b></div><Wallet /></section>
    <WalletActions />
    <SectionTitle title="Wallets" />
    <div className={styles.walletList}>{loading ? <SkeletonWallets /> : rows.map(row => <Link key={row.key} href="/dashboard?view=wallet"><span className={styles.walletIcon}><row.icon /></span><div><b>{row.label} Wallet</b><small>Available balance</small></div><strong>{visible ? money(row.value) : "••••"}</strong><ChevronRight /></Link>)}</div>
    <SectionTitle title="Recent Transactions" href="/dashboard?view=wallet&wallet=ledger" />
    <div className={styles.transactions}>{loading ? <SkeletonTransactions /> : data.history.slice(0, 4).map(item => <div key={item.id}><span className={styles.txIcon}><ArrowDownToLine /></span><div><b>{item.title}</b><small>{item.asset} · {date(item.createdAt)}</small></div><strong className={item.signedAmount >= 0 ? styles.positive : styles.negative}>{signedMoney(item.signedAmount, item.asset)}</strong></div>)}{!loading && !data.history.length && <Empty label="No transactions yet" />}</div>
  </>;
}

function QuickActions({ compact = false }: { compact?: boolean }) {
  const actions: Array<[string, string, ComponentType<{ size?: number }>, string]> = [["Deposit", "/wallet/deposit", ArrowDownToLine, "deposit"], ["Withdraw", "/wallet/withdraw", ArrowUpFromLine, "withdraw"], ["Transfer", "/dashboard?view=wallet", ArrowLeftRight, "transfer"], [compact ? "More" : "History", "/dashboard?view=wallet&wallet=ledger", compact ? MoreHorizontal : History, "history"]];
  return <nav className={styles.quickActions}>{actions.map(([label, href, Icon]) => <Link href={href} key={label}><Icon /><span>{label}</span></Link>)}</nav>;
}

function WalletActions() {
  const actions: Array<[string, string, ComponentType<{ size?: number }>]> = [["Deposit", "/wallet/deposit", ArrowDownToLine], ["Withdraw", "/wallet/withdraw", ArrowUpFromLine], ["Transfer", "/dashboard?view=wallet", ArrowLeftRight], ["Convert", "/dashboard?view=wallet&wallet=assets", Zap], ["History", "/dashboard?view=wallet&wallet=ledger", History]];
  return <nav className={`${styles.quickActions} ${styles.walletActions}`}>{actions.map(([label, href, Icon]) => <Link href={href} key={label}><Icon /><span>{label}</span></Link>)}</nav>;
}

function CleanBottomNavigation({ active, routes }: { active: CleanSection; routes: Record<CleanSection, string> }) {
  const items: Array<[CleanSection, string, ComponentType<{ size?: number }>]> = [["home", "Home", Home], ["markets", "Markets", LineChart], ["ai-trade", "AI Trade", Bot], ["futures", "Futures", FileClock], ["wallet", "Wallet", Wallet]];
  return <nav className={styles.bottomNav}>{items.map(([id, label, Icon]) => <Link key={id} href={routes[id]} aria-current={active === id ? "page" : undefined}><Icon /><span>{label}</span></Link>)}</nav>;
}

function PageTitle({ title, subtitle }: { title: string; subtitle: string }) { return <div className={styles.pageTitle}><h1>{title}</h1><p>{subtitle}</p></div>; }
function SectionTitle({ title, href }: { title: string; href?: string }) { return <div className={styles.sectionTitle}><h2>{title}</h2>{href && <Link href={href}>View all <ChevronRight /></Link>}</div>; }
function Empty({ label }: { label: string }) { return <div className={styles.empty}><span><LineChart /></span><b>{label}</b><small>Available data will appear here.</small></div>; }
function Money({ value, loading, large }: { value: number; loading?: boolean; large?: boolean }) { return <strong className={`${large ? styles.moneyLarge : ""} ${loading ? styles.loadingMoney : ""}`}>{loading ? <span className={styles.skeleton} /> : money(value)}</strong>; }
function BalanceMoney({ value, loading, visible }: { value: number; loading: boolean; visible: boolean }) { return <strong className={`${styles.moneyLarge} ${loading ? styles.loadingMoney : ""}`}>{loading ? <span className={styles.skeleton} /> : visible ? money(value) : "$••••••"}</strong>; }
function Stat({ icon: Icon, label, value }: { icon: ComponentType<{ size?: number }>; label: string; value: string }) { return <div><Icon /><b>{label}</b><small>{value}</small></div>; }
function Metric({ label, value }: { label: string; value: string }) { return <div><small>{label}</small><b>{value}</b></div>; }
function PlanRow({ icon: Icon, label, value, note }: { icon: ComponentType<{ size?: number }>; label: string; value: string; note: string }) { return <div><span><Icon /></span><div><b>{label}</b><small>{note}</small></div><strong>{value}</strong></div>; }
function CoinLogo({ symbol, path }: { symbol: string; path?: string | null }) { return path ? <img className={styles.coinLogo} src={path} alt="" /> : <span className={styles.coinFallback}>{symbol.slice(0, 2)}</span>; }
function MarketRow({ row }: { row: Market }) { return <Link href={`/markets/${row.pair}`} className={styles.marketRow}><Star className={styles.star} /><CoinLogo symbol={row.symbol} path={row.localLogoPath} /><div><b>{row.symbol}<small>/ USDT</small></b><small>Vol {compact(row.volume)}</small></div><div><b>{price(row.price)}</b><small>≈ {money(row.price)}</small></div><strong className={row.change >= 0 ? styles.positive : styles.negative}>{signed(row.change)}%</strong></Link>; }
function MarketCard({ row }: { row: Market }) { return <Link href={`/markets/${row.pair}`} className={styles.marketCard}><div><CoinLogo symbol={row.symbol} path={row.localLogoPath} /><b>{row.symbol}</b></div><strong>{price(row.price)}</strong><span className={row.change >= 0 ? styles.positive : styles.negative}>{signed(row.change)}%</span></Link>; }
function TickerRail({ rows }: { rows: Market[] }) { return rows.length ? <div className={styles.tickerRail}>{rows.map(row => <MarketCard key={row.symbol} row={row} />)}</div> : null; }
function SkeletonRows({ count }: { count: number }) { return <>{Array.from({ length: count }, (_, index) => <div className={styles.skeletonRow} key={index}><span className={styles.skeleton} /><div><span className={styles.skeleton} /><span className={styles.skeleton} /></div><span className={styles.skeleton} /><span className={styles.skeleton} /></div>)}</>; }
function SkeletonCards({ count }: { count: number }) { return <>{Array.from({ length: count }, (_, index) => <div className={styles.skeletonCard} key={index}><span className={styles.skeleton} /><span className={styles.skeleton} /><span className={styles.skeleton} /></div>)}</>; }
function SkeletonPanel() { return <div className={styles.skeletonPanel}><span className={styles.skeleton} /><span className={styles.skeleton} /><span className={styles.skeleton} /></div>; }
function SkeletonWallets() { return <>{Array.from({ length: 3 }, (_, index) => <div className={styles.skeletonWallet} key={index}><span className={styles.skeleton} /><div><span className={styles.skeleton} /><span className={styles.skeleton} /></div><span className={styles.skeleton} /></div>)}</>; }
function SkeletonTransactions() { return <>{Array.from({ length: 2 }, (_, index) => <div className={styles.skeletonTransaction} key={index}><span className={styles.skeleton} /><div><span className={styles.skeleton} /><span className={styles.skeleton} /></div><span className={styles.skeleton} /></div>)}</>; }

function walletValue(data: Snapshot, key: "spot" | "futures" | "aiWallet") { return Number(data.totals.total?.[key] ?? data.totals.available?.[key] ?? 0); }
function walletRows(data: Snapshot) { return [{ key: "spot", label: "Spot", value: walletValue(data, "spot"), icon: Wallet }, { key: "futures", label: "Futures", value: walletValue(data, "futures"), icon: LineChart }, { key: "ai", label: "AI / Copy Trade", value: walletValue(data, "aiWallet"), icon: Bot }, { key: "reward", label: "Earn / Reward", value: Number(data.walletSummary?.shineUsdValue ?? 0), icon: Gift }, { key: "funds", label: "Funds", value: Number(data.dashboard?.wallet?.balances?.funding ?? 0), icon: ShieldCheck }]; }
function totalBalance(data: Snapshot) { return Number(data.walletSummary?.totalBalanceUsd ?? data.totals.portfolio ?? data.dashboard?.summary?.totalPortfolio ?? 0); }
function todayIncome(data: Snapshot) { return Number(data.walletSummary?.todayIncome ?? data.dashboard?.summary?.todaysProfit ?? 0); }
function btcEquivalent(value: number, markets: Market[]) { const btc = markets.find(row => row.symbol === "BTC")?.price ?? 0; return btc > 0 ? value / btc : 0; }
function changePercent(total: number, change: number) { const previous = total - change; return previous !== 0 ? change / Math.abs(previous) * 100 : 0; }
function countdown(seconds?: number) { const value = Math.max(0, Number(seconds ?? 0)); const h = Math.floor(value / 3600), m = Math.floor(value % 3600 / 60), s = Math.floor(value % 60); return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`; }
function money(value: number) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number.isFinite(value) ? value : 0); }
function signedMoney(value: number, asset = "USDT") { const n = Number.isFinite(value) ? value : 0; return `${n >= 0 ? "+" : "−"}${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${asset}`; }
function signed(value: number) { return `${value >= 0 ? "+" : ""}${value.toFixed(2)}`; }
function compact(value: number) { return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(value || 0); }
function price(value: number) { return value >= 1 ? value.toLocaleString("en-US", { maximumFractionDigits: 2 }) : value.toLocaleString("en-US", { maximumFractionDigits: 6 }); }
function date(value: string) { const d = new Date(value); return Number.isNaN(d.getTime()) ? value : d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); }
function formatPair(pair?: string | null) { return pair ? pair.replace(/USDT$/, " / USDT") : "AI Trade"; }
