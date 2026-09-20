import test from 'node:test';
import assert from 'node:assert/strict';
import { addDays, datesBetween, parseLocalDate, isoWeekday, toLocalDateString } from '../www/js/utils/dates.js';
import {
  bestPerfectWeekRun,
  buildWeekProgress,
  computeStreaks,
  describeStreak,
  describeWeekTotal,
  outcomeForDate,
} from '../www/js/services/streak-rules.js';
import { buildWeekView } from '../www/js/services/schedule-service.js';
import { loadHomeConsistency, loadStreaks, reconcileSchedule } from '../www/js/services/streak-service.js';
import { saveDay } from '../www/js/services/program-service.js';
import { insertProgramExercise, updateProgramDay } from '../www/js/models/program.js';
import * as W from '../www/js/models/workout.js';
import { completeSet, finishWorkout, startWorkout } from '../www/js/services/workout-service.js';
import { at, exerciseId, logWorkout, planDay, setupDb } from './helpers/scenario.js';

const log = (db) => db.all('SELECT date, outcome FROM schedule_log ORDER BY date');
const outcomes = async (db) => Object.fromEntries((await log(db)).map((r) => [r.date, r.outcome]));

// ---- Date helpers -------------------------------------------------------------

test('parseLocalDate accepts real dates only', () => {
  assert.equal(toLocalDateString(parseLocalDate('2026-09-21')), '2026-09-21');
  assert.equal(parseLocalDate('2026-02-30'), null);
  assert.equal(parseLocalDate('2026-9-1'), null);
  assert.equal(parseLocalDate('nonsense'), null);
});

test('addDays and datesBetween cross month and year boundaries', () => {
  assert.equal(addDays('2026-09-30', 1), '2026-10-01');
  assert.equal(addDays('2026-01-01', -1), '2025-12-31');
  assert.equal(addDays('2028-02-28', 1), '2028-02-29');
  assert.deepEqual(datesBetween('2026-12-30', '2027-01-02'), ['2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02']);
  assert.deepEqual(datesBetween('2026-09-21', '2026-09-21'), ['2026-09-21']);
  assert.deepEqual(datesBetween('2026-09-22', '2026-09-21'), []);
  assert.throws(() => addDays('bad', 1));
});

// ---- Pure rules ---------------------------------------------------------------

test('rest days neither break nor extend a streak; a missed workout resets it', () => {
  const entries = [
    { date: '2026-09-14', outcome: 'completed' },
    { date: '2026-09-15', outcome: 'completed' },
    { date: '2026-09-16', outcome: 'rest' },
    { date: '2026-09-17', outcome: 'completed' },
    { date: '2026-09-18', outcome: 'missed' },
    { date: '2026-09-19', outcome: 'rest' },
    { date: '2026-09-20', outcome: 'completed' },
    { date: '2026-09-21', outcome: 'completed' },
  ];
  assert.deepEqual(computeStreaks(entries, '2026-09-21'), { current: 2, best: 3 });
  // Days after today are ignored.
  assert.deepEqual(computeStreaks(entries, '2026-09-17'), { current: 3, best: 3 });
  assert.deepEqual(computeStreaks([], '2026-09-21'), { current: 0, best: 0 });
});

test('outcomeForDate: done, missed, or rest', () => {
  const push = { isRest: false, exerciseCount: 4 };
  assert.equal(outcomeForDate({ day: push, completed: true }), 'completed');
  assert.equal(outcomeForDate({ day: push, completed: false }), 'missed');
  assert.equal(outcomeForDate({ day: { isRest: true, exerciseCount: 0 }, completed: false }), 'rest');
  assert.equal(outcomeForDate({ day: { isRest: false, exerciseCount: 0 }, completed: false }), 'rest'); // nothing planned
  assert.equal(outcomeForDate({ day: null, completed: false }), 'rest');
});

const DAYS = [
  { id: 1, weekday: 1, name: 'Push', isRest: false, exerciseCount: 4 },
  { id: 2, weekday: 2, name: 'Pull', isRest: false, exerciseCount: 4 },
  { id: 3, weekday: 3, name: 'Legs', isRest: false, exerciseCount: 4 },
  { id: 4, weekday: 4, name: 'Rest', isRest: true, exerciseCount: 0 },
  { id: 5, weekday: 5, name: 'Upper', isRest: false, exerciseCount: 4 },
  { id: 6, weekday: 6, name: 'Lower', isRest: false, exerciseCount: 4 },
  { id: 7, weekday: 7, name: 'Rest', isRest: true, exerciseCount: 0 },
];

test('a week on Saturday reads like the spec: 4 / 5 scheduled workouts', () => {
  const week = buildWeekView(DAYS, new Date(2026, 8, 26, 9, 0)); // Sat 26 Sep 2026
  const logByDate = new Map([
    ['2026-09-21', 'completed'],
    ['2026-09-22', 'completed'],
    ['2026-09-23', 'completed'],
    ['2026-09-24', 'rest'],
    ['2026-09-25', 'completed'],
  ]);
  const progress = buildWeekProgress(week, logByDate, new Set());
  assert.deepEqual(progress.days.map((d) => d.status), ['completed', 'completed', 'completed', 'rest', 'completed', 'today', 'rest']);
  assert.deepEqual([progress.completed, progress.scheduled], [4, 5]);
  assert.equal(describeWeekTotal(progress), '4 / 5 scheduled workouts');
});

test('missed, upcoming, and untracked days are told apart', () => {
  const week = buildWeekView(DAYS, new Date(2026, 8, 24, 9, 0)); // Thu 24 Sep 2026
  const logByDate = new Map([['2026-09-22', 'missed'], ['2026-09-23', 'completed']]);
  const progress = buildWeekProgress(week, logByDate, new Set());
  assert.deepEqual(progress.days.map((d) => d.status), ['none', 'missed', 'completed', 'rest', 'upcoming', 'upcoming', 'rest']);
  assert.deepEqual([progress.completed, progress.scheduled], [1, 4]);
});

test('a finished workout on today counts even without a log row', () => {
  const week = buildWeekView(DAYS, new Date(2026, 8, 21, 9, 0)); // Mon
  const progress = buildWeekProgress(week, new Map(), new Set(['2026-09-21']));
  assert.equal(progress.days[0].status, 'completed');
});

test('streak messages are encouraging and never blame', () => {
  assert.deepEqual(describeStreak({ current: 12, workouts: 30, todayStatus: 'completed' }), {
    headline: '12 workout streak',
    sub: 'You showed up today.',
    active: true,
  });
  assert.equal(describeStreak({ current: 3, workouts: 9, todayStatus: 'today' }).sub, 'Keep going. Today’s workout is waiting.');
  assert.equal(describeStreak({ current: 0, workouts: 0, todayStatus: 'today' }).headline, 'No streak yet');
  const restart = describeStreak({ current: 0, workouts: 9, todayStatus: 'rest' });
  assert.match(restart.sub, /Life happens/);
  assert.doesNotMatch(JSON.stringify(restart), /fail|missed|lazy|broke/i);
  assert.equal(describeWeekTotal({ completed: 0, scheduled: 0 }), 'No workouts scheduled this week.');
  assert.equal(describeWeekTotal({ completed: 1, scheduled: 1 }), '1 / 1 scheduled workout');
});

test('bestPerfectWeekRun counts consecutive finished weeks with no missed workout', () => {
  const week = (monday, outcomesList) => outcomesList.map((outcome, i) => ({ date: addDays(monday, i), outcome }));
  const entries = [
    ...week('2026-08-24', ['completed', 'rest', 'completed']),
    ...week('2026-08-31', ['completed', 'completed']),
    ...week('2026-09-07', ['completed', 'missed']), // breaks the run
    ...week('2026-09-14', ['completed', 'completed']),
    ...week('2026-09-21', ['completed', 'completed']),
  ];
  // Week of 21 Sep is still in progress on 2026-09-24, so it does not count yet.
  assert.equal(bestPerfectWeekRun(entries, '2026-09-24'), 2);
  // Once that week is over, 14 Sep and 21 Sep form a run of 2 as well.
  assert.equal(bestPerfectWeekRun(entries, '2026-09-28'), 2);
  // A week that has only rest days is not perfect and breaks the run.
  const gap = [...week('2026-09-07', ['completed']), ...week('2026-09-14', ['rest', 'rest']), ...week('2026-09-21', ['completed'])];
  assert.equal(bestPerfectWeekRun(gap, '2026-10-05'), 1);
});

// ---- Reconciling the schedule log --------------------------------------------

/** First launch Mon 14 Sep 2026. Monday = Push, Tuesday = Pull, Friday = Upper (planned); other days empty or rest. */
async function scenario() {
  const db = await setupDb({ firstLaunch: new Date(2026, 8, 14, 8, 0) });
  await planDay(db, 1, [{ name: 'Bench Press', weight: 100 }]);
  await planDay(db, 2, [{ name: 'Barbell Row', weight: 90 }]);
  await planDay(db, 5, [{ name: 'Shoulder Press', weight: 60 }]);
  return db;
}

test('past days are recorded as completed, missed, or rest; the first-launch day is not counted', async () => {
  const db = await scenario();
  await logWorkout(db, at(2026, 9, 15), { 'Barbell Row': [[90, 10], [90, 10], [90, 10]] });

  const res = await reconcileSchedule(db, new Date(2026, 8, 21, 10, 0));
  assert.equal(res.filled, 5); // 16 .. 20 Sep (15 Sep was logged when the workout finished)
  assert.deepEqual(await outcomes(db), {
    '2026-09-15': 'completed',
    '2026-09-16': 'rest', // Legs has nothing planned
    '2026-09-17': 'rest',
    '2026-09-18': 'missed', // Upper was planned and not done
    '2026-09-19': 'rest',
    '2026-09-20': 'rest',
  });
  assert.equal((await outcomes(db))['2026-09-14'], undefined);

  assert.deepEqual(await loadStreaks(db, new Date(2026, 8, 21, 10, 0)), { current: 0, best: 1 });
});

test('reconciling twice adds nothing, and later program edits never rewrite a recorded day', async () => {
  const db = await scenario();
  await reconcileSchedule(db, new Date(2026, 8, 21, 10, 0));
  const before = await outcomes(db);
  assert.equal((await reconcileSchedule(db, new Date(2026, 8, 21, 11, 0))).filled, 0);

  const friday = await db.get('SELECT id FROM program_days WHERE weekday = 5');
  await updateProgramDay(db, friday.id, { name: 'Rest', isRest: true });
  await reconcileSchedule(db, new Date(2026, 8, 22, 10, 0));
  const after = await outcomes(db);
  assert.equal(after['2026-09-18'], 'missed');
  assert.equal(after['2026-09-21'], 'missed'); // Monday's Push was planned and not done
  for (const [date, outcome] of Object.entries(before)) assert.equal(after[date], outcome);
});

test('a workout still in progress keeps its day open; finishing it later counts', async () => {
  const db = await scenario();
  const started = await startWorkout(db, at(2026, 9, 18, 18, 0)); // Friday
  assert.equal(started.ok, true);
  await reconcileSchedule(db, new Date(2026, 8, 21, 10, 0));
  assert.equal((await outcomes(db))['2026-09-18'], undefined);

  const [ex] = await W.getSessionExercises(db, started.sessionId);
  await completeSet(db, ex.sets.find((s) => s.kind === 'working').id, { weight: 60, reps: 10 }, at(2026, 9, 21, 10, 5));
  await finishWorkout(db, started.sessionId, at(2026, 9, 21, 10, 10));
  assert.equal((await outcomes(db))['2026-09-18'], 'completed');
});

test('with nothing planned, no day counts as missed', async () => {
  const db = await setupDb({ firstLaunch: new Date(2026, 8, 14, 8, 0) });
  await reconcileSchedule(db, new Date(2026, 8, 21, 10, 0));
  const all = Object.values(await outcomes(db));
  assert.equal(all.includes('missed'), false); // empty program: nothing was scheduled
});

test('the Home week for Monday after a workout shows 1 done of 3 scheduled', async () => {
  const db = await scenario();
  await logWorkout(db, at(2026, 9, 21), { 'Bench Press': [[100, 10], [100, 10], [100, 10]] });
  const home = await loadHomeConsistency(db, new Date(2026, 8, 21, 12, 0));
  assert.deepEqual(home.days.map((d) => d.status), ['completed', 'upcoming', 'rest', 'rest', 'upcoming', 'rest', 'rest']);
  assert.deepEqual([home.completed, home.scheduled], [1, 3]);
  assert.equal(home.streak.current, 1);
  assert.equal(home.message.headline, '1 workout streak');
  assert.equal(home.message.sub, 'You showed up today.');

  // Two days later Tuesday's Pull was not done: it shows as missed and the streak restarts.
  const later = await loadHomeConsistency(db, new Date(2026, 8, 23, 9, 0));
  assert.equal(later.days[1].status, 'missed');
  assert.deepEqual([later.completed, later.scheduled], [1, 3]);
  assert.equal(later.streak.current, 0);
  assert.equal(later.streak.best, 1);
  assert.match(later.message.sub, /Life happens/);
});

test('editing the program first records the days that already passed', async () => {
  const now = new Date();
  const db = await setupDb({ firstLaunch: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 4, 8, 0) });
  const yesterday = addDays(toLocalDateString(now), -1);
  const weekday = isoWeekday(parseLocalDate(yesterday));

  // Make yesterday's weekday a planned training day without going through program-service.
  const day = await db.get('SELECT id FROM program_days WHERE weekday = ?', [weekday]);
  await updateProgramDay(db, day.id, { name: 'Test', isRest: false });
  await insertProgramExercise(db, {
    dayId: day.id,
    exerciseId: await exerciseId(db, 'Bench Press'),
    workingWeight: 100,
    weightUnit: 'lbs',
    restSeconds: 60,
    workingSets: [{ min: 8, max: 12 }],
  });
  assert.equal((await log(db)).length, 0);

  const res = await saveDay(db, day.id, { name: 'Test', isRest: true });
  assert.equal(res.ok, true);
  assert.equal((await outcomes(db))[yesterday], 'missed'); // recorded as it was, before the edit
  assert.equal((await db.get('SELECT is_rest FROM program_days WHERE id = ?', [day.id])).is_rest, 1);
});
