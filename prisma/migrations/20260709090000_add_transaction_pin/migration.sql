ALTER TABLE "User"
ADD COLUMN "transactionPinHash" TEXT,
ADD COLUMN "transactionPinSetAt" TIMESTAMP(3);
