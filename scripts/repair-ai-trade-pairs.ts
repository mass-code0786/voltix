import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";

async function main() {
  const rows = await prisma.$queryRaw<Array<{ id: string; storedPair: string; signalId: string; occurrenceKey: string }>>(Prisma.sql`
    UPDATE "CopyTrade" t
    SET pair = s."recommendedPair",
        "signalId" = s.id,
        "occurrenceKey" = s."occurrenceKey",
        "updatedAt" = CURRENT_TIMESTAMP
    FROM "ManualTradeSignal" s
    WHERE t.source IN ('AI_SUBSCRIPTION', 'AI_SUBSCRIPTION_AUTO')
      AND t."slotId" = s."slotId"
      AND t."windowStartAt" = s."windowStartAt"
      AND t."windowCloseAt" = s."windowCloseAt"
      AND NULLIF(BTRIM(s."recommendedPair"), '') IS NOT NULL
      AND (t.pair IS DISTINCT FROM s."recommendedPair"
        OR t."signalId" IS DISTINCT FROM s.id
        OR t."occurrenceKey" IS DISTINCT FROM s."occurrenceKey")
    RETURNING t.id, t.pair AS "storedPair", s.id AS "signalId", s."occurrenceKey"
  `);
  for (const row of rows) console.info("AI trade pair repaired from exact persisted occurrence", row);
  console.info("AI trade pair repair complete", { repaired: rows.length });
}

main().finally(() => prisma.$disconnect());
