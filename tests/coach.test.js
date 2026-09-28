import test from 'node:test';
import assert from 'node:assert/strict';
import { QUOTES, quoteForDate, repsTip, weightTip, workoutTip } from '../www/js/services/coach-rules.js';
import { loadCoachTips } from '../www/js/services/coach-service.js';
import { setupDb } from './helpers/scenario.js';

const sets = (...reps) => reps.map((r) => ({ kind: 'working', completed: true, reps: r }));

test('quote is stable within a day and changes the next day', () => {
  const a = quoteForDate(new Date(2026, 8, 28, 8));
  assert.equal(a, quoteForDate(new Date(2026, 8, 28, 22)));
  assert.notEqual(a, quoteForDate(new Date(2026, 8, 29, 8)));
  assert.ok(QUOTES.includes(a));
});

test('weight tips: none, below, within, above', () => {
  assert.match(weightTip(null).title, /Get weight guidance/);
  assert.match(weightTip('below').body, /protein/);
  assert.match(weightTip('within').title, /standard range/);
  assert.match(weightTip('above').body, /calorie deficit/);
});

test('uneven reps are flagged with the numbers, even reps are praised', () => {
  const uneven = repsTip([{ name: 'Bench Press', sets: sets(12, 9, 6) }]);
  assert.match(uneven.title, /Bench Press/);
  assert.match(uneven.body, /12, 9, 6/);
  assert.match(repsTip([{ name: 'Squat', sets: sets(10, 9, 9) }]).title, /even/);
  assert.match(repsTip([]).title, /first workout/);
});

test('workout tip: never trained, stale muscle, rest day, balanced', () => {
  const todayKey = '2026-09-28';
  const muscles = [
    { muscle: 'Back', lastDate: '2026-09-15', exercises: ['Barbell Row', 'Lat Pulldown'] },
    { muscle: 'Chest', lastDate: '2026-09-27', exercises: ['Bench Press'] },
  ];
  assert.match(workoutTip({ muscles, workouts: 0, isRestDay: false, todayKey }).title, /Start simple/);
  const stale = workoutTip({ muscles, workouts: 5, isRestDay: false, todayKey });
  assert.match(stale.title, /back/);
  assert.match(stale.body, /13 days/);
  assert.match(stale.body, /Barbell Row or Lat Pulldown/);
  const fresh = muscles.map((m) => ({ ...m, lastDate: '2026-09-27' }));
  assert.match(workoutTip({ muscles: fresh, workouts: 5, isRestDay: true, todayKey }).title, /recovery/);
  assert.match(workoutTip({ muscles: fresh, workouts: 5, isRestDay: false, todayKey }).title, /Balanced/);
});

test('loadCoachTips returns four tips on a fresh database', async () => {
  const db = await setupDb();
  const tips = await loadCoachTips(db, { now: new Date(2026, 8, 28, 9) });
  assert.deepEqual(tips.map((t) => t.id), ['quote', 'weight', 'reps', 'workout']);
  assert.match(tips[1].title, /Get weight guidance/);
  assert.match(tips[3].title, /Start simple/);
});