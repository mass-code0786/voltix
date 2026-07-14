export const DEFAULT_ACCOUNT_TIMEZONE = "Asia/Kolkata";

export function validTimeZone(value: string | null | undefined) {
  if (!value) return DEFAULT_ACCOUNT_TIMEZONE;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
    return value;
  } catch {
    return DEFAULT_ACCOUNT_TIMEZONE;
  }
}

export function localDayUtcBounds(now = new Date(), timeZone = DEFAULT_ACCOUNT_TIMEZONE) {
  const zone = validTimeZone(timeZone);
  const local = dateParts(now, zone);
  const start = zonedMidnightUtc(local.year, local.month, local.day, zone);
  const nextDate = new Date(Date.UTC(local.year, local.month - 1, local.day + 1));
  const end = zonedMidnightUtc(nextDate.getUTCFullYear(), nextDate.getUTCMonth() + 1, nextDate.getUTCDate(), zone);
  return { start, end, timeZone: zone };
}

function zonedMidnightUtc(year: number, month: number, day: number, timeZone: string) {
  const target = Date.UTC(year, month - 1, day);
  let result = target;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const rendered = dateTimeParts(new Date(result), timeZone);
    const renderedUtc = Date.UTC(rendered.year, rendered.month - 1, rendered.day, rendered.hour, rendered.minute, rendered.second);
    result = target - (renderedUtc - result);
  }
  return new Date(result);
}

function dateParts(value: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(value);
  const record = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return { year: Number(record.year), month: Number(record.month), day: Number(record.day) };
}

function dateTimeParts(value: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);
  const record = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return { year: Number(record.year), month: Number(record.month), day: Number(record.day), hour: Number(record.hour), minute: Number(record.minute), second: Number(record.second) };
}
