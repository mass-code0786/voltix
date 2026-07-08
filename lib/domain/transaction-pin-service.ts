import { prisma } from "@/lib/prisma";
import { hashPassword, verifyPassword } from "@/lib/auth";

const pinPattern = /^\d{6}$/;

export const transactionPinMessages = {
  required: "Transaction PIN required.",
  invalid: "Invalid Transaction PIN.",
  notSet: "Please create your Transaction PIN first.",
  invalidFormat: "Transaction PIN must be exactly 6 digits.",
  alreadySet: "Transaction PIN is already created.",
  mismatch: "Transaction PIN confirmation must match.",
} as const;

export function validateTransactionPinFormat(pin: string) {
  return pinPattern.test(pin);
}

export async function getTransactionPinStatus(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { transactionPinSetAt: true },
  });
  return {
    isSet: Boolean(user.transactionPinSetAt),
    setAt: user.transactionPinSetAt?.toISOString() ?? null,
  };
}

export async function createTransactionPin(userId: string, pin: string, confirmPin: string) {
  if (!validateTransactionPinFormat(pin) || !validateTransactionPinFormat(confirmPin)) throw new Error(transactionPinMessages.invalidFormat);
  if (pin !== confirmPin) throw new Error(transactionPinMessages.mismatch);
  const existing = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { transactionPinHash: true },
  });
  if (existing.transactionPinHash) throw new Error(transactionPinMessages.alreadySet);
  const now = new Date();
  await prisma.user.update({
    where: { id: userId },
    data: { transactionPinHash: await hashPassword(pin), transactionPinSetAt: now },
  });
  return { ok: true, setAt: now.toISOString() };
}

export async function changeTransactionPin(userId: string, currentPin: string, newPin: string, confirmPin: string) {
  if (!validateTransactionPinFormat(currentPin) || !validateTransactionPinFormat(newPin) || !validateTransactionPinFormat(confirmPin)) throw new Error(transactionPinMessages.invalidFormat);
  if (newPin !== confirmPin) throw new Error(transactionPinMessages.mismatch);
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { transactionPinHash: true },
  });
  if (!user.transactionPinHash) throw new Error(transactionPinMessages.notSet);
  if (!(await verifyPassword(currentPin, user.transactionPinHash))) throw new Error(transactionPinMessages.invalid);
  const now = new Date();
  await prisma.user.update({
    where: { id: userId },
    data: { transactionPinHash: await hashPassword(newPin), transactionPinSetAt: now },
  });
  return { ok: true, setAt: now.toISOString() };
}

export async function verifyTransactionPinForUser(userId: string, pin: string | undefined | null) {
  if (!pin) throw new Error(transactionPinMessages.required);
  if (!validateTransactionPinFormat(pin)) throw new Error(transactionPinMessages.invalid);
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { transactionPinHash: true },
  });
  if (!user.transactionPinHash) throw new Error(transactionPinMessages.notSet);
  if (!(await verifyPassword(pin, user.transactionPinHash))) throw new Error(transactionPinMessages.invalid);
  return { ok: true };
}
