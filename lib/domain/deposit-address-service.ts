import { Prisma, type ChainNetwork, type DepositAddress } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ensureUserWalletAccounts } from "./user-wallets";

const supportedNetworks = [
  { key: "bsc", name: "BNB Smart Chain", requiredConfirmations: 12 },
  { key: "tron", name: "TRON", requiredConfirmations: 20 },
  { key: "eth", name: "Ethereum", requiredConfirmations: 20 },
] as const;

export async function getUserDepositAddresses(userId: string) {
  return prisma.$transaction(async tx => {
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { id: true, uid: true } });
    const asset = await ensureUserWalletAccounts(tx, user.id);
    const addresses = [];
    for (const networkConfig of supportedNetworks) {
      const network = await tx.chainNetwork.upsert({
        where: { key: networkConfig.key },
        update: { enabled: true },
        create: networkConfig,
      });
      const address = await ensurePermanentDepositAddress(tx, {
        userId: user.id,
        uid: user.uid,
        assetId: asset.id,
        network,
      });
      addresses.push(formatDepositAddress(address, network));
    }
    return { addresses };
  });
}

async function ensurePermanentDepositAddress(
  client: Prisma.TransactionClient,
  input: { userId: string; uid: string; assetId: string; network: ChainNetwork },
) {
  const existing = await client.depositAddress.findFirst({
    where: { userId: input.userId, assetId: input.assetId, networkId: input.network.id, active: true },
  });
  if (existing) return existing;
  const derivationIndex = await client.depositAddress.count({ where: { networkId: input.network.id } });
  return client.depositAddress.create({
    data: {
      userId: input.userId,
      assetId: input.assetId,
      networkId: input.network.id,
      address: `manual-${input.network.key}-${input.uid}`,
      derivationIndex,
      path: "manual/permanent",
    },
  });
}

function formatDepositAddress(address: DepositAddress, network: ChainNetwork) {
  return {
    id: address.id,
    network: network.key.toUpperCase(),
    networkName: network.name,
    requiredConfirmations: network.requiredConfirmations,
    address: address.address,
    active: address.active,
    createdAt: address.createdAt.toISOString(),
  };
}
