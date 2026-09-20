import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bmiCategory,
  bodyweightChartPoints,
  calculateBmi,
  cmToFeetInches,
  convertBodyweight,
  describeBmi,
  feetInchesToCm,
  formatChange,
  formatHeight,
  summarizeBodyweight,
  toDisplayRecords,
  validateBodyweightEntry,
  validateHeightCm,
} from '../www/js/services/profile-rules.js';
import {
  loadBodyweightOverview,
  loadProfile,
  logBodyweight,
  removeBodyweight,
  saveHeight,
  saveHeightUnit,
  saveWeightUnit,
} from '../www/js/services/profile-service.js';
import { getProgramDefaults } from '../www/js/services/program-service.js';
import { saveWeightIncrement } from '../www/js/services/progression-service.js';
import { at, logWorkout, planDay, setupDb } from './helpers/scenario.js';

const NOW = new Date(2026, 9, 5, 12, 0);

// ---- Pure rules ---------------------------------------------------------------

test('BMI: weight in kg over height in metres squared, one decimal', () => {
  assert.equal(calculateBmi(70, 175), 22.9);
  assert.equal(calculateBmi(90, 170), 31.1);
  assert.equal(calculateBmi(0, 175), null);
  assert.equal(calculateBmi(70, null), null);
});

test('BMI categories use the standard adult cut-offs on the number shown', () => {
  assert.equal(bmiCategory(18.4), 'below');
  assert.equal(bmiCategory(18.5), 'within');
  assert.equal(bmiCategory(24.9), 'within');
  assert.equal(bmiCategory(25), 'above');
  assert.equal(bmiCategory(31.1), 'above');
});

test('BMI guidance is gentle and always carries the screening disclaimer', () => {
  const below = describeBmi(17.2);
  assert.match(below.suggestion, /gradually increasing your calorie intake/);
  const above = describeBmi(27);
  assert.match(above.suggestion, /sustainable calorie deficit/);
  for (const bmi of [17.2, 22, 27]) {
    const d = describeBmi(bmi);
    assert.match(d.disclaimer, /not a medical diagnosis/);
    assert.match(d.disclaimer, /muscle mass/);
  }
});

test('height converts between cm and feet/inches', () => {
  assert.deepEqual(cmToFeetInches(170), { feet: 5, inches: 7 });
  assert.deepEqual(cmToFeetInches(182.9), { feet: 6, inches: 0 });
  assert.equal(feetInchesToCm(5, 7), 170.2);
  assert.equal(formatHeight(170, 'ft'), '5′ 7″');
  assert.equal(formatHeight(170.2, 'cm'), '170.2 cm');
  assert.equal(formatHeight(null, 'cm'), '');
});

test('height must be a plausible adult height', () => {
  assert.equal(validateHeightCm(170).ok, true);
  assert.equal(validateHeightCm(99).ok, false);
  assert.equal(validateHeightCm(251).ok, false);
  assert.equal(validateHeightCm('abc').ok, false);
});

test('bodyweight converts between units, rounded to 0.1', () => {
  assert.equal(convertBodyweight(72, 'kg', 'kg'), 72);
  assert.equal(convertBodyweight(72, 'kg', 'lbs'), 158.7);
  assert.equal(convertBodyweight(160, 'lbs', 'kg'), 72.6);
});

test('bodyweight entries are validated', () => {
  const today = '2026-10-05';
  assert.deepEqual(validateBodyweightEntry({ weight: 72.14, unit: 'kg', date: '2026-10-05' }, today), {
    ok: true,
    value: { weight: 72.1, unit: 'kg', date: '2026-10-05' },
  });
  assert.equal(validateBodyweightEntry({ weight: 10, unit: 'kg', date: today }, today).ok, false);
  assert.equal(validateBodyweightEntry({ weight: 500, unit: 'kg', date: today }, today).ok, false);
  assert.equal(validateBodyweightEntry({ weight: 0, unit: 'lbs', date: today }, today).ok, false);
  assert.equal(validateBodyweightEntry({ weight: 72, unit: 'kg', date: '2026-10-06' }, today).ok, false);
  assert.equal(validateBodyweightEntry({ weight: 72, unit: 'kg', date: '' }, today).ok, false);
  assert.equal(validateBodyweightEntry({ weight: 72, unit: 'stone', date: today }, today).ok, false);
});

test('records convert to the display unit, chart points count days from the first', () => {
  const stored = [
    { id: 1, date: '2026-09-01', weight: 72.1, unit: 'kg' },
    { id: 2, date: '2026-09-08', weight: 160, unit: 'lbs' },
  ];
  const kg = toDisplayRecords(stored, 'kg');
  assert.deepEqual(kg.map((r) => r.weight), [72.1, 72.6]);
  const points = bodyweightChartPoints(kg, (d) => d);
  assert.deepEqual(points.map((p) => p.x), [0, 7]);
  assert.deepEqual(bodyweightChartPoints([], (d) => d), []);
});

test('bodyweight summary gives latest and change since the first entry', () => {
  assert.equal(summarizeBodyweight([]), null);
  const one = summarizeBodyweight([{ date: '2026-09-01', weight: 72 }]);
  assert.equal(one.change, null);
  const s = summarizeBodyweight([
    { date: '2026-09-01', weight: 72.1 },
    { date: '2026-09-08', weight: 72.8 },
    { date: '2026-09-15', weight: 73.4 },
  ]);
  assert.equal(s.latest.weight, 73.4);
  assert.equal(s.change, 1.3);
  assert.equal(formatChange(1.3, 'kg'), '+1.3 kg');
  assert.equal(formatChange(-0.5, 'kg'), '−0.5 kg');
  assert.equal(formatChange(0, 'kg'), 'No change');
});

// ---- Service ---------------------------------------------------------------------

test('an empty profile has no height, no bodyweight, and no BMI', async () => {
  const db = await setupDb();
  const p = await loadProfile(db);
  assert.equal(p.heightCm, null);
  assert.equal(p.summary, null);
  assert.equal(p.bmi, null);
  assert.equal(p.heightUnit, 'cm');
  assert.equal(p.unit, 'lbs');
});

test('height is saved, survives, and rejects nonsense', async () => {
  const db = await setupDb();
  assert.equal((await saveHeight(db, 175)).ok, true);
  assert.equal((await loadProfile(db)).heightCm, 175);
  assert.equal((await saveHeight(db, 20)).ok, false);
  assert.equal((await loadProfile(db)).heightCm, 175);
  assert.equal((await saveHeightUnit(db, 'ft')).ok, true);
  assert.equal((await loadProfile(db)).heightUnit, 'ft');
  assert.equal((await saveHeightUnit(db, 'furlongs')).ok, false);
});

test('logging bodyweight stores it in the current unit; one entry per day', async () => {
  const db = await setupDb();
  await saveWeightUnit(db, 'kg');
  const first = await logBodyweight(db, { weight: 72.1, date: '2026-10-01' }, NOW);
  assert.deepEqual([first.ok, first.replaced], [true, false]);
  const again = await logBodyweight(db, { weight: 72.4, date: '2026-10-01' }, NOW);
  assert.equal(again.replaced, true);
  const overview = await loadBodyweightOverview(db);
  assert.equal(overview.records.length, 1);
  assert.equal(overview.records[0].weight, 72.4);
});

test('bodyweight defaults to today and rejects future dates', async () => {
  const db = await setupDb();
  await logBodyweight(db, { weight: 160 }, NOW);
  const { records } = await loadBodyweightOverview(db);
  assert.equal(records[0].date, '2026-10-05');
  const future = await logBodyweight(db, { weight: 160, date: '2026-10-06' }, NOW);
  assert.equal(future.ok, false);
  assert.equal((await loadBodyweightOverview(db)).records.length, 1);
});

test('records come back oldest first, chart-ready, and can be deleted', async () => {
  const db = await setupDb();
  await logBodyweight(db, { weight: 160, date: '2026-09-15' }, NOW);
  await logBodyweight(db, { weight: 158, date: '2026-09-01' }, NOW);
  await logBodyweight(db, { weight: 159, date: '2026-09-08' }, NOW);
  const o = await loadBodyweightOverview(db);
  assert.deepEqual(o.records.map((r) => r.date), ['2026-09-01', '2026-09-08', '2026-09-15']);
  assert.deepEqual(o.points.map((p) => p.x), [0, 7, 14]);
  assert.equal(o.summary.change, 2);
  await removeBodyweight(db, o.records[1].id);
  assert.equal((await loadBodyweightOverview(db)).records.length, 2);
});

test('BMI uses the latest bodyweight and height, whatever unit each was logged in', async () => {
  const db = await setupDb();
  await saveHeight(db, 175);
  await logBodyweight(db, { weight: 154.3, date: '2026-09-01' }, NOW); // lbs, about 70 kg
  let p = await loadProfile(db);
  assert.equal(p.bmi.bmi, 22.9);
  assert.equal(p.bmi.category, 'within');

  await saveWeightUnit(db, 'kg');
  await logBodyweight(db, { weight: 95, date: '2026-09-20' }, NOW);
  p = await loadProfile(db);
  assert.equal(p.unit, 'kg');
  assert.equal(p.bmi.bmi, 31);
  assert.equal(p.bmi.category, 'above');
  // Earlier lbs entry is shown converted, not changed in the database.
  assert.equal(p.records[0].unit, 'kg');
  assert.equal(p.records[0].weight, 70);
  const stored = await db.get('SELECT weight, unit FROM bodyweight_records WHERE recorded_on = ?', ['2026-09-01']);
  assert.deepEqual({ ...stored }, { weight: 154.3, unit: 'lbs' });
});

test('no BMI without a height or without a bodyweight', async () => {
  const db = await setupDb();
  await logBodyweight(db, { weight: 160, date: '2026-09-01' }, NOW);
  assert.equal((await loadProfile(db)).bmi, null);
  const db2 = await setupDb();
  await saveHeight(db2, 175);
  assert.equal((await loadProfile(db2)).bmi, null);
});

test('changing the weight unit resets the increment and leaves the program and history alone', async () => {
  const db = await setupDb();
  const [pid] = await planDay(db, 1, [{ name: 'Bench Press', weight: 100, unit: 'lbs' }]);
  await logWorkout(db, at(2026, 9, 7), { 'Bench Press': [[100, 12], [100, 12], [100, 12]] });
  await saveWeightIncrement(db, 10);

  const before = {
    program: await db.get('SELECT working_weight, weight_unit FROM program_exercises WHERE id = ?', [pid]),
    sets: await db.all('SELECT weight, reps, weight_unit FROM workout_sets ORDER BY id'),
  };

  const r = await saveWeightUnit(db, 'kg');
  assert.deepEqual([r.ok, r.changed, r.increment], [true, true, 2.5]);
  const d = await getProgramDefaults(db);
  assert.deepEqual([d.unit, d.increment], ['kg', 2.5]);

  assert.deepEqual(await db.get('SELECT working_weight, weight_unit FROM program_exercises WHERE id = ?', [pid]), before.program);
  assert.deepEqual(await db.all('SELECT weight, reps, weight_unit FROM workout_sets ORDER BY id'), before.sets);

  // Choosing the same unit again changes nothing, including a custom increment.
  await saveWeightIncrement(db, 1);
  const same = await saveWeightUnit(db, 'kg');
  assert.equal(same.changed, false);
  assert.equal((await getProgramDefaults(db)).increment, 1);
  assert.equal((await saveWeightUnit(db, 'stone')).ok, false);
});

test('logging bodyweight never touches workouts or the program', async () => {
  const db = await setupDb();
  await planDay(db, 1, [{ name: 'Bench Press', weight: 100 }]);
  await logWorkout(db, at(2026, 9, 7), { 'Bench Press': [[100, 10], [100, 9], [100, 8]] });
  const snapshot = async () => ({
    sessions: await db.all('SELECT * FROM workout_sessions'),
    sets: await db.all('SELECT * FROM workout_sets'),
    program: await db.all('SELECT * FROM program_exercises'),
  });
  const before = await snapshot();
  await logBodyweight(db, { weight: 160, date: '2026-09-07' }, NOW);
  await saveHeight(db, 180);
  assert.deepEqual(await snapshot(), before);
});
