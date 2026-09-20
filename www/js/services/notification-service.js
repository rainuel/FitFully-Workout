// Workout reminders. Screens call these functions; they never touch the plugin.
//
// The native plugin is injected once at start-up with useNotifier(). Until then
// (and in tests, and in a desktop browser) every function here is a quiet no-op,
// so nothing else in the app has to know whether reminders exist.
//
// A notifier is:
//   isSupported                       boolean
//   getPermission()                   -> 'granted' | 'denied' | 'prompt'
//   requestPermission()               -> same
//   replaceReminders(items)           cancel Fit Fully's reminders, then schedule `items`
//   cancelReminders()
//   sendTest({ id, title, body })     show one notification in a few seconds

import { getActiveProgram, getProgramDays } from '../models/program.js';
import { getSetting, setSetting } from '../models/settings.js';
import {
  DEFAULT_REMINDER_TIME,
  buildReminders,
  buildTestReminder,
  describeReminderDays,
  parseReminderTime,
  validateReminderTime,
} from './notification-rules.js';

let notifier = null;

export function useNotifier(next) {
  notifier = next;
}

// Cancel-then-schedule must never interleave with another cancel-then-schedule.
let queue = Promise.resolve();
function serial(fn) {
  const result = queue.then(fn);
  queue = result.catch(() => {});
  return result;
}

async function readPrefs(db) {
  const enabled = (await getSetting(db, 'notif_enabled', '0')) === '1';
  const saved = await getSetting(db, 'notif_time', DEFAULT_REMINDER_TIME);
  return { enabled, time: parseReminderTime(saved) ? saved : DEFAULT_REMINDER_TIME };
}

async function loadDays(db) {
  const program = await getActiveProgram(db);
  return program ? getProgramDays(db, program.id) : [];
}

async function applySchedule(db) {
  if (!notifier?.isSupported) return { status: 'unsupported', scheduled: 0 };

  const { enabled, time } = await readPrefs(db);
  if (!enabled) {
    await notifier.cancelReminders();
    return { status: 'off', scheduled: 0 };
  }
  if ((await notifier.getPermission()) !== 'granted') {
    await notifier.cancelReminders();
    return { status: 'no-permission', scheduled: 0 };
  }

  const items = buildReminders(await loadDays(db), time);
  await notifier.replaceReminders(items);
  return { status: 'scheduled', scheduled: items.length };
}

/**
 * Makes the phone's scheduled reminders match the settings and the program.
 * Safe to call any time: at start-up, on resume, after a program change.
 * Returns { status: 'unsupported' | 'off' | 'no-permission' | 'scheduled', scheduled }.
 */
export function syncReminders(db) {
  return serial(() => applySchedule(db));
}

/** Everything the Reminders panel shows. */
export async function loadReminderState(db) {
  const { enabled, time } = await readPrefs(db);
  const days = await loadDays(db);
  const supported = Boolean(notifier?.isSupported);

  let permission = 'unsupported';
  if (supported) {
    try {
      permission = await notifier.getPermission();
    } catch {
      permission = 'prompt';
    }
  }

  return {
    supported,
    enabled,
    time,
    permission,
    hasTrainingDays: days.some((d) => !d.isRest),
    daysLabel: describeReminderDays(days),
  };
}

async function ensurePermission() {
  let permission = await notifier.getPermission();
  if (permission !== 'granted') permission = await notifier.requestPermission();
  return permission === 'granted';
}

/**
 * Turns reminders on or off. Turning them on asks Android for permission
 * first; if it is refused, the setting stays off.
 * Returns { ok, enabled } or { ok: false, reason: 'unsupported' | 'denied' | 'error' }.
 */
export async function setRemindersEnabled(db, enabled) {
  try {
    if (!enabled) {
      await setSetting(db, 'notif_enabled', '0');
      await syncReminders(db);
      return { ok: true, enabled: false };
    }
    if (!notifier?.isSupported) return { ok: false, reason: 'unsupported' };
    if (!(await ensurePermission())) return { ok: false, reason: 'denied' };
    await setSetting(db, 'notif_enabled', '1');
    const result = await syncReminders(db);
    return { ok: true, enabled: true, scheduled: result.scheduled };
  } catch (err) {
    console.error('Could not change reminders', err);
    return { ok: false, reason: 'error' };
  }
}

/** Saves the reminder time and reschedules. */
export async function setReminderTime(db, value) {
  const checked = validateReminderTime(value);
  if (!checked.ok) return checked;
  await setSetting(db, 'notif_time', checked.value);
  try {
    await syncReminders(db);
    return { ok: true, value: checked.value };
  } catch (err) {
    console.error('Reminder time saved, but rescheduling failed', err);
    return { ok: true, value: checked.value, scheduleFailed: true };
  }
}

/** Shows one notification in a few seconds so the user can see how reminders look. */
export async function sendTestReminder() {
  try {
    if (!notifier?.isSupported) return { ok: false, reason: 'unsupported' };
    if (!(await ensurePermission())) return { ok: false, reason: 'denied' };
    await notifier.sendTest(buildTestReminder());
    return { ok: true };
  } catch (err) {
    console.error('Could not send a test notification', err);
    return { ok: false, reason: 'error' };
  }
}
