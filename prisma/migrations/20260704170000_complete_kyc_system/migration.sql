ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'KYC_STATUS';

ALTER TABLE "KycRequest" RENAME COLUMN "name" TO "fullName";
ALTER TABLE "KycRequest" RENAME COLUMN "documentType" TO "governmentIdType";
ALTER TABLE "KycRequest" RENAME COLUMN "documentNumber" TO "governmentIdNumber";
ALTER TABLE "KycRequest" RENAME COLUMN "documentImagePath" TO "frontIdImageUrl";
ALTER TABLE "KycRequest" RENAME COLUMN "createdAt" TO "submittedAt";

DROP INDEX IF EXISTS "KycRequest_userId_createdAt_idx";
DROP INDEX IF EXISTS "KycRequest_status_createdAt_idx";

ALTER TABLE "KycRequest"
  ADD COLUMN "dateOfBirth" TIMESTAMP(3),
  ADD COLUMN "country" TEXT,
  ADD COLUMN "address" TEXT,
  ADD COLUMN "backIdImageUrl" TEXT,
  ADD COLUMN "selfieImageUrl" TEXT;

CREATE INDEX "KycRequest_userId_submittedAt_idx" ON "KycRequest"("userId", "submittedAt");
CREATE INDEX "KycRequest_status_submittedAt_idx" ON "KycRequest"("status", "submittedAt");

ALTER TABLE "KycRequest" ADD CONSTRAINT "KycRequest_reviewedById_fkey"
FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
