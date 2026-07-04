import { NotificationType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type NotificationClient = Pick<Prisma.TransactionClient, "notification" | "user"> | typeof prisma;

export async function getUserNotifications(userId: string) {
  const [notifications, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.notification.count({ where: { userId, readAt: null } }),
  ]);
  return { notifications: notifications.map(formatNotification), unreadCount };
}

export async function markUserNotificationsRead(userId: string, ids?: string[]) {
  const now = new Date();
  const where = {
    userId,
    readAt: null,
    ...(ids?.length ? { id: { in: ids } } : {}),
  };
  const result = await prisma.notification.updateMany({ where, data: { readAt: now } });
  const unreadCount = await prisma.notification.count({ where: { userId, readAt: null } });
  return { updated: result.count, unreadCount };
}

export async function createNotification(client: NotificationClient, input: {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  metadata?: Prisma.InputJsonValue;
}) {
  return client.notification.create({
    data: {
      userId: input.userId,
      type: input.type,
      title: input.title,
      message: input.message,
      metadata: input.metadata ?? undefined,
    },
  });
}

export async function broadcastNotification(input: {
  type: NotificationType;
  title: string;
  message: string;
  metadata?: Prisma.InputJsonValue;
}) {
  const users = await prisma.user.findMany({ where: { status: "ACTIVE" }, select: { id: true } });
  if (!users.length) return { sent: 0 };
  const result = await prisma.notification.createMany({
    data: users.map(user => ({
      userId: user.id,
      type: input.type,
      title: input.title,
      message: input.message,
      metadata: input.metadata,
    })),
  });
  return { sent: result.count };
}

function formatNotification(notification: {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  metadata: Prisma.JsonValue | null;
  readAt: Date | null;
  createdAt: Date;
}) {
  return {
    id: notification.id,
    type: notification.type,
    title: notification.title,
    message: notification.message,
    metadata: notification.metadata,
    readAt: notification.readAt?.toISOString() ?? null,
    createdAt: notification.createdAt.toISOString(),
    unread: !notification.readAt,
  };
}
