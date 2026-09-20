import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeExercise,
  estimateOneRepMax,
  groupExerciseRows,
  isBetterSet,
  summarizeLoggedExercises,
  topSet,
} from '../www/js/services/history-rules.js';
import { computeAxis, niceStep } from '../www/js/components/line-chart.js';
import { loadExerciseHistory, loadHistoryPage, loadProgressOverview, loadSessionDetail } from '../www/js/services/history-service.js';
import { commitWorkingWeight } from '../www/js/services/progression-service.js';
import { saveProgramExercise } from '../www/js/services/program-service.js';
import * as W from '../www/js/models/workout.js';
import { at, logWorkout, planDay, setupDb } from './helpers/scenario.js';

const NOW = new Date(2026, 9, 5, 12, 0);

// ---- Pure rules ---------------------------------------------------------------

test('estimateOneRepMax: Epley, capped at 12 reps, never for bodyweight', () => {
  assert.equal(estimateOneRepMax(100, 1), 100);
  assert.equal(estimateOneRepMax(100, 5), 116.7);
  assert.equal(estimateOneRepMax(135, 8), 171);
  assert.equal(estimateOneRepMax(100, 12), 140);
  assert.equal(estimateOneRepMax(100, 13), null);
  assert.equal(estimateOneRepMax(0, 10), null);
  assert.equal(estimateOneRepMax(100, 0), null);
});

test('the better set is heavier, then has more reps', () => {
  assert.equal(isBetterSet({ weight: 105, reps: 5 }, { weight: 100, reps: 12 }), true);
  assert.equal(isBetterSet({ weight: 100, reps: 9 }, { weight: 100, reps: 8 }), true);
  assert.equal(isBetterSet({ weight: 100, reps: 8 }, { weight: 100, reps: 8 }), false);
  assert.deepEqual(topSet([{ weight: 100, reps: 12 }, { weight: 105, reps: 6 }, { weight: 105, reps: 8 }]), { weight: 105, reps: 8 });
  assert.equal(topSet([]), null);
});

const session = (id, date, sets, unit = 'lbs') => ({ workoutExerciseId: id, sessionId: id, date, dayName: 'Push', name: 'Bench Press', unit, sets });

test('analyzeExercise: records keep the date they were FIRST reached', () => {
  const sessions = [
    session(3, '2026-09-28', [{ setNumber: 1, weight: 105, reps: 8 }, { setNumber: 2, weight: 100, reps: 12 }]),
    session(2, '2026-09-21', [{ setNumber: 1, weight: 105, reps: 8 }, { setNumber: 2, weight: 100, reps: 10 }]),
    session(1, '2026-09-14', [{ setNumber: 1, weight: 100, reps: 12 }, { setNumber: 2, weight: 100, reps: 8 }]),
  ];
  const a = analyzeExercise(sessions);
  assert.equal(a.unit, 'lbs');
  assert.deepEqual(a.heaviest, { weight: 105, reps: 8, date: '2026-09-21' });
  // 100 x 12 (estimate 140) beats 105 x 8 (estimate 133).
  assert.deepEqual(a.bestEstimate, { value: 140, weight: 100, reps: 12, date: '2026-09-14' });
  assert.deepEqual(a.repsAtWeight, [
    { weight: 105, reps: 8, date: '2026-09-21' },
    { weight: 100, reps: 12, date: '2026-09-14' },
  ]);
  assert.deepEqual(a.chart, [
    { date: '2026-09-14', value: 100 },
    { date: '2026-09-21', value: 105 },
    { date: '2026-09-28', value: 105 },
  ]);
  assert.equal(a.chartMetric, 'weight');
  assert.equal(a.isBodyweight, false);
});

test('analyzeExercise: bodyweight exercises chart reps; other units are left out of the records', () => {
  const bw = analyzeExercise([
    session(2, '2026-09-21', [{ setNumber: 1, weight: 0, reps: 12 }]),
    session(1, '2026-09-14', [{ setNumber: 1, weight: 0, reps: 10 }]),
  ]);
  assert.equal(bw.isBodyweight, true);
  assert.equal(bw.chartMetric, 'reps');
  assert.deepEqual(bw.mostReps, { reps: 12, weight: 0, date: '2026-09-21' });
  assert.equal(bw.bestEstimate, null);

  const mixed = analyzeExercise([
    session(2, '2026-09-21', [{ setNumber: 1, weight: 60, reps: 8 }], 'kg'),
    session(1, '2026-09-14', [{ setNumber: 1, weight: 135, reps: 8 }], 'lbs'),
  ]);
  assert.equal(mixed.unit, 'kg'); // the most recent workout decides
  assert.equal(mixed.otherUnitSessions, 1);
  assert.equal(mixed.heaviest.weight, 60);
  assert.equal(mixed.chart.length, 1);

  assert.equal(analyzeExercise([]), null);
});

test('summarizeLoggedExercises groups by exercise, newest first, in the latest unit', () => {
  const rows = [
    { id: 9, libraryId: 5, name: 'Bench Press', unit: 'kg', date: '2026-09-28', topWeight: 60 },
    { id: 8, libraryId: 7, name: 'Squat', unit: 'lbs', date: '2026-09-27', topWeight: 200 },
    { id: 4, libraryId: 5, name: 'Bench Press', unit: 'lbs', date: '2026-09-14', topWeight: 135 },
    { id: 3, libraryId: null, name: 'Old Lift', unit: 'lbs', date: '2026-09-13', topWeight: 50 },
  ];
  const list = summarizeLoggedExercises(rows);
  assert.deepEqual(list.map((e) => e.name), ['Bench Press', 'Squat', 'Old Lift']);
  assert.deepEqual(list[0], { id: 9, name: 'Bench Press', unit: 'kg', sessions: 2, lastDate: '2026-09-28', topWeight: 60 });
});

test('groupExerciseRows puts each workout together and keeps the order', () => {
  const rows = [
    { workoutExerciseId: 2, sessionId: 2, date: 'b', dayName: 'Push', name: 'X', unit: 'lbs', setNumber: 1, weight: 5, reps: 9 },
    { workoutExerciseId: 2, sessionId: 2, date: 'b', dayName: 'Push', name: 'X', unit: 'lbs', setNumber: 2, weight: 5, reps: 8 },
    { workoutExerciseId: 1, sessionId: 1, date: 'a', dayName: 'Push', name: 'X', unit: 'lbs', setNumber: 1, weight: 4, reps: 9 },
  ];
  const grouped = groupExerciseRows(rows);
  assert.deepEqual(grouped.map((g) => [g.workoutExerciseId, g.sets.length]), [[2, 2], [1, 1]]);
});

test('chart axis: round gridlines, room around the data, no negative axis for positive data', () => {
  assert.equal(niceStep(30), 10);
  assert.equal(niceStep(2.4), 1);
  assert.equal(niceStep(0.9), 0.25);
  const a = computeAxis([100, 105, 110]);
  assert.ok(a.min <= 100 && a.max >= 110);
  assert.ok(a.ticks.length >= 3 && a.ticks.length <= 8);
  const flat = computeAxis([50, 50, 50]);
  assert.ok(flat.min < 50 && flat.max > 50);
  assert.equal(computeAxis([0, 2]).min, 0);
});

// ---- Against the database -----------------------------------------------------

/** Mondays 21 Sep, 28 Sep, 5 Oct: Bench 100 / 105 / 105 lbs; Shoulder Press on the first two only. */
async function threeWeeks() {
  const db = await setupDb({ firstLaunch: new Date(2026, 8, 14, 8, 0) });
  const [benchPe] = await planDay(db, 1, [
    { name: 'Bench Press', weight: 100, warmups: [{ reps: 10, weight: 50 }] },
    { name: 'Shoulder Press', weight: 60 },
  ]);
  const w1 = await logWorkout(db, at(2026, 9, 21), { 'Bench Press': [[100, 10], [100, 9], [100, 8]], 'Shoulder Press': [[60, 10], [60, 9], [60, 8]] }, { warmups: true });
  const w2 = await logWorkout(db, at(2026, 9, 28), { 'Bench Press': [[105, 8], [105, 8], [105, 7]], 'Shoulder Press': [[60, 12], [60, 12], [60, 12]] });
  const w3 = await logWorkout(db, at(2026, 10, 5), { 'Bench Press': [[105, 9], [105, 8], [105, 8]] }); // Shoulder Press skipped
  return { db, benchPe, w1, w2, w3 };
}

test('workout detail shows exactly what was logged, warm-ups apart from working sets', async () => {
  const { db, w1, w3 } = await threeWeeks();
  const d1 = await loadSessionDetail(db, w1.sessionId, NOW);
  assert.equal(d1.session.dayName, 'Push');
  const bench = d1.exercises[0];
  assert.deepEqual(bench.warmups.map((s) => [s.weight, s.reps]), [[50, 10]]);
  assert.deepEqual(bench.working.map((s) => [s.weight, s.reps]), [[100, 10], [100, 9], [100, 8]]);
  assert.deepEqual(bench.topSet && [bench.topSet.weight, bench.topSet.reps], [100, 10]);
  assert.equal(d1.summary.exercisesDone, 2);
  assert.equal(d1.summary.workingSets, 6);
  assert.equal(d1.summary.early, false);

  // Finished early: the skipped exercise stays "not done", and the workout is flagged as early.
  const d3 = await loadSessionDetail(db, w3.sessionId, NOW);
  assert.equal(d3.summary.early, true);
  assert.equal(d3.summary.exercisesDone, 1);
  assert.equal(d3.summary.exercisesPlanned, 2);
  assert.equal(d3.exercises[1].working.length, 0);
});

test('a personal record is flagged only when it beats everything logged before', async () => {
  const { db, w1, w2, w3 } = await threeWeeks();
  const pr = async (id) => (await loadSessionDetail(db, id, NOW)).exercises.map((e) => e.isPr);
  assert.deepEqual(await pr(w1.sessionId), [false, false]); // first time: nothing to beat
  assert.deepEqual(await pr(w2.sessionId), [true, false]); // bench 105 > 100; shoulder press same weight
  assert.deepEqual(await pr(w3.sessionId), [false, false]); // 105 again is not a new record
});

test('a workout that is not finished has no history detail', async () => {
  const { db } = await threeWeeks();
  const { startWorkout } = await import('../www/js/services/workout-service.js');
  const started = await startWorkout(db, at(2026, 10, 12));
  assert.equal(started.ok, true);
  assert.equal(await loadSessionDetail(db, started.sessionId, NOW), null);
  assert.equal(await loadSessionDetail(db, 9999, NOW), null);
});

test('exercise history: records, chart, and sessions newest first', async () => {
  const { db, w3 } = await threeWeeks();
  const [bench] = await W.getSessionExercises(db, w3.sessionId);
  const h = await loadExerciseHistory(db, bench.id);

  assert.equal(h.name, 'Bench Press');
  assert.deepEqual(h.sessions.map((s) => s.date), ['2026-10-05', '2026-09-28', '2026-09-21']);
  assert.equal(h.sessions[0].sets.length, 3);
  assert.deepEqual(h.analysis.heaviest, { weight: 105, reps: 9, date: '2026-10-05' });
  assert.deepEqual(h.analysis.chart.map((p) => p.value), [100, 105, 105]);
  assert.deepEqual(h.analysis.repsAtWeight.map((r) => [r.weight, r.reps]), [[105, 9], [100, 10]]);
  // Warm-ups are not part of an exercise's records.
  assert.equal(h.analysis.repsAtWeight.some((r) => r.weight === 50), false);
  assert.deepEqual(h.program && [h.program.weight, h.program.unit, h.program.dayName], [100, 'lbs', 'Push']);
  assert.equal(await loadExerciseHistory(db, 99999), null);
});

test('changing the program never rewrites history', async () => {
  const { db, benchPe, w1, w3 } = await threeWeeks();
  const before = await loadSessionDetail(db, w1.sessionId, NOW);

  await saveProgramExercise(db, benchPe, {
    workingWeight: 200,
    weightUnit: 'lbs',
    restSeconds: 90,
    notes: '',
    workingSets: [{ min: 3, max: 5 }],
    warmupSets: [],
  });

  const after = await loadSessionDetail(db, w1.sessionId, NOW);
  assert.deepEqual(after.exercises.map((e) => e.working.map((s) => [s.weight, s.reps])), before.exercises.map((e) => e.working.map((s) => [s.weight, s.reps])));
  assert.equal(after.exercises[0].targetWeight, 100);

  // The history screen shows the NEW program weight next to the OLD, untouched sets.
  const [bench] = await W.getSessionExercises(db, w3.sessionId);
  const h = await loadExerciseHistory(db, bench.id);
  assert.equal(h.program.weight, 200);
  assert.deepEqual(h.analysis.chart.map((p) => p.value), [100, 105, 105]);

  // Committing a new weight through progression does not touch it either.
  const r = await commitWorkingWeight(db, bench.id, 110);
  assert.equal(r.ok, true);
  assert.deepEqual((await loadExerciseHistory(db, bench.id)).analysis.chart.map((p) => p.value), [100, 105, 105]);
});

test('history survives removing the exercise from the program and deleting it from the library', async () => {
  const { db, w3 } = await threeWeeks();
  const [bench] = await W.getSessionExercises(db, w3.sessionId);
  await db.run('DELETE FROM program_exercises');
  await db.run('DELETE FROM exercises WHERE id = ?', [bench.libraryId]);

  const h = await loadExerciseHistory(db, bench.id);
  assert.equal(h.name, 'Bench Press');
  assert.equal(h.sessions.length, 3);
  assert.equal(h.program, null);

  const overview = await loadProgressOverview(db, NOW);
  assert.ok(overview.exercises.some((e) => e.name === 'Bench Press'));
});

test('progress overview: totals, recent workouts, and the exercise list', async () => {
  const { db } = await threeWeeks();
  const o = await loadProgressOverview(db, NOW);
  assert.equal(o.workouts, 3);
  assert.equal(o.currentStreak, 3);
  assert.equal(o.bestStreak, 3);
  assert.deepEqual(o.recent.map((s) => s.date), ['2026-10-05', '2026-09-28', '2026-09-21']);
  assert.equal(o.recent[0].workingSets, 3);
  assert.equal(o.recent[2].workingSets, 6);
  assert.ok(o.recent[0].durationMs > 0);
  assert.deepEqual(o.exercises.map((e) => [e.name, e.sessions, e.topWeight]), [['Bench Press', 3, 105], ['Shoulder Press', 2, 60]]);
});

test('history pages: newest first, with a correct "has more"', async () => {
  const { db } = await threeWeeks();
  const p1 = await loadHistoryPage(db, { limit: 2, offset: 0 }, NOW);
  assert.deepEqual([p1.sessions.map((s) => s.date), p1.total, p1.hasMore], [['2026-10-05', '2026-09-28'], 3, true]);
  const p2 = await loadHistoryPage(db, { limit: 2, offset: 2 }, NOW);
  assert.deepEqual([p2.sessions.map((s) => s.date), p2.hasMore], [['2026-09-21'], false]);
});

test('an empty history is empty, not an error', async () => {
  const db = await setupDb();
  const o = await loadProgressOverview(db, NOW);
  assert.deepEqual([o.workouts, o.recent, o.exercises, o.currentStreak, o.bestStreak], [0, [], [], 0, 0]);
  assert.deepEqual((await loadHistoryPage(db, {}, NOW)).sessions, []);
});

test('rep charts use whole-number gridlines', () => {
  const a = computeAxis([7, 8, 9], { integers: true });
  assert.ok(a.ticks.every((t) => Number.isInteger(t)));
  assert.ok(a.min <= 7 && a.max >= 9);
});
