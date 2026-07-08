import Link from "next/link";
import { AuthScreen } from "@/app/auth/auth-screen";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function ReferralJoinPage({ params }: { params: Promise<{ referralCode: string }> }) {
  const { referralCode } = await params;
  const code = referralCode.trim().toUpperCase();
  const sponsor = code
    ? await prisma.user.findUnique({
        where: { uid: code },
        select: { uid: true, name: true, status: true },
      })
    : null;

  if (!sponsor || sponsor.status !== "ACTIVE") {
    return <InvalidReferralLink />;
  }

  return (
    <AuthScreen
      initialMode="register"
      initialReferralCode={sponsor.uid}
      lockedReferral
      initialSponsorLabel={sponsor.name || sponsor.uid}
    />
  );
}

function InvalidReferralLink() {
  return (
    <main className="auth-premium-page min-h-screen text-white">
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-4 py-8">
        <section className="auth-card flex-none space-y-5 p-6 text-center">
          <img src="/logo.png" alt="VOLTIX" className="mx-auto h-7 w-auto" />
          <div>
            <h1 className="text-2xl font-black text-white">Invalid referral link.</h1>
            <p className="mt-2 text-sm font-bold text-slate-400">This invite code is not active or does not exist.</p>
          </div>
          <div className="grid gap-3">
            <Link href="/auth?mode=register" className="auth-submit block text-center">Register without referral</Link>
            <Link href="/" className="rounded-2xl border border-lime/20 bg-white/5 px-4 py-3 text-sm font-black text-lime">Go home</Link>
          </div>
        </section>
      </div>
    </main>
  );
}
