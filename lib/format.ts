import { usdInr } from "./demo-data";

export const usd = (value: number, digits = 2) => new Intl.NumberFormat("en-US", {
  style: "currency", currency: "USD", maximumFractionDigits: digits,
}).format(value);

export const inr = (value: number) => new Intl.NumberFormat("en-IN", {
  style: "currency", currency: "INR", maximumFractionDigits: 2,
}).format(value * usdInr);

export const compact = (value: number) => new Intl.NumberFormat("en-US", {
  notation: "compact", maximumFractionDigits: 2,
}).format(value);
