export function browserTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

export function formatLocalTime(timestamp: string | Date, options: Intl.DateTimeFormatOptions = {}) {
  const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "Time unavailable";
  return new Intl.DateTimeFormat(undefined, {
    timeZone: browserTimeZone(),
    hour: "numeric",
    minute: "2-digit",
    ...options,
  }).format(date);
}

export function formatLocalDateTime(timestamp: string | Date) {
  const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return new Intl.DateTimeFormat(undefined, {
    timeZone: browserTimeZone(),
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function formatLocalTimeRange(start: string | Date, end: string | Date) {
  return `${formatLocalTime(start)} - ${formatLocalTime(end)}`;
}

export function formatUtcClockInLocalTime(value: string) {
  const match = value.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return value;
  const now = new Date();
  const occurrence = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), Number(match[1]), Number(match[2])));
  return formatLocalTime(occurrence);
}
