import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import CleanExchangeApp, { type CleanSection } from "@/components/themes/clean-exchange/clean-exchange-app";

const sections = new Set<CleanSection>(["home", "markets", "ai-trade", "futures", "wallet"]);

export default async function CleanPreviewPage({ params }: { params: Promise<{ section?: string[] }> }) {
  const user = await getCurrentUser();
  if (!user) redirect(`/auth?mode=login&returnTo=${encodeURIComponent("/clean-preview")}`);
  const { section } = await params;
  if ((section?.length ?? 0) > 1) notFound();
  const active = (section?.[0] ?? "home") as CleanSection;
  if (!sections.has(active)) notFound();
  return <CleanExchangeApp section={active} />;
}
