import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { auditSuccess } from "@/lib/audit";
import {
  isSupportedExternalWalletNetwork,
  normalizeExternalWalletAddress,
  validateExternalWalletAddress,
} from "@/lib/external-wallets";

const bindingSchema = z.object({
  network: z.string().trim().min(1),
  walletAddress: z.string().trim().min(1),
  walletName: z.string().trim().max(80).optional().nullable(),
});

const removeSchema = z.object({
  network: z.string().trim().min(1),
});

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });
  const wallets = await prisma.externalWalletBinding.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({ wallets: wallets.map(formatBinding) });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });
  const parsed = bindingSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid wallet binding" }, { status: 400 });
  if (!isSupportedExternalWalletNetwork(parsed.data.network)) return NextResponse.json({ error: "Unsupported network" }, { status: 400 });
  const validationError = validateExternalWalletAddress(parsed.data.network, parsed.data.walletAddress);
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });

  const walletAddress = normalizeExternalWalletAddress(parsed.data.network, parsed.data.walletAddress);
  const wallet = await prisma.externalWalletBinding.upsert({
    where: { userId_network: { userId: user.id, network: parsed.data.network } },
    update: { walletAddress, walletName: parsed.data.walletName?.trim() || null },
    create: { userId: user.id, network: parsed.data.network, walletAddress, walletName: parsed.data.walletName?.trim() || null },
  });
  await auditSuccess({
    request,
    userId: user.id,
    role: "USER",
    action: "EXTERNAL_WALLET_BIND",
    module: "PROFILE",
    description: "User bound external wallet",
    newValue: formatBinding(wallet),
  }).catch(() => null);
  return NextResponse.json({ wallet: formatBinding(wallet) });
}

export async function DELETE(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });
  const parsed = removeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !isSupportedExternalWalletNetwork(parsed.data.network)) return NextResponse.json({ error: "Unsupported network" }, { status: 400 });
  await prisma.externalWalletBinding.deleteMany({ where: { userId: user.id, network: parsed.data.network } });
  await auditSuccess({
    request,
    userId: user.id,
    role: "USER",
    action: "EXTERNAL_WALLET_REMOVE",
    module: "PROFILE",
    description: "User removed external wallet",
    newValue: { network: parsed.data.network },
  }).catch(() => null);
  return NextResponse.json({ removed: true });
}

function formatBinding(wallet: { id: string; network: string; walletAddress: string; walletName: string | null; createdAt: Date; updatedAt: Date }) {
  return {
    id: wallet.id,
    network: wallet.network,
    walletAddress: wallet.walletAddress,
    walletName: wallet.walletName,
    createdAt: wallet.createdAt.toISOString(),
    updatedAt: wallet.updatedAt.toISOString(),
  };
}
