import { createHmac, timingSafeEqual } from "crypto";

export function verifyNowPaymentsSignature(rawBody: string, signature: string, secret: string) {
  return validateNowPaymentsSignature(rawBody, signature, secret).verified;
}

export function validateNowPaymentsSignature(rawBody: string, signature: string, secret: string): { verified: boolean; reason: string | null } {
  if (!signature) return { verified: false, reason: "missing_x_nowpayments_sig" };
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return { verified: false, reason: "invalid_json_body" };
  }
  const expected = createHmac("sha512", secret).update(stableStringify(parsed)).digest("hex");
  const received = signature.trim();
  if (!/^[a-f\d]+$/i.test(received) || received.length % 2 !== 0) return { verified: false, reason: "malformed_x_nowpayments_sig" };
  const expectedBuffer = Buffer.from(expected, "hex");
  const receivedBuffer = Buffer.from(received, "hex");
  if (expectedBuffer.length !== receivedBuffer.length) return { verified: false, reason: "signature_length_mismatch" };
  if (!timingSafeEqual(expectedBuffer, receivedBuffer)) return { verified: false, reason: "signature_digest_mismatch" };
  return { verified: true, reason: null };
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value as Record<string, unknown>).sort().map(key => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
