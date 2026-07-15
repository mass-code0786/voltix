import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { getUserWalletSnapshot } from "@/lib/domain/user-wallets";
import { previewWalletTransfer, transferWallet } from "@/lib/domain/wallet-service";
import { prisma } from "@/lib/prisma";
import { auditFailure, auditSuccess } from "@/lib/audit";
import { displayWalletName } from "@/lib/wallet-labels";

const transferSchema = z.object({
  fromWallet: z.enum(["SPOT", "FUTURES", "AI"]),
  toWallet: z.enum(["SPOT", "FUTURES", "AI"]),
  amount: z.coerce.number().positive(),
  idempotencyKey: z.string().trim().min(8).max(120),
  acceptEarlyTransferCharge: z.boolean().optional(),
});

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ authenticated: false, wallet: null }, { status: 401 });
  }

  const wallet = await getUserWalletSnapshot(prisma, user.id);
  return NextResponse.json({ authenticated: true, userId: user.id, wallet });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });
  const parsed = transferSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid wallet transfer" }, { status: 400 });
  }
  try {
    if (new URL(request.url).searchParams.get("preview") === "true") {
      const preview = await previewWalletTransfer({
        userId: user.id,
        fromWallet: parsed.data.fromWallet,
        toWallet: parsed.data.toWallet,
        amount: new Prisma.Decimal(parsed.data.amount),
      });
      return NextResponse.json({ preview });
    }
    const transfer = await transferWallet({
      userId: user.id,
      fromWallet: parsed.data.fromWallet,
      toWallet: parsed.data.toWallet,
      amount: new Prisma.Decimal(parsed.data.amount),
      idempotencyKey: `${user.id}:${parsed.data.idempotencyKey}`,
      acceptEarlyTransferCharge: parsed.data.acceptEarlyTransferCharge === true,
    });
    await auditSuccess({ request, userId: user.id, role: "USER", action: "WALLET_TRANSFER", module: "WALLET", description: "User transferred funds between wallets", newValue: { id: transfer.id, fromWallet: transfer.fromWallet, toWallet: transfer.toWallet, amount: transfer.amount.toString(), status: transfer.status } }).catch(() => null);
    return NextResponse.json({
      transfer: {
        id: transfer.id,
        fromWallet: transfer.fromWallet,
        toWallet: transfer.toWallet,
        fromWalletName: displayWalletName(transfer.fromWallet),
        toWalletName: displayWalletName(transfer.toWallet),
        amount: Number(transfer.amount.toString()),
        feeAmount: Number(transfer.feeAmount.toString()),
        receivedAmount: Number(transfer.receivedAmount.toString()),
        status: transfer.status,
        createdAt: transfer.createdAt.toISOString(),
      },
    }, { status: 201 });
  } catch (error) {
    await auditFailure({ request, userId: user.id, role: "USER", action: "WALLET_TRANSFER", module: "WALLET", description: "Wallet transfer failed", errorMessage: error instanceof Error ? error.message : "Wallet transfer failed" }).catch(() => null);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Wallet transfer failed" }, { status: 400 });
  }
}
