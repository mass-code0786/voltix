import { KycStatus, SupportTicketStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createNotification } from "./notification-service";

type KycInput = {
  userId: string;
  fullName: string;
  dateOfBirth: Date;
  country: string;
  address: string;
  governmentIdType: string;
  governmentIdNumber: string;
  frontIdImageUrl: string;
  backIdImageUrl: string;
  selfieImageUrl: string;
};

type TicketInput = {
  userId: string;
  subject: string;
  message: string;
};

export async function getUserKyc(userId: string) {
  const request = await prisma.kycRequest.findFirst({ where: { userId }, orderBy: { submittedAt: "desc" } });
  return {
    status: request?.status ?? "NOT_SUBMITTED",
    request: request ? serializeKyc(request) : null,
  };
}

export async function submitUserKyc(input: KycInput) {
  const activeRequest = await prisma.kycRequest.findFirst({
    where: { userId: input.userId, status: { in: ["PENDING", "APPROVED"] } },
    orderBy: { submittedAt: "desc" },
    select: { status: true },
  });
  if (activeRequest?.status === "PENDING") throw new Error("KYC request is already pending");
  if (activeRequest?.status === "APPROVED") throw new Error("KYC is already approved");

  const request = await prisma.kycRequest.create({
    data: {
      userId: input.userId,
      fullName: input.fullName,
      dateOfBirth: input.dateOfBirth,
      country: input.country,
      address: input.address,
      governmentIdType: input.governmentIdType,
      governmentIdNumber: input.governmentIdNumber,
      frontIdImageUrl: input.frontIdImageUrl,
      backIdImageUrl: input.backIdImageUrl,
      selfieImageUrl: input.selfieImageUrl,
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
    orderBy: { submittedAt: "desc" },
    take: 100,
    include: { user: { select: { name: true, uid: true } } },
  });
  return {
    rows: requests.map(request => [
      request.fullName || request.user.name,
      request.user.uid,
      request.governmentIdType,
      request.governmentIdNumber,
      formatDate(request.submittedAt),
      request.status,
      request.id,
    ]),
  };
}

export async function reviewKyc(input: { id: string; adminUserId: string; status: Extract<KycStatus, "APPROVED" | "REJECTED">; reason?: string }) {
  const request = await prisma.$transaction(async tx => {
    const reviewed = await tx.kycRequest.update({
      where: { id: input.id },
      data: {
        status: input.status,
        reviewedById: input.adminUserId,
        reviewedAt: new Date(),
        rejectionReason: input.status === "REJECTED" ? input.reason ?? "Rejected by admin" : null,
      },
    });
    await tx.auditLog.create({
      data: { actorId: input.adminUserId, actorType: "ADMIN", action: `KYC_${input.status}`, entityType: "KycRequest", entityId: reviewed.id, metadata: { userId: reviewed.userId, reason: reviewed.rejectionReason } },
    });
    await createNotification(tx, {
      userId: reviewed.userId,
      type: "KYC_STATUS",
      title: input.status === "APPROVED" ? "KYC approved" : "KYC rejected",
      message: input.status === "APPROVED" ? "Your identity verification has been approved." : `Your identity verification was rejected. ${reviewed.rejectionReason ?? ""}`.trim(),
      metadata: { kycRequestId: reviewed.id, status: reviewed.status },
    });
    return reviewed;
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

function serializeKyc(request: { id: string; fullName: string; dateOfBirth: Date | null; country: string | null; address: string | null; governmentIdType: string; governmentIdNumber: string; frontIdImageUrl: string | null; backIdImageUrl: string | null; selfieImageUrl: string | null; status: KycStatus; rejectionReason: string | null; submittedAt: Date; updatedAt: Date; reviewedAt: Date | null; reviewedById: string | null }) {
  return {
    id: request.id,
    fullName: request.fullName,
    name: request.fullName,
    dateOfBirth: request.dateOfBirth?.toISOString().slice(0, 10) ?? null,
    country: request.country,
    address: request.address,
    governmentIdType: request.governmentIdType,
    governmentIdNumber: request.governmentIdNumber,
    frontIdImageUrl: request.frontIdImageUrl,
    backIdImageUrl: request.backIdImageUrl,
    selfieImageUrl: request.selfieImageUrl,
    documentType: request.governmentIdType,
    documentNumber: request.governmentIdNumber,
    documentImagePath: request.frontIdImageUrl,
    status: request.status,
    rejectionReason: request.rejectionReason,
    submittedAt: request.submittedAt.toISOString(),
    createdAt: request.submittedAt.toISOString(),
    updatedAt: request.updatedAt.toISOString(),
    reviewedAt: request.reviewedAt?.toISOString() ?? null,
    reviewedBy: request.reviewedById,
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
