import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import { prisma } from "@/lib/prisma";

export async function sendPushToUser(input: { userId: string; title: string; body: string; data?: Record<string, string> }) {
  const messaging = getFirebaseMessaging();
  if (!messaging) return { sent: 0, disabled: 0, skipped: true };
  const devices = await prisma.pushDevice.findMany({ where: { userId: input.userId, enabled: true }, select: { token: true } });
  if (!devices.length) return { sent: 0, disabled: 0, skipped: false };
  const response = await messaging.sendEachForMulticast({
    tokens: devices.map(device => device.token),
    notification: { title: input.title, body: input.body },
    data: input.data,
  });
  const deadTokens = response.responses
    .map((result, index) => result.success ? null : devices[index]?.token)
    .filter((token): token is string => Boolean(token));
  if (deadTokens.length) await prisma.pushDevice.updateMany({ where: { token: { in: deadTokens } }, data: { enabled: false, lastSeenAt: new Date() } });
  return { sent: response.successCount, disabled: deadTokens.length, skipped: false };
}

function getFirebaseMessaging() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!projectId || !clientEmail || !privateKey) return null;
  if (!getApps().length) {
    initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
  }
  return getMessaging();
}
