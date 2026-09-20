import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TEST_REMINDER_ID,
  buildReminders,
  buildTestReminder,
  describeReminderDays,
  parseReminderTime,
  reminderBody,
  reminderDayLabel,
  reminderIds,
  validateReminderTime,
} from '../www/js/services/notification-rules.js';
import {
  loadReminderState,
  sendTestReminder,
  setReminderTime,
  setRemindersEnabled,
  syncReminders,
  useNotifier,
} from '../www/js/services/notification-service.js';
import { saveDay } from '../www/js/services/program-service.js';
import { getSetting } from '../www/js/models/settings.js';
import { dayIdFor, setupDb } from './helpers/scenario.js';

const DEFAULT_WEEK = [
  { weekday: 1, name: 'Push', isRest: false },
  { weekday: 2, name: 'Pull', isRest: false },
  { weekday: 3, name: 'Legs', isRest: false },
  { weekday: 4, name: 'Rest', isRest: true },
  { weekday: 5, name: 'Upper', isRest: false },
  { weekday: 6, name: 'Lower', isRest: false },
  { weekday: 7, name: 'Rest', isRest: true },
];

/** A stand-in for the Android plugin that records what it was asked to do. */
function fakeNotifier({ permission = 'granted', requestResult = 'granted', isSupported = true } = {}) {
  const fake = {
    isSupported,
    permission,
    scheduled: [],
    cancelCount: 0,
    tests: [],
    requested: 0,
    async getPermission() {
      return fake.permission;
    },
    async requestPermission() {
      fake.requested += 1;
      fake.permission = requestResult;
      return fake.permission;
    },
    async cancelReminders() {
      fake.cancelCount += 1;
      fake.scheduled = [];
    },
    async replaceReminders(items) {
      fake.cancelCount += 1;
      fake.scheduled = items;
    },
    async sendTest(item) {
      fake.tests.push(item);
    },
  };
  return fake;
}

// ---- Rules ---------------------------------------------------------------------

test('reminder time must be a 24-hour HH:MM', () => {
  assert.deepEqual(parseReminderTime('07:30'), { hour: 7, minute: 30 });
  assert.deepEqual(parseReminderTime('00:00'), { hour: 0, minute: 0 });
  assert.deepEqual(parseReminderTime('23:59'), { hour: 23, minute: 59 });
  for (const bad of ['24:00', '7:30', '07:60', '', null, undefined, 'noon', '07:30:00']) {
    assert.equal(parseReminderTime(bad), null, String(bad));
  }
  assert.equal(validateReminderTime('06:15').ok, true);
  assert.equal(validateReminderTime('nope').ok, false);
});

test('reminder text names the day and does not double the word "day"', () => {
  assert.equal(reminderDayLabel('Push'), 'Push day');
  assert.equal(reminderDayLabel('Leg Day'), 'Leg Day');
  assert.equal(reminderDayLabel('  Upper  '), 'Upper day');
  assert.equal(reminderDayLabel(''), 'Workout day');
  assert.equal(reminderBody(1, 'Push'), 'It’s Monday. Push day 💪');
  assert.equal(reminderBody(6, 'Lower'), 'It’s Saturday. Lower day 💪');
});

test('one reminder per training day, none on rest days, at the chosen time', () => {
  const reminders = buildReminders(DEFAULT_WEEK, '06:45');
  assert.deepEqual(reminders.map((r) => r.id), [1001, 1002, 1003, 1005, 1006]);
  assert.deepEqual(reminders.map((r) => r.weekday), [1, 2, 3, 5, 6]);
  for (const r of reminders) {
    assert.equal(r.hour, 6);
    assert.equal(r.minute, 45);
  }
  assert.equal(reminders[0].body, 'It’s Monday. Push day 💪');
  assert.equal(reminders[3].body, 'It’s Friday. Upper day 💪');
});

test('weekdays are converted to the numbering Capacitor uses (Sunday = 1)', () => {
  const week = DEFAULT_WEEK.map((d) => ({ ...d, isRest: false }));
  const byWeekday = Object.fromEntries(buildReminders(week, '07:00').map((r) => [r.weekday, r.capacitorWeekday]));
  assert.deepEqual(byWeekday, { 1: 2, 2: 3, 3: 4, 4: 5, 5: 6, 6: 7, 7: 1 });
});

test('an unusable time falls back to the default rather than scheduling nonsense', () => {
  const [first] = buildReminders(DEFAULT_WEEK, 'garbage');
  assert.equal(first.hour, 7);
  assert.equal(first.minute, 0);
});

test('reminder ids are the seven weekday ids, and the test id is separate', () => {
  assert.deepEqual(reminderIds(), [1001, 1002, 1003, 1004, 1005, 1006, 1007]);
  assert.equal(reminderIds().includes(TEST_REMINDER_ID), false);
  assert.equal(buildTestReminder().id, TEST_REMINDER_ID);
});

test('training days are listed in week order', () => {
  assert.equal(describeReminderDays(DEFAULT_WEEK), 'Mon, Tue, Wed, Fri, Sat');
  assert.equal(describeReminderDays(DEFAULT_WEEK.map((d) => ({ ...d, isRest: true }))), '');
});

// ---- Service ---------------------------------------------------------------------

test('with no notifier (browser, tests) every call is a quiet no-op', async () => {
  useNotifier(null);
  const db = await setupDb();
  assert.deepEqual(await syncReminders(db), { status: 'unsupported', scheduled: 0 });
  assert.deepEqual(await setRemindersEnabled(db, true), { ok: false, reason: 'unsupported' });
  assert.deepEqual(await sendTestReminder(), { ok: false, reason: 'unsupported' });
  const state = await loadReminderState(db);
  assert.equal(state.supported, false);
  assert.equal(state.permission, 'unsupported');
});

test('reminders are off by default and nothing is scheduled', async () => {
  const fake = fakeNotifier();
  useNotifier(fake);
  const db = await setupDb();
  assert.equal((await syncReminders(db)).status, 'off');
  assert.equal(fake.scheduled.length, 0);
  const state = await loadReminderState(db);
  assert.equal(state.enabled, false);
  assert.equal(state.time, '07:00');
  assert.equal(state.hasTrainingDays, true);
});

test('turning reminders on schedules the training days; turning them off cancels them', async () => {
  const fake = fakeNotifier();
  useNotifier(fake);
  const db = await setupDb();

  const on = await setRemindersEnabled(db, true);
  assert.deepEqual(on, { ok: true, enabled: true, scheduled: 5 });
  assert.equal(await getSetting(db, 'notif_enabled'), '1');
  assert.deepEqual(fake.scheduled.map((r) => r.id), [1001, 1002, 1003, 1005, 1006]);

  const off = await setRemindersEnabled(db, false);
  assert.deepEqual(off, { ok: true, enabled: false });
  assert.equal(await getSetting(db, 'notif_enabled'), '0');
  assert.equal(fake.scheduled.length, 0);
});

test('Android permission is asked for when turning reminders on', async () => {
  const fake = fakeNotifier({ permission: 'prompt', requestResult: 'granted' });
  useNotifier(fake);
  const db = await setupDb();
  const result = await setRemindersEnabled(db, true);
  assert.equal(result.ok, true);
  assert.equal(fake.requested, 1);
});

test('if permission is refused the setting stays off and nothing is scheduled', async () => {
  const fake = fakeNotifier({ permission: 'prompt', requestResult: 'denied' });
  useNotifier(fake);
  const db = await setupDb();
  const result = await setRemindersEnabled(db, true);
  assert.deepEqual(result, { ok: false, reason: 'denied' });
  assert.equal(await getSetting(db, 'notif_enabled'), '0');
  assert.equal(fake.scheduled.length, 0);
});

test('reminders that are on but blocked by Android are cancelled, and the panel can tell', async () => {
  const fake = fakeNotifier();
  useNotifier(fake);
  const db = await setupDb();
  await setRemindersEnabled(db, true);
  fake.permission = 'denied'; // the user later blocks notifications in Android settings
  const result = await syncReminders(db);
  assert.deepEqual(result, { status: 'no-permission', scheduled: 0 });
  assert.equal(fake.scheduled.length, 0);
  const state = await loadReminderState(db);
  assert.equal(state.enabled, true);
  assert.equal(state.permission, 'denied');
});

test('changing the time reschedules every reminder', async () => {
  const fake = fakeNotifier();
  useNotifier(fake);
  const db = await setupDb();
  await setRemindersEnabled(db, true);

  const result = await setReminderTime(db, '18:30');
  assert.equal(result.ok, true);
  assert.equal(await getSetting(db, 'notif_time'), '18:30');
  assert.equal(fake.scheduled.length, 5);
  assert.ok(fake.scheduled.every((r) => r.hour === 18 && r.minute === 30));
});

test('an invalid time is refused and changes nothing', async () => {
  const fake = fakeNotifier();
  useNotifier(fake);
  const db = await setupDb();
  await setRemindersEnabled(db, true);
  const result = await setReminderTime(db, '25:99');
  assert.equal(result.ok, false);
  assert.equal(await getSetting(db, 'notif_time'), '07:00');
});

test('the time can be saved while reminders are off, and is used when they are turned on', async () => {
  const fake = fakeNotifier();
  useNotifier(fake);
  const db = await setupDb();
  await setReminderTime(db, '05:15');
  assert.equal(fake.scheduled.length, 0);
  await setRemindersEnabled(db, true);
  assert.ok(fake.scheduled.every((r) => r.hour === 5 && r.minute === 15));
});

test('editing the program updates the reminders', async () => {
  const fake = fakeNotifier();
  useNotifier(fake);
  const db = await setupDb();
  await setRemindersEnabled(db, true);

  // Rename Monday.
  const monday = await dayIdFor(db, 1);
  assert.equal((await saveDay(db, monday, { name: 'Chest', isRest: false })).ok, true);
  await syncReminders(db); // waits for the sync saveDay started
  assert.equal(fake.scheduled.find((r) => r.weekday === 1).body, 'It’s Monday. Chest day 💪');

  // Make Wednesday a rest day.
  const wednesday = await dayIdFor(db, 3);
  await saveDay(db, wednesday, { name: 'Legs', isRest: true });
  await syncReminders(db);
  assert.deepEqual(fake.scheduled.map((r) => r.weekday), [1, 2, 5, 6]);

  // Make Thursday a training day.
  const thursday = await dayIdFor(db, 4);
  await saveDay(db, thursday, { name: 'Arms', isRest: false });
  await syncReminders(db);
  assert.deepEqual(fake.scheduled.map((r) => r.weekday), [1, 2, 4, 5, 6]);
  assert.equal(fake.scheduled.find((r) => r.weekday === 4).body, 'It’s Thursday. Arms day 💪');
});

test('editing the program while reminders are off schedules nothing', async () => {
  const fake = fakeNotifier();
  useNotifier(fake);
  const db = await setupDb();
  await saveDay(db, await dayIdFor(db, 1), { name: 'Chest', isRest: false });
  await syncReminders(db);
  assert.equal(fake.scheduled.length, 0);
});

test('a program with no training days schedules nothing', async () => {
  const fake = fakeNotifier();
  useNotifier(fake);
  const db = await setupDb();
  await setRemindersEnabled(db, true);
  for (const weekday of [1, 2, 3, 5, 6]) {
    await saveDay(db, await dayIdFor(db, weekday), { name: 'Rest', isRest: true });
  }
  await syncReminders(db);
  assert.equal(fake.scheduled.length, 0);
  const state = await loadReminderState(db);
  assert.equal(state.hasTrainingDays, false);
});

test('a test notification asks for permission if needed, then is sent', async () => {
  const fake = fakeNotifier({ permission: 'prompt', requestResult: 'granted' });
  useNotifier(fake);
  assert.deepEqual(await sendTestReminder(), { ok: true });
  assert.equal(fake.tests.length, 1);
  assert.equal(fake.tests[0].id, TEST_REMINDER_ID);

  const blocked = fakeNotifier({ permission: 'prompt', requestResult: 'denied' });
  useNotifier(blocked);
  assert.deepEqual(await sendTestReminder(), { ok: false, reason: 'denied' });
  assert.equal(blocked.tests.length, 0);
});

test('a plugin failure is reported, not thrown', async () => {
  const fake = fakeNotifier();
  fake.replaceReminders = async () => {
    throw new Error('alarm service unavailable');
  };
  useNotifier(fake);
  const db = await setupDb();
  const originalError = console.error;
  console.error = () => {};
  try {
    assert.deepEqual(await setRemindersEnabled(db, true), { ok: false, reason: 'error' });
  } finally {
    console.error = originalError;
  }
});

test.after(() => useNotifier(null));
