import test from 'node:test';
import assert from 'node:assert/strict';
import { ACHIEVEMENTS, findUnlockable, progressToward } from '../www/js/services/achievement-rules.js';
import { evaluateAchievements, gatherStats, loadAchievements, safeEvaluateAchievements } from '../www/js/services/achievement-service.js';
import { commitProgression } from '../www/js/services/progression-service.js';
import { addDays } from '../www/js/utils/dates.js';
import * as W from '../www/js/models/workout.js';
import { at, logWorkout, planDay, setupDb } from './helpers/scenario.js';

const codes = (list) => list.map((a) => a.code);

// ---- Rules --------------------------------------------------------------------

test('the achievement list matches the spec and every code is unique', () => {
  assert.deepEqual(
    ACHIEVEMENTS.map((a) => a.title),
    ['First Workout', '10 Workouts', '25 Workouts', '50 Workouts', '100 Workouts', 'First Weight Increase', '10 Exercises Progressed', '4-Week Consistency'],
  );
  assert.equal(new Set(ACHIEVEMENTS.map((a) => a.code)).size, ACHIEVEMENTS.length);
});

test('findUnlockable returns what is reached and not yet unlocked', () => {
  const stats = { workouts: 12, weightIncreases: 0, exercisesProgressed: 0, perfectWeeks: 0 };
  assert.deepEqual(codes(findUnlockable(stats, new Set())), ['first_workout', 'workouts_10']);
  assert.deepEqual(codes(findUnlockable(stats, new Set(['first_workout']))), ['workouts_10']);
  assert.deepEqual(findUnlockable({}, new Set()), []);
});

test('progress toward an achievement never shows more than the target', () => {
  const ten = ACHIEVEMENTS.find((a) => a.code === 'workouts_10');
  assert.deepEqual(progressToward(ten, { workouts: 7 }), { current: 7, target: 10 });
  assert.deepEqual(progressToward(ten, { workouts: 40 }), { current: 10, target: 10 });
  assert.deepEqual(progressToward(ten, {}), { current: 0, target: 10 });
});

// ---- Against the database -----------------------------------------------------

/** Monday plan: Shoulder Press 3 x 8-12 at 25 lbs. First launch is well before the test dates. */
async function start() {
  const db = await setupDb({ firstLaunch: new Date(2026, 7, 1, 8, 0) });
  await planDay(db, 1, [{ name: 'Shoulder Press', weight: 25 }]);
  return db;
}

const top = [[25, 12], [25, 12], [25, 12]];
const easy = [[25, 8], [25, 8], [25, 8]];
const mondays = (n, from = '2026-08-03') => Array.from({ length: n }, (_, i) => addDays(from, 7 * i));
const startOf = (dateString) => {
  const [y, m, d] = dateString.split('-').map(Number);
  return at(y, m, d, 10, 0);
};

test('nothing is unlocked before a workout is finished', async () => {
  const db = await start();
  assert.deepEqual(await evaluateAchievements(db, new Date(2026, 7, 5)), []);
});

test('finishing the first workout unlocks First Workout, once', async () => {
  const db = await start();
  await logWorkout(db, at(2026, 8, 3), { 'Shoulder Press': easy });
  const now = new Date(2026, 7, 3, 12, 0);
  assert.deepEqual(codes(await evaluateAchievements(db, now)), ['first_workout']);
  assert.deepEqual(await evaluateAchievements(db, now), []); // already unlocked
  assert.equal((await db.get('SELECT COUNT(*) AS n FROM achievements')).n, 1);
  assert.equal((await db.get('SELECT unlocked_at FROM achievements')).unlocked_at, now.toISOString());
});

test('workout milestones unlock at exactly 10 workouts', async () => {
  const db = await start();
  const dates = mondays(10);
  for (const date of dates.slice(0, 9)) await logWorkout(db, startOf(date), { 'Shoulder Press': easy });
  const nine = new Date(2026, 9, 1);
  // Nine perfect weeks in a row also earn the consistency achievement.
  assert.deepEqual(codes(await evaluateAchievements(db, nine)), ['first_workout', 'consistent_4_weeks']);

  await logWorkout(db, startOf(dates[9]), { 'Shoulder Press': easy });
  assert.deepEqual(codes(await evaluateAchievements(db, new Date(2026, 9, 12))), ['workouts_10']);
});

test('committing a heavier working weight unlocks First Weight Increase', async () => {
  const db = await start();
  const { sessionId } = await logWorkout(db, at(2026, 8, 3), { 'Shoulder Press': top });
  const now = new Date(2026, 7, 3, 12, 0);
  await evaluateAchievements(db, now);

  // Reaching the top of the range alone changes nothing: the user has to commit.
  const [ex] = await W.getSessionExercises(db, sessionId);
  assert.deepEqual(await evaluateAchievements(db, now), []);

  const commit = await commitProgression(db, ex.id);
  assert.equal(commit.ok, true);
  assert.deepEqual(codes(await evaluateAchievements(db, now)), ['first_increase']);
});

test('10 Exercises Progressed counts different exercises, not repeat increases', async () => {
  const db = await start();
  const event = (id, name, from, to) =>
    db.run('INSERT INTO progression_events (exercise_id, exercise_name, from_weight, to_weight, unit, created_at) VALUES (?, ?, ?, ?, ?, ?)', [id, name, from, to, 'lbs', new Date().toISOString()]);

  for (let i = 0; i < 6; i++) await event(1, 'Bench Press', 100 + i * 5, 105 + i * 5); // same exercise, six times
  for (let id = 2; id <= 9; id++) await event(id, `Exercise ${id}`, 20, 25); // 8 more: 9 different so far
  assert.equal((await gatherStats(db, new Date(2026, 7, 5))).exercisesProgressed, 9);
  assert.equal(codes(await evaluateAchievements(db, new Date(2026, 7, 5))).includes('progressed_10'), false);

  await event(null, 'Deleted lift', 20, 25); // an exercise removed from the library still counts
  await event(20, 'Decrease', 50, 45); // a decrease is not progress
  assert.equal((await gatherStats(db, new Date(2026, 7, 5))).exercisesProgressed, 10);
  assert.ok(codes(await evaluateAchievements(db, new Date(2026, 7, 5))).includes('progressed_10'));
});

test('4-Week Consistency needs four finished weeks in a row with nothing missed', async () => {
  const db = await start();
  const dates = mondays(4, '2026-08-03'); // four Mondays: the only scheduled day
  for (const date of dates) await logWorkout(db, startOf(date), { 'Shoulder Press': easy });

  // On Sunday 30 Aug the fourth week (24 Aug - 30 Aug) is not over yet.
  assert.equal((await gatherStats(db, new Date(2026, 7, 30, 12))).perfectWeeks, 3);
  assert.equal(codes(await evaluateAchievements(db, new Date(2026, 7, 30, 12))).includes('consistent_4_weeks'), false);

  // The day after it ends, it counts.
  assert.equal((await gatherStats(db, new Date(2026, 7, 31, 12))).perfectWeeks, 4);
  assert.ok(codes(await evaluateAchievements(db, new Date(2026, 7, 31, 12))).includes('consistent_4_weeks'));
});

test('a missed workout breaks the run of perfect weeks', async () => {
  const db = await start();
  const dates = mondays(6, '2026-08-03');
  for (const date of dates) {
    if (date === '2026-08-17') continue; // the third Monday is skipped
    await logWorkout(db, startOf(date), { 'Shoulder Press': easy });
  }
  // Weeks of 3 Aug and 10 Aug are perfect (run of 2), 17 Aug is missed, then 24 Aug, 31 Aug, 7 Sep (run of 3).
  const now = new Date(2026, 8, 15, 12);
  assert.equal((await gatherStats(db, now)).perfectWeeks, 3);
  assert.equal(codes(await evaluateAchievements(db, now)).includes('consistent_4_weeks'), false);
});

test('loadAchievements lists everything with progress, unlocking anything reached', async () => {
  const db = await start();
  for (const date of mondays(3)) await logWorkout(db, startOf(date), { 'Shoulder Press': easy });
  const { items, newlyUnlocked } = await loadAchievements(db, new Date(2026, 7, 20, 12));

  assert.deepEqual(codes(newlyUnlocked), ['first_workout']);
  assert.equal(items.length, ACHIEVEMENTS.length);
  const first = items.find((a) => a.code === 'first_workout');
  assert.equal(first.unlocked, true);
  assert.ok(first.unlockedAt);
  const ten = items.find((a) => a.code === 'workouts_10');
  assert.equal(ten.unlocked, false);
  assert.deepEqual(ten.progress, { current: 3, target: 10 });

  const again = await loadAchievements(db, new Date(2026, 7, 21, 12));
  assert.deepEqual(again.newlyUnlocked, []);
});

test('the safe check never throws, even when the database call fails', async () => {
  const broken = { get: async () => { throw new Error('boom'); }, all: async () => { throw new Error('boom'); }, run: async () => { throw new Error('boom'); } };
  const original = console.error;
  console.error = () => {};
  try {
    assert.deepEqual(await safeEvaluateAchievements(broken), []);
  } finally {
    console.error = original;
  }
});
