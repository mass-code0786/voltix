import { Prisma, TradeStatus, UserStatus, type User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getOrCreateTradeWindowSignal } from "./trade-window-signal";

export const NEW_DEPOSITOR_EXTRA_SOURCE = "NEW_DEPOSITOR_EXTRA";
export const NEW_DEPOSITOR_EXTRA_SLOT = "NEW_DEPOSITOR_EXTRA_TRADE";
export const NEW_DEPOSITOR_PROMOTION_DAYS = 10;
export const NEW_DEPOSITOR_EXTRA_OPEN_UTC_HOUR = 15;
export const NEW_DEPOSITOR_EXTRA_OPEN_UTC_MINUTE = 30;
export const NEW_DEPOSITOR_EXTRA_DURATION_MINUTES = 15;
export const NEW_DEPOSITOR_EXTRA_SETTLEMENT_MINUTES = 30;
export const NEW_DEPOSITOR_PROFIT_MIN_PERCENT = 0.32;
export const NEW_DEPOSITOR_PROFIT_MAX_PERCENT = 0.36;

const IST_OFFSET_MS = 330 * 60_000;
const DAY_MS = 86_400_000;
const OPEN_FROM_LOCAL_MIDNIGHT_MS = 21 * 60 * 60_000;
const CLOSE_FROM_LOCAL_MIDNIGHT_MS = OPEN_FROM_LOCAL_MIDNIGHT_MS + NEW_DEPOSITOR_EXTRA_DURATION_MINUTES * 60_000;
const STAKE_RATE = new Prisma.Decimal("0.01");
const MIN_STAKE = new Prisma.Decimal("1");
const AI_ACTIVE_PRINCIPAL = new Prisma.Decimal("100");
const PLACEMENT_BATCH_SIZE = 1_000;

type PlacedPromotionTrade = {
  id: string;
  userId: string;
  pair: string | null;
  principalAmount: Prisma.Decimal;
  returnPercent: Prisma.Decimal;
  promotionDay: number | null;
};

type PromotionTradeSnapshot = {
  id: string;
  userId: string;
  promotionDay: number | null;
  status: TradeStatus;
  windowStartAt: Date | null;
  incomeCreditedAt: Date | null;
};

type PromotionUser = Pick<User, "id" | "status" | "aiWalletBalance" | "aiTradePrincipal">;

export type NewDepositorPromotionStatus = {
  eligible: boolean;
  state: "DEPOSIT_TO_UNLOCK" | "UPCOMING" | "LIVE" | "TRADE_PLACED" | "COMPLETED" | "PROMOTION_COMPLETED" | "NOT_ELIGIBLE" | "INSUFFICIENT_BALANCE";
  promotionDay: number | null;
  totalPromotionDays: 10;
  extraTradesUsed: number;
  extraTradesRemaining: number;
  nextExtraTradeAt: string | null;
  promotionStartsAt: string | null;
  promotionEndsAt: string | null;
  windowStartAt: string | null;
  windowCloseAt: string | null;
  settlementDueAt: string | null;
  secondsUntilOpen: number;
  secondsUntilClose: number;
  tradeId: string | null;
  tradeStatus: "UPCOMING" | "LIVE" | "CLOSED";
  reason: string | null;
};

export async function runNewDepositorExtraTradeScheduler(now = new Date()) {
  const occurrence = promotionalOccurrenceForInstant(now);
  const slot = await ensureNewDepositorExtraSlot();
  if (!occurrence.live) return { live: false, slotId: slot.id, occurrenceKey: occurrence.occurrenceKey, usersPlaced: 0, batches: 0 };

  const signal = await getOrCreateTradeWindowSignal({
    slotId: slot.id,
    windowLabel: NEW_DEPOSITOR_EXTRA_SLOT,
    windowStartAt: occurrence.windowStartAt,
    windowCloseAt: occurrence.windowCloseAt,
    settlementDueAt: occurrence.settlementDueAt,
  });
  const pair = normalizePair(signal.recommendedPair);
  let usersPlaced = 0;
  let batches = 0;

  while (true) {
    const placed = await placePromotionBatch({
      slotId: slot.id,
      pair,
      occurrenceDate: businessDateKey(occurrence.businessDay),
      ...occurrence,
    });
    if (!placed.length) break;
    usersPlaced += placed.length;
    batches += 1;
    await createPlacementNotifications(placed, occurrence.settlementDueAt).catch(error => {
      console.error("[NEW_DEPOSITOR_EXTRA_NOTIFICATION_FAILURE]", error instanceof Error ? error.message : error);
    });
    if (placed.length < PLACEMENT_BATCH_SIZE) break;
  }

  await syncMissingPlacementNotifications(occurrence.windowStartAt).catch(error => {
    console.error("[NEW_DEPOSITOR_EXTRA_NOTIFICATION_RETRY_FAILURE]", error instanceof Error ? error.message : error);
  });

  return { live: true, occurrenceKey: occurrence.occurrenceKey, pair, usersPlaced, batches };
}

export async function getNewDepositorPromotionStatus(userId: string, now = new Date()) {
  const [user, firstDeposit, trades] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, status: true, aiWalletBalance: true, aiTradePrincipal: true },
    }),
    firstCreditedDepositForUser(userId),
    prisma.copyTrade.findMany({
      where: { userId, source: NEW_DEPOSITOR_EXTRA_SOURCE },
      select: { id: true, userId: true, promotionDay: true, status: true, windowStartAt: true, incomeCreditedAt: true },
      orderBy: { promotionDay: "asc" },
    }),
  ]);
  return buildPromotionStatus(user, firstDeposit?.creditedAt ?? null, trades, now);
}

export async function getNewDepositorPromotionStatuses(userIds: string[], now = new Date()) {
  if (!userIds.length) return new Map<string, NewDepositorPromotionStatus>();
  const [users, deposits, trades] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, status: true, aiWalletBalance: true, aiTradePrincipal: true },
    }),
    prisma.deposit.groupBy({
      by: ["userId"],
      where: { userId: { in: userIds }, creditedAt: { not: null }, status: { in: ["CREDITED", "APPROVED"] } },
      _min: { creditedAt: true },
    }),
    prisma.copyTrade.findMany({
      where: { userId: { in: userIds }, source: NEW_DEPOSITOR_EXTRA_SOURCE },
      select: { id: true, userId: true, promotionDay: true, status: true, windowStartAt: true, incomeCreditedAt: true },
      orderBy: { promotionDay: "asc" },
    }),
  ]);
  const depositByUser = new Map(deposits.map(row => [row.userId, row._min.creditedAt]));
  const tradesByUser = new Map<string, PromotionTradeSnapshot[]>();
  for (const trade of trades) tradesByUser.set(trade.userId, [...(tradesByUser.get(trade.userId) ?? []), trade]);
  return new Map(users.map(user => [user.id, buildPromotionStatus(user, depositByUser.get(user.id) ?? null, tradesByUser.get(user.id) ?? [], now)]));
}

export function firstPromotionOccurrence(firstDepositAt: Date) {
  const depositBusinessDay = businessDayIndex(firstDepositAt);
  const sameDay = occurrenceForBusinessDay(depositBusinessDay);
  return firstDepositAt.getTime() < sameDay.windowCloseAt.getTime() ? sameDay : occurrenceForBusinessDay(depositBusinessDay + 1);
}

export function promotionDayForOccurrence(firstDepositAt: Date, occurrenceStartAt: Date) {
  const first = firstPromotionOccurrence(firstDepositAt);
  return businessDayIndex(occurrenceStartAt) - first.businessDay + 1;
}

export function isNewDepositorProfitPercent(value: number) {
  return Number.isFinite(value) && value >= NEW_DEPOSITOR_PROFIT_MIN_PERCENT && value <= NEW_DEPOSITOR_PROFIT_MAX_PERCENT;
}

export function calculateNewDepositorProfit(amount: number, profitPercent: number) {
  if (amount <= 0) throw new Error("Promotional trade amount must be positive.");
  if (!isNewDepositorProfitPercent(profitPercent)) throw new Error("Promotional profit percentage is outside the approved range.");
  return Number(((amount * profitPercent) / 100).toFixed(8));
}

export function promotionalOccurrenceForInstant(now: Date) {
  return occurrenceForBusinessDay(businessDayIndex(now), now);
}

export function occurrenceForBusinessDay(businessDay: number, now = new Date(0)) {
  const windowStartAt = new Date(businessDay * DAY_MS - IST_OFFSET_MS + OPEN_FROM_LOCAL_MIDNIGHT_MS);
  const windowCloseAt = new Date(windowStartAt.getTime() + NEW_DEPOSITOR_EXTRA_DURATION_MINUTES * 60_000);
  const settlementDueAt = new Date(windowStartAt.getTime() + NEW_DEPOSITOR_EXTRA_SETTLEMENT_MINUTES * 60_000);
  return {
    businessDay,
    occurrenceKey: `${NEW_DEPOSITOR_EXTRA_SLOT}:${windowStartAt.toISOString()}`,
    windowStartAt,
    windowCloseAt,
    settlementDueAt,
    live: now >= windowStartAt && now < windowCloseAt,
  };
}

function buildPromotionStatus(user: PromotionUser, firstDepositAt: Date | null, trades: PromotionTradeSnapshot[], now: Date): NewDepositorPromotionStatus {
  const used = new Set(trades.map(trade => trade.promotionDay).filter((day): day is number => day !== null)).size;
  const base = {
    totalPromotionDays: NEW_DEPOSITOR_PROMOTION_DAYS as 10,
    extraTradesUsed: used,
    extraTradesRemaining: Math.max(0, NEW_DEPOSITOR_PROMOTION_DAYS - used),
  };
  if (!firstDepositAt) return emptyStatus(base, "DEPOSIT_TO_UNLOCK", "Complete your first successful deposit to unlock the promotion.");

  const first = firstPromotionOccurrence(firstDepositAt);
  const last = occurrenceForBusinessDay(first.businessDay + NEW_DEPOSITOR_PROMOTION_DAYS - 1);
  const currentBusinessDay = businessDayIndex(now);
  const currentOccurrence = occurrenceForBusinessDay(currentBusinessDay);
  const elapsedOpportunities = Math.max(0, Math.min(NEW_DEPOSITOR_PROMOTION_DAYS,
    currentBusinessDay - first.businessDay + (now >= currentOccurrence.windowCloseAt ? 1 : 0)));
  base.extraTradesRemaining = Math.max(0, NEW_DEPOSITOR_PROMOTION_DAYS - Math.max(used, elapsedOpportunities));
  const startsAt = first.windowStartAt.toISOString();
  const endsAt = last.settlementDueAt.toISOString();
  if (now >= last.settlementDueAt) {
    return { ...emptyStatus({ ...base, extraTradesRemaining: 0 }, "PROMOTION_COMPLETED", null), promotionStartsAt: startsAt, promotionEndsAt: endsAt };
  }
  if (user.status !== UserStatus.ACTIVE) {
    return { ...emptyStatus(base, "NOT_ELIGIBLE", "User account is not active."), promotionStartsAt: startsAt, promotionEndsAt: endsAt };
  }

  const today = occurrenceForBusinessDay(businessDayIndex(now), now);
  const todayDay = today.businessDay - first.businessDay + 1;
  const todayTrade = trades.find(trade => trade.promotionDay === todayDay);
  if (todayTrade && todayDay >= 1 && todayDay <= NEW_DEPOSITOR_PROMOTION_DAYS) {
    const state = todayTrade.incomeCreditedAt ? "COMPLETED" : "TRADE_PLACED";
    const next = todayDay < NEW_DEPOSITOR_PROMOTION_DAYS ? occurrenceForBusinessDay(today.businessDay + 1).windowStartAt : null;
    return statusForOccurrence({ base, first, last, occurrence: today, promotionDay: todayDay, now, state, trade: todayTrade, nextExtraTradeAt: next });
  }

  let candidateDay = today.businessDay;
  if (now >= today.windowCloseAt) candidateDay += 1;
  if (candidateDay < first.businessDay) candidateDay = first.businessDay;
  if (candidateDay > last.businessDay) {
    return { ...emptyStatus({ ...base, extraTradesRemaining: 0 }, "PROMOTION_COMPLETED", null), promotionStartsAt: startsAt, promotionEndsAt: endsAt };
  }
  const occurrence = occurrenceForBusinessDay(candidateDay, now);
  const promotionDay = candidateDay - first.businessDay + 1;
  const sufficient = user.aiTradePrincipal.gte(AI_ACTIVE_PRINCIPAL) && user.aiWalletBalance.mul(STAKE_RATE).gte(MIN_STAKE);
  const state = sufficient ? occurrence.live ? "LIVE" : "UPCOMING" : "INSUFFICIENT_BALANCE";
  return statusForOccurrence({ base, first, last, occurrence, promotionDay, now, state, trade: null, nextExtraTradeAt: occurrence.windowStartAt });
}

function statusForOccurrence(input: {
  base: { totalPromotionDays: 10; extraTradesUsed: number; extraTradesRemaining: number };
  first: ReturnType<typeof occurrenceForBusinessDay>;
  last: ReturnType<typeof occurrenceForBusinessDay>;
  occurrence: ReturnType<typeof occurrenceForBusinessDay>;
  promotionDay: number;
  now: Date;
  state: NewDepositorPromotionStatus["state"];
  trade: PromotionTradeSnapshot | null;
  nextExtraTradeAt: Date | null;
}): NewDepositorPromotionStatus {
  const live = input.occurrence.live;
  return {
    ...input.base,
    eligible: input.state === "UPCOMING" || input.state === "LIVE" || input.state === "TRADE_PLACED" || input.state === "COMPLETED",
    state: input.state,
    promotionDay: input.promotionDay,
    nextExtraTradeAt: input.nextExtraTradeAt?.toISOString() ?? null,
    promotionStartsAt: input.first.windowStartAt.toISOString(),
    promotionEndsAt: input.last.settlementDueAt.toISOString(),
    windowStartAt: input.occurrence.windowStartAt.toISOString(),
    windowCloseAt: input.occurrence.windowCloseAt.toISOString(),
    settlementDueAt: input.occurrence.settlementDueAt.toISOString(),
    secondsUntilOpen: Math.max(0, Math.ceil((input.occurrence.windowStartAt.getTime() - input.now.getTime()) / 1_000)),
    secondsUntilClose: Math.max(0, Math.ceil((input.occurrence.windowCloseAt.getTime() - input.now.getTime()) / 1_000)),
    tradeId: input.trade?.id ?? null,
    tradeStatus: live ? "LIVE" : input.now < input.occurrence.windowStartAt ? "UPCOMING" : "CLOSED",
    reason: input.state === "INSUFFICIENT_BALANCE" ? "Sufficient active AI Wallet balance is required." : null,
  };
}

function emptyStatus(base: { totalPromotionDays: 10; extraTradesUsed: number; extraTradesRemaining: number }, state: NewDepositorPromotionStatus["state"], reason: string | null): NewDepositorPromotionStatus {
  return {
    ...base,
    eligible: false,
    state,
    promotionDay: null,
    nextExtraTradeAt: null,
    promotionStartsAt: null,
    promotionEndsAt: null,
    windowStartAt: null,
    windowCloseAt: null,
    settlementDueAt: null,
    secondsUntilOpen: 0,
    secondsUntilClose: 0,
    tradeId: null,
    tradeStatus: "CLOSED",
    reason,
  };
}

async function placePromotionBatch(input: {
  slotId: string;
  pair: string;
  occurrenceDate: string;
  occurrenceKey: string;
  businessDay: number;
  windowStartAt: Date;
  windowCloseAt: Date;
  settlementDueAt: Date;
  live: boolean;
}) {
  return prisma.$transaction(async tx => tx.$queryRaw<PlacedPromotionTrade[]>(Prisma.sql`
    WITH first_deposit AS MATERIALIZED (
      SELECT d."userId", MIN(d."creditedAt") AS "firstDepositAt"
      FROM "Deposit" d
      WHERE d."creditedAt" IS NOT NULL
        AND d.status IN ('CREDITED'::"DepositStatus", 'APPROVED'::"DepositStatus")
      GROUP BY d."userId"
    ), candidates AS MATERIALIZED (
      SELECT
        u.id AS "userId",
        (u."bitexBalance" * 0.01)::decimal(36,18) AS amount,
        (
          (${input.occurrenceDate})::date -
          (
            (f."firstDepositAt" AT TIME ZONE 'Asia/Kolkata')::date +
            CASE WHEN (f."firstDepositAt" AT TIME ZONE 'Asia/Kolkata')::time < TIME '21:15:00' THEN 0 ELSE 1 END
          )
        )::integer + 1 AS "promotionDay"
      FROM "User" u
      JOIN first_deposit f ON f."userId" = u.id
      WHERE u.status = 'ACTIVE'::"UserStatus"
        AND u."bitexPrincipal" >= 100
        AND (u."bitexBalance" * 0.01) >= 1
        AND NOT EXISTS (
          SELECT 1 FROM "CopyTrade" t
          WHERE t."userId" = u.id
            AND t.source = ${NEW_DEPOSITOR_EXTRA_SOURCE}
            AND t."promotionDay" = (
              ((${input.occurrenceDate})::date -
                ((f."firstDepositAt" AT TIME ZONE 'Asia/Kolkata')::date +
                 CASE WHEN (f."firstDepositAt" AT TIME ZONE 'Asia/Kolkata')::time < TIME '21:15:00' THEN 0 ELSE 1 END)
              )::integer + 1
            )
        )
        AND (
          ((${input.occurrenceDate})::date -
            ((f."firstDepositAt" AT TIME ZONE 'Asia/Kolkata')::date +
             CASE WHEN (f."firstDepositAt" AT TIME ZONE 'Asia/Kolkata')::time < TIME '21:15:00' THEN 0 ELSE 1 END)
          )::integer + 1
        ) BETWEEN 1 AND ${NEW_DEPOSITOR_PROMOTION_DAYS}
      ORDER BY u.id
      LIMIT ${PLACEMENT_BATCH_SIZE}
      FOR UPDATE OF u SKIP LOCKED
    ), inserted AS (
      INSERT INTO "CopyTrade" (
        id, "userId", "slotId", source, pair, "promotionDay", "idempotencyKey",
        "principalAmount", "returnPercent", status, "startedAt", "windowStartAt",
        "windowCloseAt", "completesAt", "creditDueAt", "createdAt", "updatedAt"
      )
      SELECT
        gen_random_uuid()::text, c."userId", ${input.slotId}, ${NEW_DEPOSITOR_EXTRA_SOURCE}, ${input.pair}, c."promotionDay",
        'new-depositor-extra:' || c."userId" || ':' || c."promotionDay"::text,
        c.amount,
        (0.32 + floor(random() * 5) / 100)::decimal(10,6),
        'PENDING'::"TradeStatus", CURRENT_TIMESTAMP, ${input.windowStartAt},
        ${input.windowCloseAt}, ${input.windowCloseAt}, ${input.settlementDueAt}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      FROM candidates c
      ON CONFLICT DO NOTHING
      RETURNING id, "userId", pair, "principalAmount", "returnPercent", "promotionDay"
    ), debited AS (
      UPDATE "User" u
      SET "bitexBalance" = u."bitexBalance" - i."principalAmount", "updatedAt" = CURRENT_TIMESTAMP
      FROM inserted i
      WHERE u.id = i."userId" AND u."bitexBalance" >= i."principalAmount"
      RETURNING u.id
    )
    SELECT i.* FROM inserted i JOIN debited d ON d.id = i."userId"
  `), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 60_000 });
}

async function createPlacementNotifications(trades: PlacedPromotionTrade[], settlementDueAt: Date) {
  if (!trades.length) return;
  await prisma.notification.createMany({
    data: trades.map(trade => ({
      userId: trade.userId,
      type: "NEW_DEPOSITOR_EXTRA_TRADE",
      title: "Extra Trade Placed",
      message: "Your new depositor promotional trade has been placed successfully.",
      settlementKey: `placement:${trade.id}`,
      metadata: {
        tradeId: trade.id,
        pair: displayPair(trade.pair),
        tradeAmount: trade.principalAmount.toString(),
        promotionDay: trade.promotionDay,
        totalPromotionDays: NEW_DEPOSITOR_PROMOTION_DAYS,
        profitPercent: trade.returnPercent.toString(),
        settlementDueAt: settlementDueAt.toISOString(),
      },
    })),
    skipDuplicates: true,
  });
}

async function syncMissingPlacementNotifications(windowStartAt: Date) {
  return prisma.$executeRaw(Prisma.sql`
    INSERT INTO "Notification" (id, "userId", type, title, message, metadata, "settlementKey", "createdAt")
    SELECT
      gen_random_uuid()::text,
      t."userId",
      'NEW_DEPOSITOR_EXTRA_TRADE'::"NotificationType",
      'Extra Trade Placed',
      'Your new depositor promotional trade has been placed successfully.',
      jsonb_build_object(
        'tradeId', t.id,
        'pair', CASE WHEN t.pair IS NULL THEN NULL ELSE regexp_replace(t.pair, 'USDT$', '/USDT') END,
        'tradeAmount', t."principalAmount"::text,
        'promotionDay', t."promotionDay",
        'totalPromotionDays', ${NEW_DEPOSITOR_PROMOTION_DAYS},
        'profitPercent', t."returnPercent"::text,
        'settlementDueAt', t."creditDueAt"
      ),
      'placement:' || t.id,
      CURRENT_TIMESTAMP
    FROM "CopyTrade" t
    WHERE t.source = ${NEW_DEPOSITOR_EXTRA_SOURCE}
      AND t."windowStartAt" = ${windowStartAt}
      AND NOT EXISTS (SELECT 1 FROM "Notification" n WHERE n."settlementKey" = 'placement:' || t.id)
    ON CONFLICT ("settlementKey") DO NOTHING
  `);
}

async function ensureNewDepositorExtraSlot() {
  const existing = await prisma.tradeSlot.findFirst({ where: { label: NEW_DEPOSITOR_EXTRA_SLOT } });
  if (existing) {
    if (existing.utcTime !== "15:30" || existing.durationMinutes !== NEW_DEPOSITOR_EXTRA_DURATION_MINUTES || existing.creditDelayMins !== 15 || !existing.enabled) {
      return prisma.tradeSlot.update({
        where: { id: existing.id },
        data: { utcTime: "15:30", durationMinutes: NEW_DEPOSITOR_EXTRA_DURATION_MINUTES, creditDelayMins: 15, enabled: true },
      });
    }
    return existing;
  }
  try {
    return await prisma.tradeSlot.create({
      data: { label: NEW_DEPOSITOR_EXTRA_SLOT, utcTime: "15:30", durationMinutes: NEW_DEPOSITOR_EXTRA_DURATION_MINUTES, creditDelayMins: 15, enabled: true },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return prisma.tradeSlot.findFirstOrThrow({ where: { label: NEW_DEPOSITOR_EXTRA_SLOT } });
    }
    throw error;
  }
}

async function firstCreditedDepositForUser(userId: string) {
  return prisma.deposit.findFirst({
    where: { userId, creditedAt: { not: null }, status: { in: ["CREDITED", "APPROVED"] } },
    select: { creditedAt: true },
    orderBy: [{ creditedAt: "asc" }, { id: "asc" }],
  });
}

function businessDayIndex(value: Date) {
  return Math.floor((value.getTime() + IST_OFFSET_MS) / DAY_MS);
}

function businessDateKey(businessDay: number) {
  return new Date(businessDay * DAY_MS).toISOString().slice(0, 10);
}

function normalizePair(value: string) {
  const normalized = value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!normalized.endsWith("USDT")) throw new Error("Promotional trade signal must be a USDT pair.");
  return normalized;
}

function displayPair(value: string | null) {
  if (!value) return "Pair unavailable";
  const normalized = normalizePair(value);
  return `${normalized.slice(0, -4)}/USDT`;
}
