"use client";

export function VerificationRequiredDialog({open,onComplete,onCancel}:{open:boolean;onComplete:()=>void;onCancel:()=>void}) {
  if (!open) return null;
  return <div className="fixed inset-0 z-[100] grid place-items-end bg-black/75 backdrop-blur-sm sm:place-items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="verification-required-title">
    <div className="w-full max-w-sm rounded-t-[26px] border border-[#18ff8a]/20 bg-[#101b16] p-5 shadow-2xl sm:rounded-[26px]">
      <div className="grid h-11 w-11 place-items-center rounded-2xl border border-[#18ff8a]/25 bg-[#18ff8a]/10 text-xl text-[#18ff8a]" aria-hidden="true">✓</div>
      <h2 id="verification-required-title" className="mt-4 text-xl font-black text-white">Account verification required</h2>
      <p className="mt-2 text-sm leading-6 text-slate-400">Please complete your account verification before making a withdrawal.</p>
      <p className="mt-2 text-xs text-slate-500">Withdrawals are available only to verified accounts.</p>
      <div className="mt-5 grid grid-cols-2 gap-3">
        <button type="button" onClick={onCancel} className="rounded-2xl border border-white/[.08] bg-black/25 py-3 text-xs font-black text-slate-300">Cancel</button>
        <button type="button" onClick={onComplete} className="rounded-2xl bg-[#18ff8a] px-2 py-3 text-xs font-black text-[#050608]">Complete Verification</button>
      </div>
    </div>
  </div>;
}
