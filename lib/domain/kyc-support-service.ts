import { KycStatus, SupportTicketStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createNotification } from "./notification-service";

type KycInput = {
  userId: string;
  fullName: string;
  dateOfBirth?: Date | null;
  country: string;
  address?: string | null;
  governmentIdType: string;
  governmentIdNumber: string;
  frontIdImageUrl: string;
  backIdImageUrl?: string | null;
  selfieImageUrl: string;
};

type TicketInput = {
  userId: string;
  subject: string;
  message: string;
  attachmentUrl?: string | null;
  attachmentName?: string | null;
  attachmentType?: string | null;
  attachmentSize?: number | null;
};

export async function getUserKyc(userId: string) {
  const request = await prisma.kycRequest.findFirst({ where: { userId }, orderBy: { submittedAt: "desc" }, include: { reviewedBy: { select: { name: true, uid: true } } } });
  return {
    status: request?.status ?? "NOT_SUBMITTED",
    request: request ? serializeKyc(request) : null,
  };
}

export async function submitUserKyc(input: KycInput) {
  const activeRequest = await prisma.kycRequest.findFirst({
    where: { userId: input.userId, status: { in: ["PENDING", "UNDER_REVIEW", "APPROVED"] } },
    orderBy: { submittedAt: "desc" },
    select: { status: true },
  });
  if (activeRequest?.status === "PENDING" || activeRequest?.status === "UNDER_REVIEW") throw new Error("KYC request is already under review");
  if (activeRequest?.status === "APPROVED") throw new Error("KYC is already approved");

  const request = await prisma.kycRequest.create({
    data: {
      userId: input.userId,
      fullName: input.fullName,
      dateOfBirth: input.dateOfBirth ?? null,
      country: input.country,
      address: input.address ?? null,
      governmentIdType: input.governmentIdType,
      governmentIdNumber: input.governmentIdNumber,
      frontIdImageUrl: input.frontIdImageUrl,
      backIdImageUrl: input.backIdImageUrl ?? null,
      selfieImageUrl: input.selfieImageUrl,
      status: "UNDER_REVIEW",
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
      request.country ?? "",
      request.dateOfBirth?.toISOString().slice(0, 10) ?? "",
      request.frontIdImageUrl ?? "",
      request.backIdImageUrl ?? "",
      request.selfieImageUrl ?? "",
      request.rejectionReason ?? "",
    ]),
  };
}

export async function reviewKyc(input: { id: string; adminUserId: string; status: Extract<KycStatus, "APPROVED" | "REJECTED">; reason?: string }) {
  const request = await prisma.$transaction(async tx => {
    const current = await tx.kycRequest.findUnique({ where: { id: input.id }, select: { status: true } });
    if (!current) throw new Error("KYC request not found");
    if (current.status !== "PENDING" && current.status !== "UNDER_REVIEW") throw new Error("KYC request has already been reviewed");
    const reviewed = await tx.kycRequest.update({
      where: { id: input.id },
      data: {
        status: input.status,
        reviewedById: input.adminUserId,
        reviewedAt: new Date(),
        rejectionReason: input.status === "REJECTED" ? input.reason ?? "Rejected by admin" : null,
      },
      include: { reviewedBy: { select: { name: true, uid: true } } },
    });
    await tx.auditLog.create({
      data: { actorId: input.adminUserId, actorType: "ADMIN", action: `KYC_${input.status}`, entityType: "KycRequest", entityId: reviewed.id, metadata: { userId: reviewed.userId, reason: reviewed.rejectionReason } },
    });
    await createNotification(tx, {
      userId: reviewed.userId,
      type: "KYC_STATUS",
      title: input.status === "APPROVED" ? "KYC Approved" : "KYC Rejected",
      message: input.status === "APPROVED" ? "Congratulations! Your KYC has been approved. Your account is now verified." : `Your KYC has been rejected.${reviewed.rejectionReason ? ` Reason: ${reviewed.rejectionReason}` : ""}`,
      metadata: { kycRequestId: reviewed.id, status: reviewed.status, href: "/kyc", rejectionReason: reviewed.rejectionReason },
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
    data: {
      userId: input.userId,
      subject: input.subject,
      message: input.message,
      attachmentUrl: input.attachmentUrl ?? null,
      attachmentName: input.attachmentName ?? null,
      attachmentType: input.attachmentType ?? null,
      attachmentSize: input.attachmentSize ?? null,
      status: "OPEN",
    },
  });
  await prisma.auditLog.create({
    data: { actorId: input.userId, actorType: "USER", action: "SUPPORT_TICKET_CREATED", entityType: "SupportTicket", entityId: ticket.id, metadata: { status: ticket.status, attachmentUrl: ticket.attachmentUrl } },
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
      ticket.attachmentUrl ?? "",
      ticket.attachmentName ?? "",
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

function serializeKyc(request: { id: string; fullName: string; dateOfBirth: Date | null; country: string | null; address: string | null; governmentIdType: string; governmentIdNumber: string; frontIdImageUrl: string | null; backIdImageUrl: string | null; selfieImageUrl: string | null; status: KycStatus; rejectionReason: string | null; submittedAt: Date; updatedAt: Date; reviewedAt: Date | null; reviewedById: string | null; reviewedBy?: { name: string; uid: string } | null }) {
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
    approvedAt: request.status === "APPROVED" ? request.reviewedAt?.toISOString() ?? null : null,
    approvedBy: request.status === "APPROVED" ? request.reviewedBy?.name ?? request.reviewedById : null,
    reviewedBy: request.reviewedBy?.name ?? request.reviewedById,
    reviewedByUid: request.reviewedBy?.uid ?? null,
  };
}

function serializeTicket(ticket: { id: string; subject: string; message: string; attachmentUrl: string | null; attachmentName: string | null; attachmentType: string | null; attachmentSize: number | null; status: SupportTicketStatus; adminReply: string | null; createdAt: Date; updatedAt: Date; repliedAt: Date | null }) {
  return {
    id: ticket.id,
    subject: ticket.subject,
    message: ticket.message,
    attachmentUrl: ticket.attachmentUrl,
    attachmentName: ticket.attachmentName,
    attachmentType: ticket.attachmentType,
    attachmentSize: ticket.attachmentSize,
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
