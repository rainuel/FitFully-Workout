// Reminder rules. Pure functions: no database, no plugin, no DOM.
//
// One repeating notification per TRAINING day, at the time the user chose.
// Rest days get none. Ids 1001..1007 are Monday..Sunday, so the app can always
// cancel exactly its own reminders.

import { isoToCapacitorWeekday, weekdayName, weekdayShort } from '../utils/dates.js';

export const REMINDER_ID_BASE = 1000;
export const TEST_REMINDER_ID = 1099;
export const DEFAULT_REMINDER_TIME = '07:00';
export const REMINDER_TITLE = 'Fit Fully';

export const REMINDER_CHANNEL = {
  id: 'workout-reminders',
  name: 'Workout reminders',
  description: 'A reminder on the days you train',
  importance: 4,
};

/** [1001, ..., 1007]: the ids of the seven weekday reminders (Mon..Sun). */
export function reminderIds() {
  return Array.from({ length: 7 }, (_, i) => REMINDER_ID_BASE + i + 1);
}

/** '07:30' -> { hour: 7, minute: 30 }, or null if it is not a 24-hour HH:MM time. */
export function parseReminderTime(value) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(value ?? ''));
  return match ? { hour: Number(match[1]), minute: Number(match[2]) } : null;
}

export function validateReminderTime(value) {
  return parseReminderTime(value) ? { ok: true, value } : { ok: false, errors: ['Choose a time of day.'] };
}

/** '07:30' -> "7:30 AM" (or "07:30" on a 24-hour phone). */
export function formatReminderTime(value) {
  const t = parseReminderTime(value);
  if (!t) return String(value ?? '');
  return new Date(2000, 0, 1, t.hour, t.minute).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

/** "Push" -> "Push day". Names that already end in "day" are left alone. */
export function reminderDayLabel(name) {
  const trimmed = String(name ?? '').trim();
  if (!trimmed) return 'Workout day';
  return /\bday$/i.test(trimmed) ? trimmed : `${trimmed} day`;
}

/** "It's Monday. Push day 💪" */
export function reminderBody(weekday, dayName) {
  return `It’s ${weekdayName(weekday)}. ${reminderDayLabel(dayName)} 💪`;
}

/**
 * The reminders to schedule for a program's days (as returned by getProgramDays).
 * Rest days are skipped.
 */
export function buildReminders(days, time) {
  const t = parseReminderTime(time) ?? parseReminderTime(DEFAULT_REMINDER_TIME);
  return days
    .filter((day) => !day.isRest)
    .sort((a, b) => a.weekday - b.weekday)
    .map((day) => ({
      id: REMINDER_ID_BASE + day.weekday,
      weekday: day.weekday,
      capacitorWeekday: isoToCapacitorWeekday(day.weekday),
      hour: t.hour,
      minute: t.minute,
      title: REMINDER_TITLE,
      body: reminderBody(day.weekday, day.name),
    }));
}

/** "Mon, Tue, Wed, Fri, Sat" for the training days, or '' if there are none. */
export function describeReminderDays(days) {
  return days
    .filter((day) => !day.isRest)
    .sort((a, b) => a.weekday - b.weekday)
    .map((day) => weekdayShort(day.weekday))
    .join(', ');
}

/** The notification sent by "Send test notification". */
export function buildTestReminder() {
  return {
    id: TEST_REMINDER_ID,
    title: REMINDER_TITLE,
    body: 'Reminders are working. See you at your next workout 💪',
  };
}
