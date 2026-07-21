import AppShell from "@/components/app-shell";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/auth";
import { interfacePreferenceCookie, parseInterfacePreference } from "@/lib/interface-preference";
import CleanExchangeApp, { type CleanSection } from "@/components/themes/clean-exchange/clean-exchange-app";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/");

  const cookieStore = await cookies();
  const preference = parseInterfacePreference(cookieStore.get(interfacePreferenceCookie)?.value);
  const cleanSection = cleanSectionFor(await searchParams);
  if (preference === "clean" && cleanSection) return <CleanExchangeApp section={cleanSection} routeMode="production" />;
  return <AppShell />;
}

function cleanSectionFor(params: Record<string, string | string[] | undefined>): CleanSection | null {
  const value = (key: string) => typeof params[key] === "string" ? params[key] : null;
  const view = value("view");
  if (!view || view === "home") return "home";
  if (view === "markets") return "markets";
  if (view === "aiTrade") return "ai-trade";
  if (view === "wallet") {
    const walletSection = value("wallet");
    if (walletSection && walletSection !== "overview") return null;
    if (value("action")) return null;
    return "wallet";
  }
  if (view === "futures" || (view === "trade" && value("trade") === "futures")) return "futures";
  return null;
}
