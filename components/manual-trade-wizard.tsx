"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronRight, X } from "lucide-react";
import { useLiveTickers } from "@/lib/use-market-data";

type SignalPair = { symbol: string; displayPair: string; baseSymbol: string; logo: string };
type ManualSignal = {
  live: boolean;
  serverNow: string;
  message?: string;
  slotId?: string;
  windowStartAt?: string;
  windowCloseAt?: string;
  recommendedPair?: string;
  recommendedDisplayPair?: string;
  pairs?: SignalPair[];
  blockedMessage?: string | null;
};

export function ManualTradeWizard({ onClose, onPlaced }: { onClose: () => void; onPlaced: () => void | Promise<void> }) {
  const [signal, setSignal] = useState<ManualSignal | null>(null);
  const [step, setStep] = useState<1 | 2>(1);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [windowClosed, setWindowClosed] = useState(false);
  const [successPair, setSuccessPair] = useState("");
  const [countdown, setCountdown] = useState(10);
  const requestIdRef = useRef("");
  const submissionRef = useRef(false);
  const onCloseRef = useRef(onClose);
  const liveTickers = useLiveTickers();
  const tickerMap = useMemo(() => new Map(liveTickers.map(ticker => [ticker.symbol, ticker])), [liveTickers]);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/manual-trade/signal", { cache: "no-store", credentials: "include", signal: controller.signal })
      .then(async response => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "Manual trade signal unavailable");
        setSignal(data as ManualSignal);
      })
      .catch(cause => {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Manual trade signal unavailable");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!signal?.live || !signal.windowCloseAt) return;
    const serverOffset = Date.parse(signal.serverNow) - Date.now();
    const checkClosed = () => setWindowClosed(Date.now() + serverOffset >= Date.parse(signal.windowCloseAt!));
    checkClosed();
    const timer = window.setInterval(checkClosed, 1000);
    return () => window.clearInterval(timer);
  }, [signal]);

  useEffect(() => {
    if (!successPair) return;
    setCountdown(10);
    const timer = window.setInterval(() => {
      setCountdown(current => {
        if (current <= 1) {
          window.clearInterval(timer);
          onCloseRef.current();
          return 0;
        }
        return current - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [successPair]);

  const selectPair = async (pair: SignalPair) => {
    if (submitting || submissionRef.current || successPair) return;
    if (windowClosed) {
      setError("This trading window has closed. Please wait for the next trading window.");
      return;
    }
    if (pair.symbol !== signal?.recommendedPair) {
      setError("That is not the recommended pair for this trading window. Please select the assigned pair.");
      return;
    }
    if (!signal.slotId) return;
    submissionRef.current = true;
    setSubmitting(true);
    setError("");
    if (!requestIdRef.current) requestIdRef.current = crypto.randomUUID();
    try {
      const response = await fetch("/api/manual-trade/execute", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slotId: signal.slotId, selectedPair: pair.symbol, clientRequestId: requestIdRef.current }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Manual trade failed");
      setSuccessPair(pair.displayPair);
      void onPlaced();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Manual trade failed");
      submissionRef.current = false;
    } finally {
      setSubmitting(false);
    }
  };

  if (successPair) {
    return <ModalShell onClose={onClose}><div className="p-6 text-center sm:p-8"><span className="mx-auto grid h-16 w-16 place-items-center rounded-full border border-[#18ff8a]/40 bg-[#18ff8a]/15 text-[#18ff8a] shadow-[0_0_35px_rgba(24,255,138,.25)]"><Check size={32} strokeWidth={3}/></span><h2 className="mt-5 text-2xl font-black text-white">Congratulations!</h2><p className="mt-2 text-sm leading-6 text-slate-300">Your trade has been placed successfully on <strong className="text-[#18ff8a]">{successPair}</strong>.</p><p className="mt-4 text-xs font-bold text-slate-500">Closing in {countdown} second{countdown === 1 ? "" : "s"}</p><button type="button" onClick={onClose} className="mt-5 w-full rounded-xl bg-[#18ff8a] py-3 text-xs font-black text-[#041008]">Done</button></div></ModalShell>;
  }

  const unavailable = !loading && (!signal?.live || Boolean(signal.blockedMessage));
  return <ModalShell onClose={submitting ? () => {} : onClose}>
    <div className="border-b border-white/[.08] px-5 py-4"><p className="text-[10px] font-black uppercase tracking-[.18em] text-[#18ff8a]">Manual Trading</p><h2 className="mt-1 text-lg font-black text-white">{step === 1 ? "TRADE SIGNAL AVAILABLE" : "SELECT THE RECOMMENDED PAIR"}</h2>{step === 2 && <p className="mt-1 text-xs text-slate-500">Choose the pair shown in the trade signal.</p>}</div>
    <div className="max-h-[70vh] overflow-y-auto p-5">
      {loading ? <div className="grid min-h-48 place-items-center"><span className="h-8 w-8 animate-spin rounded-full border-2 border-[#18ff8a]/20 border-t-[#18ff8a]"/></div> : unavailable ? <div className="py-7 text-center"><p className="text-sm leading-6 text-slate-300">{signal?.blockedMessage || signal?.message || error || "No manual trading window is currently active."}</p><button type="button" onClick={onClose} className="mt-5 rounded-xl border border-white/[.1] px-5 py-3 text-xs font-black text-white">Close</button></div> : step === 1 ? <div><p className="rounded-2xl border border-[#18ff8a]/18 bg-[#18ff8a]/[.06] p-4 text-sm leading-6 text-slate-200">For this trading window, the recommended pair is <strong className="text-[#18ff8a]">{signal?.recommendedDisplayPair}</strong>.</p>{windowClosed && <ErrorMessage text="This trading window has closed. Please wait for the next trading window."/>}<button type="button" onClick={() => !windowClosed && setStep(2)} disabled={windowClosed} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-[#18ff8a] py-3.5 text-xs font-black text-[#041008] disabled:cursor-not-allowed disabled:opacity-40">NEXT <ChevronRight size={15}/></button></div> : <div><div className="grid grid-cols-2 gap-2.5">{signal?.pairs?.map(pair => { const ticker = tickerMap.get(pair.symbol); const change = ticker?.changePercent; return <button key={pair.symbol} type="button" onClick={() => selectPair(pair)} disabled={submitting || windowClosed} className="min-w-0 rounded-2xl border border-white/[.08] bg-black/25 p-3 text-left transition hover:border-[#18ff8a]/35 hover:bg-[#18ff8a]/[.06] disabled:cursor-not-allowed disabled:opacity-55"><div className="flex min-w-0 items-center gap-2"><img src={pair.logo} alt={`${pair.displayPair} logo`} className="h-8 w-8 shrink-0 rounded-full object-contain"/><span className="truncate text-xs font-black text-white">{pair.displayPair}</span></div><p className="mt-2 truncate text-[11px] font-bold text-slate-300">{ticker ? formatPrice(ticker.price) : "--"}</p><p className={`mt-1 text-[10px] font-black ${typeof change === "number" && change < 0 ? "text-[#ff5f78]" : "text-[#18ff8a]"}`}>{typeof change === "number" ? `${change >= 0 ? "+" : ""}${change.toFixed(2)}%` : "--"}</p></button>; })}</div>{(error || windowClosed) && <ErrorMessage text={windowClosed ? "This trading window has closed. Please wait for the next trading window." : error}/>} {submitting && <p className="mt-3 text-center text-xs font-bold text-[#18ff8a]">Placing trade securely...</p>}</div>}
    </div>
  </ModalShell>;
}

function ModalShell({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return <div className="fixed inset-0 z-[90] grid place-items-end bg-black/75 px-3 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur-sm sm:place-items-center sm:p-4" role="dialog" aria-modal="true"><button type="button" aria-label="Close manual trade" onClick={onClose} className="absolute inset-0"/><section className="relative w-full max-w-lg overflow-hidden rounded-[26px] border border-[#18ff8a]/20 bg-[#0c1713] shadow-[0_24px_80px_rgba(0,0,0,.6)]"><button type="button" onClick={onClose} aria-label="Close" className="absolute right-4 top-4 z-10 grid h-8 w-8 place-items-center rounded-full border border-white/[.08] bg-black/30 text-slate-400"><X size={15}/></button>{children}</section></div>;
}

function ErrorMessage({ text }: { text: string }) {
  return <p className="mt-4 rounded-xl border border-[#ff4f6d]/25 bg-[#ff4f6d]/10 px-3 py-2.5 text-xs font-bold leading-5 text-[#ff8b9e]">{text}</p>;
}

function formatPrice(value: number) {
  return value < 1 ? value.toFixed(6) : value.toLocaleString("en-US", { maximumFractionDigits: 2 });
}
