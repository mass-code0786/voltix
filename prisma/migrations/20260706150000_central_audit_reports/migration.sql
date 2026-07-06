CREATE TYPE "AuditRole" AS ENUM ('USER', 'ADMIN', 'SYSTEM');
CREATE TYPE "AuditStatus" AS ENUM ('SUCCESS', 'FAILED', 'WARNING');

ALTER TABLE "AuditLog"
  ADD COLUMN "userId" TEXT,
  ADD COLUMN "adminId" TEXT,
  ADD COLUMN "role" "AuditRole" NOT NULL DEFAULT 'SYSTEM',
  ADD COLUMN "module" TEXT NOT NULL DEFAULT 'SYSTEM',
  ADD COLUMN "description" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "status" "AuditStatus" NOT NULL DEFAULT 'SUCCESS',
  ADD COLUMN "country" TEXT,
  ADD COLUMN "city" TEXT,
  ADD COLUMN "userAgent" TEXT,
  ADD COLUMN "device" TEXT,
  ADD COLUMN "browser" TEXT,
  ADD COLUMN "os" TEXT,
  ADD COLUMN "requestMethod" TEXT,
  ADD COLUMN "requestPath" TEXT,
  ADD COLUMN "requestId" TEXT,
  ADD COLUMN "oldValue" JSONB,
  ADD COLUMN "newValue" JSONB,
  ADD COLUMN "errorMessage" TEXT,
  ADD COLUMN "durationMs" INTEGER,
  ADD COLUMN "archivedAt" TIMESTAMP(3),
  ADD COLUMN "archivedById" TEXT;

ALTER TABLE "AuditLog"
  ALTER COLUMN "actorType" SET DEFAULT 'SYSTEM',
  ALTER COLUMN "entityType" SET DEFAULT 'AuditLog',
  ALTER COLUMN "entityId" SET DEFAULT '',
  ALTER COLUMN "metadata" DROP NOT NULL;

UPDATE "AuditLog"
SET
  "role" = CASE WHEN "actorType" IN ('USER', 'ADMIN', 'SYSTEM') THEN "actorType"::"AuditRole" ELSE 'SYSTEM'::"AuditRole" END,
  "module" = COALESCE(NULLIF("entityType", ''), 'SYSTEM'),
  "description" = COALESCE(NULLIF("action", ''), 'Audit event'),
  "adminId" = CASE WHEN "actorType" = 'ADMIN' THEN "actorId" ELSE NULL END,
  "userId" = CASE WHEN "actorType" = 'USER' THEN "actorId" ELSE NULL END;

CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");
CREATE INDEX "AuditLog_module_idx" ON "AuditLog"("module");
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");
CREATE INDEX "AuditLog_adminId_idx" ON "AuditLog"("adminId");
CREATE INDEX "AuditLog_status_idx" ON "AuditLog"("status");

ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
