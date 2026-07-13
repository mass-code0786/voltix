-- Existing values were written by Node/Prisma as UTC wall-clock values. The
-- explicit USING clause preserves those instants while removing session-timezone
-- dependence from comparisons with CURRENT_TIMESTAMP.
ALTER TABLE "CopyTrade"
  ALTER COLUMN "startedAt" TYPE TIMESTAMP(3) WITH TIME ZONE USING "startedAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "windowStartAt" TYPE TIMESTAMP(3) WITH TIME ZONE USING "windowStartAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "windowCloseAt" TYPE TIMESTAMP(3) WITH TIME ZONE USING "windowCloseAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "completesAt" TYPE TIMESTAMP(3) WITH TIME ZONE USING "completesAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "creditDueAt" TYPE TIMESTAMP(3) WITH TIME ZONE USING "creditDueAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "completedAt" TYPE TIMESTAMP(3) WITH TIME ZONE USING "completedAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "incomeCreditedAt" TYPE TIMESTAMP(3) WITH TIME ZONE USING "incomeCreditedAt" AT TIME ZONE 'UTC';

ALTER TABLE "TradeWindowSettlement"
  ALTER COLUMN "windowStartAt" TYPE TIMESTAMP(3) WITH TIME ZONE USING "windowStartAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "windowCloseAt" TYPE TIMESTAMP(3) WITH TIME ZONE USING "windowCloseAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "settlementDueAt" TYPE TIMESTAMP(3) WITH TIME ZONE USING "settlementDueAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "processingStartedAt" TYPE TIMESTAMP(3) WITH TIME ZONE USING "processingStartedAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "completedAt" TYPE TIMESTAMP(3) WITH TIME ZONE USING "completedAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "leaseExpiresAt" TYPE TIMESTAMP(3) WITH TIME ZONE USING "leaseExpiresAt" AT TIME ZONE 'UTC';

ALTER TABLE "ManualTradeSignal"
  ALTER COLUMN "windowStartAt" TYPE TIMESTAMP(3) WITH TIME ZONE USING "windowStartAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "windowCloseAt" TYPE TIMESTAMP(3) WITH TIME ZONE USING "windowCloseAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "settlementDueAt" TYPE TIMESTAMP(3) WITH TIME ZONE USING "settlementDueAt" AT TIME ZONE 'UTC';
