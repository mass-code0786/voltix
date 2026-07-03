export type LocalCurrencyCode = "USD" | "INR" | "AED" | "BDT" | "PKR" | "SAR" | "NPR";

type CurrencyConfig = {
  code: LocalCurrencyCode;
  rate: number;
  locale: string;
  prefix?: string;
};

const currencyByCountry: Record<string, LocalCurrencyCode> = {
  india: "INR",
  "united states": "USD",
  usa: "USD",
  us: "USD",
  uae: "AED",
  "united arab emirates": "AED",
  bangladesh: "BDT",
  pakistan: "PKR",
  "saudi arabia": "SAR",
  nepal: "NPR",
};

const currencyConfigs: Record<LocalCurrencyCode, CurrencyConfig> = {
  USD: { code: "USD", rate: 1, locale: "en-US" },
  INR: { code: "INR", rate: 83.47, locale: "en-IN" },
  AED: { code: "AED", rate: 3.6725, locale: "en-AE", prefix: "AED" },
  BDT: { code: "BDT", rate: 117.2, locale: "bn-BD" },
  PKR: { code: "PKR", rate: 278.5, locale: "en-PK" },
  SAR: { code: "SAR", rate: 3.75, locale: "en-SA" },
  NPR: { code: "NPR", rate: 133.55, locale: "ne-NP" },
};

export function currencyCodeForCountry(country?: string | null): LocalCurrencyCode {
  const normalized = country?.trim().toLowerCase();
  if (!normalized) return "USD";
  return currencyByCountry[normalized] ?? "USD";
}

export function currencyConfigForCountry(country?: string | null): CurrencyConfig {
  return currencyConfigs[currencyCodeForCountry(country)] ?? currencyConfigs.USD;
}

export function formatLocalCurrency(usdValue: number, config: CurrencyConfig) {
  const value = usdValue * config.rate;
  const maximumFractionDigits = value >= 1000 ? 0 : usdValue < 1 ? 4 : 2;
  const formatted = new Intl.NumberFormat(config.locale, {
    style: config.prefix ? "decimal" : "currency",
    currency: config.code,
    maximumFractionDigits,
  }).format(value);
  return config.prefix ? `${config.prefix} ${formatted}` : formatted;
}
