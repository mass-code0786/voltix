import { KycStatus, SupportTicketStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type KycInput = {
  userId: string;
  name: string;
  documentType: string;
  documentNumber: string;
  documentImagePath?: string | null;
};

type TicketInput = {
  userId: string;
  subject: string;
  message: string;
};

export async function getUserKyc(userId: string) {
  const request = await prisma.kycRequest.findFirst({ where: { userId }, orderBy: { createdAt: "desc" } });
  return {
    status: request?.status ?? "NOT_SUBMITTED",
    request: request ? serializeKyc(request) : null,
  };
}

export async function submitUserKyc(input: KycInput) {
  const request = await prisma.kycRequest.create({
    data: {
      userId: input.userId,
      name: input.name,
      documentType: input.documentType,
      documentNumber: input.documentNumber,
      documentImagePath: input.documentImagePath || null,
      status: "PENDING",
    },
  });
  await prisma.auditLog.create({
    data: { actorId: input.userId, actorType: "USER", action: "KYC_SUBMITTED", entityType: "KycRequest", entityId: request.id, metadata: { status: request.status } },
  });
  return serializeKyc(request);
}

export async function getAdminKycRows() {
  const requests = await prisma.kycRequest.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { user: { select: { name: true, uid: true } } },
  });
  return {
    rows: requests.map(request => [
      request.name || request.user.name,
      request.user.uid,
      request.documentType,
      request.documentNumber,
      formatDate(request.createdAt),
      request.status,
      request.id,
    ]),
  };
}

export async function reviewKyc(input: { id: string; adminUserId: string; status: Extract<KycStatus, "APPROVED" | "REJECTED">; reason?: string }) {
  const request = await prisma.kycRequest.update({
    where: { id: input.id },
    data: {
      status: input.status,
      reviewedById: input.adminUserId,
      reviewedAt: new Date(),
      rejectionReason: input.status === "REJECTED" ? input.reason ?? "Rejected by admin" : null,
    },
  });
  await prisma.auditLog.create({
    data: { actorId: input.adminUserId, actorType: "ADMIN", action: `KYC_${input.status}`, entityType: "KycRequest", entityId: request.id, metadata: { userId: request.userId, reason: request.rejectionReason } },
  });
  return serializeKyc(request);
}

export async function getUserSupportTickets(userId: string) {
  const tickets = await prisma.supportTicket.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 100 });
  return { tickets: tickets.map(serializeTicket) };
}

export async function createSupportTicket(input: TicketInput) {
  const ticket = await prisma.supportTicket.create({
    data: { userId: input.userId, subject: input.subject, message: input.message, status: "OPEN" },
  });
  await prisma.auditLog.create({
    data: { actorId: input.userId, actorType: "USER", action: "SUPPORT_TICKET_CREATED", entityType: "SupportTicket", entityId: ticket.id, metadata: { status: ticket.status } },
  });
  return serializeTicket(ticket);
}

export async function getAdminSupportRows() {
  const tickets = await prisma.supportTicket.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { user: { select: { name: true, uid: true } } },
  });
  return {
    rows: tickets.map(ticket => [
      ticket.id,
      `${ticket.user.name} / ${ticket.user.uid}`,
      ticket.subject,
      ticket.adminReply ?? "",
      ticket.status,
      formatDate(ticket.createdAt),
      ticket.id,
    ]),
  };
}

export async function updateSupportTicket(input: { id: string; adminUserId: string; status?: SupportTicketStatus; adminReply?: string }) {
  const ticket = await prisma.supportTicket.update({
    where: { id: input.id },
    data: {
      status: input.status,
      adminReply: input.adminReply,
      repliedById: input.adminReply ? input.adminUserId : undefined,
      repliedAt: input.adminReply ? new Date() : undefined,
    },
  });
  await prisma.auditLog.create({
    data: { actorId: input.adminUserId, actorType: "ADMIN", action: "SUPPORT_TICKET_UPDATED", entityType: "SupportTicket", entityId: ticket.id, metadata: { status: ticket.status, replied: Boolean(input.adminReply) } },
  });
  return serializeTicket(ticket);
}

function serializeKyc(request: { id: string; name: string; documentType: string; documentNumber: string; documentImagePath: string | null; status: KycStatus; rejectionReason: string | null; createdAt: Date; updatedAt: Date; reviewedAt: Date | null }) {
  return {
    id: request.id,
    name: request.name,
    documentType: request.documentType,
    documentNumber: request.documentNumber,
    documentImagePath: request.documentImagePath,
    status: request.status,
    rejectionReason: request.rejectionReason,
    createdAt: request.createdAt.toISOString(),
    updatedAt: request.updatedAt.toISOString(),
    reviewedAt: request.reviewedAt?.toISOString() ?? null,
  };
}

function serializeTicket(ticket: { id: string; subject: string; message: string; status: SupportTicketStatus; adminReply: string | null; createdAt: Date; updatedAt: Date; repliedAt: Date | null }) {
  return {
    id: ticket.id,
    subject: ticket.subject,
    message: ticket.message,
    status: ticket.status,
    adminReply: ticket.adminReply,
    createdAt: ticket.createdAt.toISOString(),
    updatedAt: ticket.updatedAt.toISOString(),
    repliedAt: ticket.repliedAt?.toISOString() ?? null,
  };
}

function formatDate(value: Date) {
  return value.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}
