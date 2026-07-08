import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { postBalancedJournal } from "./ledger";
import { createNotification } from "./notification-service";

export type P2PTransferInput = {
  senderId: string;
  receiver: string;
  asset: string;
  amount: Prisma.Decimal;
  note?: string | null;
  idempotencyKey: string;
};

export async function createP2PTransfer(input: P2PTransferInput) {
  const receiverLookup = input.receiver.trim();
  const assetSymbol = input.asset.trim().toUpperCase();
  const note = input.note?.trim() || null;
  const idempotencyKey = input.idempotencyKey.trim();

  if (!idempotencyKey) throw new Error("Idempotency key is required");
  if (!receiverLookup) throw new Error("Receiver UID or email is required");
  if (!assetSymbol) throw new Error("Asset is required");
  if (input.amount.lte(0)) throw new Error("Amount must be greater than 0");

  return prisma.$transaction(async (tx) => {
    const existing = await tx.p2PTransfer.findUnique({
      where: { idempotencyKey },
      include: {
        asset: true,
        sender: { select: { id: true, uid: true, name: true, email: true } },
        receiver: { select: { id: true, uid: true, name: true, email: true } },
      },
    });
    if (existing) return existing;

    const [sender, receiver, asset] = await Promise.all([
      tx.user.findUniqueOrThrow({ where: { id: input.senderId }, select: { id: true, uid: true, name: true, email: true, spotBalance: true } }),
      tx.user.findFirst({
        where: {
          status: "ACTIVE",
          OR: [
            { uid: receiverLookup },
            { email: { equals: receiverLookup, mode: "insensitive" } },
          ],
        },
        select: { id: true, uid: true, name: true, email: true, spotBalance: true },
      }),
      tx.asset.findUnique({ where: { symbol: assetSymbol } }),
    ]);

    if (!receiver) throw new Error("Receiver not found");
    if (receiver.id === sender.id) throw new Error("Cannot send P2P transfer to yourself");
    if (!asset || !asset.enabled) throw new Error("Asset is not available");

    const [senderAccount, receiverAccount] = await Promise.all([
      ensureSpotAccount(tx, sender.id, asset.id),
      ensureSpotAccount(tx, receiver.id, asset.id),
    ]);

    if (asset.symbol === "USDT") {
      const debit = await tx.user.updateMany({
        where: { id: sender.id, spotBalance: { gte: input.amount } },
        data: { spotBalance: { decrement: input.amount } },
      });
      if (debit.count !== 1) throw new Error("Insufficient Spot Wallet balance");
      await tx.user.update({ where: { id: receiver.id }, data: { spotBalance: { increment: input.amount } } });
    } else {
      const available = await accountBalance(tx, senderAccount.id);
      if (available.lt(input.amount)) throw new Error(`Insufficient ${asset.symbol} balance`);
    }

    const transfer = await tx.p2PTransfer.create({
      data: {
        senderId: sender.id,
        receiverId: receiver.id,
        assetId: asset.id,
        amount: input.amount,
        note,
        idempotencyKey,
      },
    });

    const journal = await postBalancedJournal(tx, {
      referenceType: "P2P_TRANSFER",
      referenceId: transfer.id,
      idempotencyKey: `p2p-transfer:${idempotencyKey}`,
      memo: `P2P transfer ${asset.symbol}`,
      lines: [
        { accountId: senderAccount.id, direction: "DEBIT", amount: input.amount },
        { accountId: receiverAccount.id, direction: "CREDIT", amount: input.amount },
      ],
    });

    const completed = await tx.p2PTransfer.update({
      where: { id: transfer.id },
      data: { status: "COMPLETED", ledgerJournalId: journal.id, completedAt: new Date() },
      include: {
        asset: true,
        sender: { select: { id: true, uid: true, name: true, email: true } },
        receiver: { select: { id: true, uid: true, name: true, email: true } },
      },
    });

    await Promise.all([
      createNotification(tx, {
        userId: sender.id,
        type: "P2P_TRANSFER",
        title: "P2P transfer sent",
        message: `You sent ${input.amount.toString()} ${asset.symbol} to ${receiver.name} / ${receiver.uid}.`,
        metadata: { transferId: completed.id, receiverId: receiver.id, asset: asset.symbol, amount: input.amount.toString() },
      }),
      createNotification(tx, {
        userId: receiver.id,
        type: "P2P_TRANSFER",
        title: "P2P transfer received",
        message: `You received ${input.amount.toString()} ${asset.symbol} from ${sender.name} / ${sender.uid}.`,
        metadata: { transferId: completed.id, senderId: sender.id, asset: asset.symbol, amount: input.amount.toString() },
      }),
    ]);

    return completed;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

async function ensureSpotAccount(tx: Prisma.TransactionClient, userId: string, assetId: string) {
  const existing = await tx.walletAccount.findUnique({ where: { userId_assetId_type: { userId, assetId, type: "SPOT" } } });
  if (existing) return existing;
  return tx.walletAccount.create({ data: { userId, assetId, type: "SPOT" } });
}

async function accountBalance(tx: Prisma.TransactionClient, accountId: string) {
  const entries = await tx.ledgerEntry.findMany({ where: { accountId }, select: { direction: true, amount: true } });
  return entries.reduce((sum, entry) => entry.direction === "CREDIT" ? sum.add(entry.amount) : sum.sub(entry.amount), new Prisma.Decimal(0));
}
