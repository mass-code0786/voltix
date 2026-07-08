import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { auditFailure, auditSuccess } from "@/lib/audit";
import { createP2PTransfer } from "@/lib/domain/p2p-service";
import { rateLimitByUser } from "@/lib/security";
import { verifyTransactionPinForUser } from "@/lib/domain/transaction-pin-service";

const p2pTransferSchema = z.object({
  receiver: z.string().trim().min(1, "Receiver UID or email is required").max(120),
  asset: z.string().trim().min(1, "Asset is required").max(16),
  amount: z.coerce.number().positive("Amount must be greater than 0"),
  note: z.string().trim().max(160).optional(),
  idempotencyKey: z.string().trim().min(8, "Idempotency key is required").max(120),
  transactionPin: z.string().trim().optional(),
});

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });

  const limited = rateLimitByUser(user.id, "p2p-transfer", 20, 60 * 60 * 1000);
  if (limited) return limited;

  const parsed = p2pTransferSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Invalid P2P transfer";
    await auditFailure({ request, userId: user.id, role: "USER", action: "P2P_TRANSFER", module: "P2P", description: "P2P transfer validation failed", errorMessage: message }).catch(() => null);
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    const pinLimited = rateLimitByUser(user.id, "transaction-pin-p2p", 8, 15 * 60 * 1000);
    if (pinLimited) return pinLimited;
    await verifyTransactionPinForUser(user.id, parsed.data.transactionPin);
    const transfer = await createP2PTransfer({
      senderId: user.id,
      receiver: parsed.data.receiver,
      asset: parsed.data.asset,
      amount: new Prisma.Decimal(parsed.data.amount),
      note: parsed.data.note,
      idempotencyKey: parsed.data.idempotencyKey,
    });
    await auditSuccess({
      request,
      userId: user.id,
      role: "USER",
      action: "P2P_TRANSFER",
      module: "P2P",
      description: "User completed internal P2P transfer",
      newValue: {
        id: transfer.id,
        receiverId: transfer.receiverId,
        asset: transfer.asset.symbol,
        amount: transfer.amount.toString(),
        status: transfer.status,
      },
    }).catch(() => null);
    return NextResponse.json({
      transfer: {
        id: transfer.id,
        sender: { uid: transfer.sender.uid, name: transfer.sender.name },
        receiver: { uid: transfer.receiver.uid, name: transfer.receiver.name },
        asset: transfer.asset.symbol,
        amount: Number(transfer.amount.toString()),
        note: transfer.note,
        status: transfer.status,
        createdAt: transfer.createdAt.toISOString(),
      },
    }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "P2P transfer failed";
    await auditFailure({ request, userId: user.id, role: "USER", action: "P2P_TRANSFER", module: "P2P", description: "P2P transfer failed", errorMessage: message, metadata: { receiver: parsed.data.receiver, asset: parsed.data.asset } }).catch(() => null);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
