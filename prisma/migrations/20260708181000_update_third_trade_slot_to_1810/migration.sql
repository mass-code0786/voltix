UPDATE "TradeSlot"
SET "utcTime" = '18:10',
    "durationMinutes" = 30,
    "enabled" = true
WHERE "label" = 'Window 3'
  AND "utcTime" = '17:10';
