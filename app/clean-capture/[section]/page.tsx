import CleanExchangeApp, { type CleanSection } from "@/components/themes/clean-exchange/clean-exchange-app";

const supported = new Set<CleanSection>(["home", "ai-trade", "futures", "wallet"]);

export default async function CleanCapturePage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  return <CleanExchangeApp section={supported.has(section as CleanSection) ? section as CleanSection : "home"} />;
}
