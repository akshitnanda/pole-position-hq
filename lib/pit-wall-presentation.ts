// Presentation only: source records and exported evidence retain their original text.
export type BriefTextPart = { text: string; dateTime?: string };

export function formatBriefDate(value: string, timeZone = "UTC") {
  const calendar = /^(\d{4})-(\d{2})-(\d{2})T/.exec(value);
  if (calendar) {
    const [, yearText, monthText, dayText] = calendar;
    const year = Number(yearText), month = Number(monthText), day = Number(dayText);
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if (month < 1 || month > 12 || day < 1 || day > days[month - 1]) return value;
  }
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  try {
    return new Intl.DateTimeFormat("en-GB", {
      day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
      hourCycle: "h23", timeZone, timeZoneName: "short",
    }).format(date);
  } catch {
    return value;
  }
}

export function briefTextParts(value: string, timeZone = "UTC"): BriefTextPart[] {
  const dates = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})/g;
  const parts: BriefTextPart[] = [];
  let cursor = 0;
  for (const match of value.matchAll(dates)) {
    if (match.index > cursor) parts.push({ text: value.slice(cursor, match.index) });
    const formatted = formatBriefDate(match[0], timeZone);
    parts.push(formatted === match[0] ? { text: match[0] } : { text: formatted, dateTime: match[0] });
    cursor = match.index + match[0].length;
  }
  if (cursor < value.length) parts.push({ text: value.slice(cursor) });
  return parts;
}
