// Date helpers. All dates in Fit Fully are LOCAL calendar dates.
// Never use toISOString() to get "today": it is UTC and shifts the day near midnight.
// Weekdays are ISO numbers: 1 = Monday ... 7 = Sunday.

export const WEEKDAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export const WEEKDAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function pad2(n) {
  return String(n).padStart(2, '0');
}

/** 'YYYY-MM-DD' in the device's local time zone. */
export function toLocalDateString(date = new Date()) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/** ISO weekday: 1 (Mon) ... 7 (Sun). */
export function isoWeekday(date = new Date()) {
  const jsDay = date.getDay(); // 0 = Sunday
  return jsDay === 0 ? 7 : jsDay;
}

export function weekdayName(isoDay) {
  return WEEKDAY_NAMES[isoDay - 1];
}

export function weekdayShort(isoDay) {
  return WEEKDAY_SHORT[isoDay - 1];
}

/** Local midnight of the Monday that starts the week containing `date`. */
export function startOfWeek(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() - (isoWeekday(date) - 1));
}

/** The seven local dates (Mon..Sun) of the week containing `date`. */
export function weekDates(date = new Date()) {
  const start = startOfWeek(date);
  return Array.from({ length: 7 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
}

/**
 * Capacitor's Local Notifications number weekdays Sun = 1 ... Sat = 7.
 * Convert from our ISO numbering (Mon = 1 ... Sun = 7). Used in Phase 7.
 */
export function isoToCapacitorWeekday(isoDay) {
  return isoDay === 7 ? 1 : isoDay + 1;
}

export function formatLongDate(date = new Date()) {
  return date.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
}

export function formatDateTime(isoString) {
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return 'Unknown';
  return d.toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/** 'YYYY-MM-DD' (a local date) -> "Mon, 21 Sep". Built from parts so it never shifts a day through UTC. */
export function formatShortDate(dateString) {
  const [y, m, d] = String(dateString).split('-').map(Number);
  if (!y || !m || !d) return String(dateString);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

/** 'YYYY-MM-DD' -> local midnight as a Date, or null if it is not a real calendar date. */
export function parseLocalDate(dateString) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateString));
  if (!match) return null;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d ? date : null;
}

/** Adds (or subtracts) whole calendar days to a 'YYYY-MM-DD' string. Safe across months, years, and DST. */
export function addDays(dateString, days) {
  const date = parseLocalDate(dateString);
  if (!date) throw new Error(`addDays: "${dateString}" is not a valid date.`);
  return toLocalDateString(new Date(date.getFullYear(), date.getMonth(), date.getDate() + days));
}

/** Every date from `from` to `to`, both included, as 'YYYY-MM-DD'. Empty if `from` is after `to`. */
export function datesBetween(from, to) {
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/** 'YYYY-MM-DD' -> "Mon, 21 Sep 2026". */
export function formatFullDate(dateString) {
  const d = parseLocalDate(dateString);
  if (!d) return String(dateString);
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

/** 'YYYY-MM-DD' -> "21 Sep". */
export function formatDayMonth(dateString) {
  const d = parseLocalDate(dateString);
  if (!d) return String(dateString);
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/** 'YYYY-MM-DD' -> "September 2026". */
export function formatMonthYear(dateString) {
  const d = parseLocalDate(dateString);
  if (!d) return String(dateString);
  return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}
