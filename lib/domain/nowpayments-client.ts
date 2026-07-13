import { createHmac } from "crypto";

export type NowPaymentsJson = Record<string, unknown>;

export class NowPaymentsApiError extends Error {
  readonly status: number | null;
  readonly response: NowPaymentsJson | null;

  constructor(message: string, status: number | null, response: NowPaymentsJson | null = null) {
    super(message);
    this.name = "NowPaymentsApiError";
    this.status = status;
    this.response = response;
  }

  get definitiveRejection() {
    return this.status !== null && this.status >= 400 && this.status < 500;
  }
}

let cachedAuth: { token: string; expiresAt: number } | null = null;

export function nowPaymentsCurrencyForNetwork(network: string) {
  const normalized = network.trim().toUpperCase();
  if (normalized === "BSC") return "usdtbsc";
  if (normalized === "TRON") return "usdttrc20";
  throw new Error("Only USDT BEP20 and USDT TRC20 are supported");
}

export async function createNowPaymentsCustomer(name: string) {
  return request("/v1/sub-partner/balance", {
    method: "POST",
    auth: true,
    body: { name },
  });
}

export async function createNowPaymentsCustomerPayment(input: {
  customerId: string;
  currency: string;
  amount: number;
}) {
  return request("/v1/sub-partner/payment", {
    method: "POST",
    auth: true,
    body: {
      currency: input.currency,
      amount: input.amount,
      sub_partner_id: input.customerId,
      is_fixed_rate: false,
      is_fee_paid_by_user: false,
      ipn_callback_url: nowPaymentsDepositCallbackUrl(),
    },
  });
}

export async function validateNowPaymentsPayoutAddress(address: string, currency: string) {
  const data = await request("/v1/payout/validate-address", {
    method: "POST",
    body: { address, currency, extra_id: null },
  });
  const valid = data.valid ?? data.is_valid ?? data.result;
  if (valid === false || String(data.status ?? "").toLowerCase() === "invalid") {
    throw new NowPaymentsApiError("Invalid withdrawal address for the selected network", 400, data);
  }
  return data;
}

export async function createNowPaymentsPayout(input: {
  withdrawalId: string;
  address: string;
  currency: string;
  amount: number;
}) {
  const data = await request("/v1/payout", {
    method: "POST",
    auth: true,
    body: {
      withdrawals: [{
        address: input.address,
        currency: input.currency,
        amount: roundPayoutAmount(input.amount),
        ipn_callback_url: nowPaymentsPayoutCallbackUrl(),
        unique_external_id: input.withdrawalId,
      }],
      payout_description: `Voltix withdrawal ${input.withdrawalId}`,
    },
  });

  const payout = firstPayout(data);
  const payoutId = stringValue(payout.id ?? payout.payout_id);
  const batchId = stringValue(data.id ?? data.batch_withdrawal_id ?? data.batch_id ?? payout.batch_withdrawal_id);
  if (!payoutId) throw new NowPaymentsApiError("NOWPayments payout response did not include a payout ID", 502, data);

  const totpSecret = process.env.NOWPAYMENTS_TOTP_SECRET?.trim();
  if (batchId && totpSecret) {
    await request(`/v1/payout/${encodeURIComponent(batchId)}/verify`, {
      method: "POST",
      auth: true,
      body: { verification_code: generateTotp(totpSecret) },
    });
  } else if (process.env.NOWPAYMENTS_REQUIRE_PAYOUT_2FA !== "false") {
    throw new NowPaymentsApiError("NOWPayments payout 2FA is not configured", 503, data);
  }

  return {
    payoutId,
    batchId,
    status: stringValue(payout.status ?? data.status) ?? "creating",
    txHash: stringValue(payout.hash ?? payout.tx_hash),
    raw: data,
  };
}

async function request(path: string, options: { method: "POST" | "GET"; auth?: boolean; body?: NowPaymentsJson }) {
  const apiKey = process.env.NOWPAYMENTS_API_KEY?.trim();
  if (!apiKey) throw new NowPaymentsApiError("NOWPayments API key is not configured", 503);
  const headers: Record<string, string> = { "x-api-key": apiKey, "Content-Type": "application/json" };
  if (options.auth) headers.Authorization = `Bearer ${await authToken()}`;
  let response: Response;
  try {
    response = await fetch(`${apiBase()}${path}`, {
      method: options.method,
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: AbortSignal.timeout(20_000),
    });
  } catch (error) {
    throw new NowPaymentsApiError(error instanceof Error ? `NOWPayments request failed: ${error.message}` : "NOWPayments request failed", null);
  }
  const data = await response.json().catch(() => ({})) as NowPaymentsJson;
  if (!response.ok) throw new NowPaymentsApiError(extractError(data), response.status, data);
  return data;
}

async function authToken() {
  if (cachedAuth && cachedAuth.expiresAt > Date.now() + 15_000) return cachedAuth.token;
  const email = process.env.NOWPAYMENTS_EMAIL?.trim();
  const password = process.env.NOWPAYMENTS_PASSWORD;
  if (!email || !password) throw new NowPaymentsApiError("NOWPayments payout credentials are not configured", 503);
  let response: Response;
  try {
    response = await fetch(`${apiBase()}/v1/auth`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch (error) {
    throw new NowPaymentsApiError(error instanceof Error ? `NOWPayments authentication failed: ${error.message}` : "NOWPayments authentication failed", null);
  }
  const data = await response.json().catch(() => ({})) as NowPaymentsJson;
  const token = stringValue(data.token);
  if (!response.ok || !token) throw new NowPaymentsApiError(extractError(data, "NOWPayments authentication failed"), response.status, data);
  cachedAuth = { token, expiresAt: Date.now() + 4 * 60_000 };
  return token;
}

function firstPayout(data: NowPaymentsJson): NowPaymentsJson {
  const candidate = data.withdrawals ?? data.payouts ?? data.result;
  if (Array.isArray(candidate) && candidate[0] && typeof candidate[0] === "object") return candidate[0] as NowPaymentsJson;
  if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) return candidate as NowPaymentsJson;
  return data;
}

function roundPayoutAmount(amount: number) {
  return Number(amount.toFixed(6));
}

function generateTotp(secret: string, now = Date.now()) {
  const key = decodeBase32(secret);
  const counter = Math.floor(now / 30_000);
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", key).update(buffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const code = (digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return code.toString().padStart(6, "0");
}

function decodeBase32(value: string) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const normalized = value.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = "";
  for (const char of normalized) {
    const index = alphabet.indexOf(char);
    if (index < 0) throw new Error("Invalid NOWPayments TOTP secret");
    bits += index.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
  return Buffer.from(bytes);
}

function nowPaymentsDepositCallbackUrl() {
  return process.env.NOWPAYMENTS_IPN_CALLBACK_URL?.trim() || `${appUrl()}/api/webhooks/nowpayments`;
}

function nowPaymentsPayoutCallbackUrl() {
  return process.env.NOWPAYMENTS_PAYOUT_IPN_CALLBACK_URL?.trim() || `${appUrl()}/api/webhooks/nowpayments/payout`;
}

function appUrl() {
  const value = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL;
  if (!value) throw new Error("Application URL is not configured");
  return value.replace(/\/$/, "");
}

function apiBase() {
  return (process.env.NOWPAYMENTS_API_BASE_URL || "https://api.nowpayments.io").replace(/\/$/, "");
}

function stringValue(value: unknown) {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" || typeof value === "bigint") return String(value);
  return null;
}

function extractError(data: NowPaymentsJson, fallback = "NOWPayments request failed") {
  return stringValue(data.message ?? data.error ?? data.status) ?? fallback;
}
