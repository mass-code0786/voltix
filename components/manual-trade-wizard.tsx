"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronRight, Radio, X } from "lucide-react";
import { useLiveTickers } from "@/lib/use-market-data";
import { formatLocalTime } from "@/lib/local-time";

const EXPIRED_MESSAGE = "This trading window has ended. Please wait for the next trading window.";
const WRONG_PAIR_MESSAGE = "That is not the recommended pair for this trading window. Please select the highlighted pair.";

type SignalPair = { symbol: string; displayPair: string; baseSymbol: string; logo: string };
type ManualSignal = {
  live: boolean; serverNow: string; message?: string; signalId?: string; slotId?: string; windowLabel?: string;
  windowStartAt?: string; windowCloseAt?: string; settlementDueAt?: string; recommendedPair?: string;
  recommendedDisplayPair?: string; pairs?: SignalPair[]; blockedMessage?: string | null;
};
type Placement = { success: true; tradeId: string; pair: string; windowLabel: string; stakeAmount: number; stakePercent: number; windowCloseAt: string; settlementDueAt: string; status: string };

export function ManualTradeWizard({ onClose, onPlaced }: { onClose: () => void; onPlaced: () => void | Promise<void> }) {
  const [signal, setSignal] = useState<ManualSignal | null>(null);
  const [step, setStep] = useState<1 | 2>(1);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const [placement, setPlacement] = useState<Placement | null>(null);
  const [successCountdown, setSuccessCountdown] = useState(10);
  const requestIdRef = useRef("");
  const submissionRef = useRef(false);
  const onCloseRef = useRef(onClose);
  const liveTickers = useLiveTickers();
  const tickerMap = useMemo(() => new Map(liveTickers.map(ticker => [ticker.symbol, ticker])), [liveTickers]);
  const expired = remainingSeconds === 0;

  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/manual-trade/signal", { cache: "no-store", credentials: "include", signal: controller.signal })
      .then(async response => { const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error || "Manual trade signal unavailable"); setSignal(data); })
      .catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Manual trade signal unavailable"); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!signal?.live || !signal.windowCloseAt) return;
    const offsetMs = Date.parse(signal.serverNow) - Date.now();
    const update = () => setRemainingSeconds(Math.max(0, Math.ceil((Date.parse(signal.windowCloseAt!) - (Date.now() + offsetMs)) / 1000)));
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [signal]);

  useEffect(() => {
    if (!placement) return;
    setSuccessCountdown(10);
    const timer = window.setInterval(() => setSuccessCountdown(current => {
      if (current <= 1) { window.clearInterval(timer); onCloseRef.current(); return 0; }
      return current - 1;
    }), 1000);
    return () => window.clearInterval(timer);
  }, [placement]);

  const selectPair = async (pair: SignalPair) => {
    if (submitting || submissionRef.current || placement || expired) return;
    if (pair.symbol !== signal?.recommendedPair) { setError(WRONG_PAIR_MESSAGE); return; }
    if (!signal.signalId || !signal.slotId) return;
    submissionRef.current = true; setSubmitting(true); setError("");
    if (!requestIdRef.current) requestIdRef.current = crypto.randomUUID();
    try {
      const response = await fetch("/api/manual-trade/execute", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ signalId: signal.signalId, slotId: signal.slotId, selectedPair: pair.symbol, clientRequestId: requestIdRef.current }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Manual trade failed");
      setPlacement(data as Placement); void onPlaced();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Manual trade failed";
      if (/window has (ended|closed)/i.test(message)) setRemainingSeconds(0); else setError(message);
      submissionRef.current = false;
    } finally { setSubmitting(false); }
  };

  if (placement) return <SuccessPopup placement={placement} countdown={successCountdown} onClose={onClose}/>;

  const unavailable = !loading && (!signal?.live || Boolean(signal.blockedMessage));
  return <ModalShell onClose={submitting ? () => {} : onClose}>
    <div className="border-b border-white/[.08] px-5 py-4"><p className="text-[10px] font-black uppercase tracking-[.18em] text-[#18ff8a]">Manual Trading</p><h2 className="mt-1 pr-10 text-lg font-black text-white">{step === 1 ? "TRADE SIGNAL AVAILABLE" : "SELECT THE RECOMMENDED PAIR"}</h2>{step === 2 && <p className="mt-1 text-xs text-slate-500">Choose the highlighted pair shown in the trade signal.</p>}</div>
    <div className="max-h-[72vh] overflow-y-auto p-5">
      {loading ? <Loader/> : expired ? <Expiry onClose={() => { setSignal(null); onClose(); }}/> : unavailable ? <Unavailable message={signal?.blockedMessage || signal?.message || error} onClose={onClose}/> : step === 1 ? <div>
        <div className="rounded-2xl border border-[#18ff8a]/20 bg-[#18ff8a]/[.06] p-5 text-center"><Radio className="mx-auto text-[#18ff8a]" size={30}/><p className="mt-3 text-sm leading-6 text-slate-200">For this trading window, the recommended pair is <strong className="text-[#18ff8a]">{signal?.recommendedDisplayPair}</strong>.</p></div>
        <Countdown seconds={remainingSeconds}/><button type="button" onClick={() => setStep(2)} disabled={expired} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-[#18ff8a] py-3.5 text-xs font-black text-[#041008] disabled:opacity-40">NEXT <ChevronRight size={15}/></button>
      </div> : <div><Countdown seconds={remainingSeconds}/><div className="mt-4 grid grid-cols-2 gap-2.5">{signal?.pairs?.map(pair => {
        const ticker = tickerMap.get(pair.symbol); const change = ticker?.changePercent; const recommended = pair.symbol === signal.recommendedPair;
        return <button key={pair.symbol} type="button" onClick={() => selectPair(pair)} disabled={submitting || expired} className={`relative min-w-0 rounded-2xl border p-3 text-left transition disabled:cursor-not-allowed disabled:opacity-55 ${recommended ? "border-[#18ff8a]/70 bg-[#18ff8a]/[.08] shadow-[0_0_18px_rgba(24,255,138,.13)]" : "border-white/[.08] bg-black/25 hover:border-[#18ff8a]/35"}`}>
          {recommended && <span className="absolute right-2 top-2 rounded-full border border-[#18ff8a]/35 bg-[#092b1b] px-1.5 py-0.5 text-[7px] font-black uppercase tracking-wide text-[#18ff8a]">Recommended</span>}
          <img src={pair.logo} alt={`${pair.displayPair} logo`} className="h-9 w-9 rounded-full object-contain"/><p className="mt-2 truncate text-xs font-black text-white">{pair.displayPair}</p><p className="mt-1 truncate text-[11px] font-bold text-slate-300">{ticker ? `$${formatPrice(ticker.price)}` : "Price unavailable"}</p><p className={`mt-1 text-[10px] font-black ${typeof change === "number" && change < 0 ? "text-[#ff5f78]" : "text-[#18ff8a]"}`}>{typeof change === "number" ? `${change >= 0 ? "+" : ""}${change.toFixed(2)}%` : "--"}</p>
        </button>;
      })}</div>{error && <ErrorMessage text={error}/>} {submitting && <p className="mt-3 text-center text-xs font-bold text-[#18ff8a]">Placing trade securely...</p>}</div>}
    </div>
  </ModalShell>;
}

function Countdown({ seconds }: { seconds: number | null }) { return <div className="mt-4 rounded-xl border border-white/[.08] bg-black/25 px-4 py-3 text-center text-sm font-bold text-slate-300">Time Remaining: <span className="font-black tabular-nums text-[#18ff8a]">{seconds === null ? "--:--" : `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`}</span></div>; }
function Expiry({ onClose }: { onClose: () => void }) { return <div className="py-7 text-center"><p className="text-sm leading-6 text-slate-300">{EXPIRED_MESSAGE}</p><button type="button" onClick={onClose} className="mt-5 w-full rounded-xl border border-white/[.12] py-3 text-xs font-black text-white">CLOSE</button></div>; }
function Unavailable({ message, onClose }: { message?: string; onClose: () => void }) { return <div className="py-7 text-center"><p className="text-sm leading-6 text-slate-300">{message || "No manual trading window is currently active."}</p><button type="button" onClick={onClose} className="mt-5 rounded-xl border border-white/[.1] px-5 py-3 text-xs font-black text-white">Close</button></div>; }
function Loader() { return <div className="grid min-h-48 place-items-center"><span className="h-8 w-8 animate-spin rounded-full border-2 border-[#18ff8a]/20 border-t-[#18ff8a]"/></div>; }
function SuccessPopup({ placement, countdown, onClose }: { placement: Placement; countdown: number; onClose: () => void }) { return <ModalShell onClose={onClose}><div className="p-6 text-center sm:p-8"><span className="mx-auto grid h-16 w-16 animate-[pulse_1.4s_ease-in-out_2] place-items-center rounded-full border border-[#18ff8a]/40 bg-[#18ff8a]/15 text-[#18ff8a] shadow-[0_0_35px_rgba(24,255,138,.25)]"><Check size={32} strokeWidth={3}/></span><h2 className="mt-5 text-2xl font-black text-white">Congratulations!</h2><p className="mt-2 text-sm text-slate-300">Your trade has been placed successfully.</p><div className="mt-5 space-y-2 rounded-2xl border border-[#18ff8a]/15 bg-black/25 p-4 text-left text-xs text-slate-300"><Detail label="Pair" value={placement.pair}/><Detail label="Window" value={placement.windowLabel}/><Detail label="Trade Amount" value={`${placement.stakePercent}% of AI Wallet`}/><Detail label="Amount Locked" value={`${formatAmount(placement.stakeAmount)} USDT`}/><Detail label="Status" value="Trade Placed Successfully"/><Detail label="Settlement" value={formatSettlement(placement.settlementDueAt)}/></div><p className="mt-4 text-xs font-bold text-slate-500">Closing in <span className="tabular-nums text-white">{countdown}</span> second{countdown === 1 ? "" : "s"}</p><button type="button" onClick={onClose} className="mt-5 w-full rounded-xl bg-[#18ff8a] py-3 text-xs font-black text-[#041008]">Done</button></div></ModalShell>; }
function Detail({ label, value }: { label: string; value: string }) { return <div className="flex items-start justify-between gap-4"><span className="text-slate-500">{label}</span><strong className="text-right text-white">{value}</strong></div>; }
function ModalShell({ children, onClose }: { children: React.ReactNode; onClose: () => void }) { return <div className="fixed inset-0 z-[90] grid place-items-end bg-black/75 px-3 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur-sm sm:place-items-center sm:p-4" role="dialog" aria-modal="true"><button type="button" aria-label="Close manual trade" onClick={onClose} className="absolute inset-0"/><section className="relative w-full max-w-lg overflow-hidden rounded-[26px] border border-[#18ff8a]/20 bg-[#0c1713] shadow-[0_24px_80px_rgba(0,0,0,.6)]"><button type="button" onClick={onClose} aria-label="Close" className="absolute right-4 top-4 z-10 grid h-8 w-8 place-items-center rounded-full border border-white/[.08] bg-black/30 text-slate-400"><X size={15}/></button>{children}</section></div>; }
function ErrorMessage({ text }: { text: string }) { return <p className="mt-4 rounded-xl border border-[#ff4f6d]/25 bg-[#ff4f6d]/10 px-3 py-2.5 text-xs font-bold leading-5 text-[#ff8b9e]">{text}</p>; }
function formatPrice(value: number) { return value < 1 ? value.toFixed(6) : value.toLocaleString("en-US", { maximumFractionDigits: 2 }); }
function formatAmount(value: number) { return value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 8 }); }
function formatSettlement(value: string) { return `at ${formatLocalTime(value)}`; }
