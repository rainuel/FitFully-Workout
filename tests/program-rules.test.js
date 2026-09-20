import test from 'node:test';
import assert from 'node:assert/strict';
import {
  convertWeight,
  isUniformSets,
  roundToStep,
  stepForUnit,
  suggestWarmup,
  summarizeSets,
  validateDayInput,
  validateProgramExerciseDraft,
} from '../www/js/services/program-rules.js';
import { formatRepTarget, formatRest, formatWeight, formatWeightWithUnit } from '../www/js/utils/format.js';

const goodDraft = () => ({
  workingWeight: 30,
  weightUnit: 'lbs',
  restSeconds: 90,
  notes: '  slow negatives ',
  workingSets: [{ min: 8, max: 12 }, { min: 8, max: 12 }, { min: 8, max: 12 }],
  warmupSets: [{ reps: 10, weight: 20 }],
});

test('formatting: weights, rest, and rep targets', () => {
  assert.equal(formatWeight(30), '30');
  assert.equal(formatWeight(27.5), '27.5');
  assert.equal(formatWeight(27.500000001), '27.5');
  assert.equal(formatWeightWithUnit(30, 'lbs'), '30 lbs');
  assert.equal(formatWeightWithUnit(0, 'kg'), 'Bodyweight');
  assert.equal(formatRest(90), '1:30');
  assert.equal(formatRest(45), '0:45');
  assert.equal(formatRest(180), '3:00');
  assert.equal(formatRepTarget(8, 12), '8–12');
  assert.equal(formatRepTarget(10, 10), '10');
});

test('sets summarise as "3 × 8–12", "3 × 10", or per-set when they differ', () => {
  assert.equal(summarizeSets([{ min: 8, max: 12 }, { min: 8, max: 12 }, { min: 8, max: 12 }]), '3 × 8–12');
  assert.equal(summarizeSets([{ min: 10, max: 10 }, { min: 10, max: 10 }]), '2 × 10');
  assert.equal(summarizeSets([{ min: 12, max: 12 }, { min: 10, max: 10 }, { min: 8, max: 8 }]), '12 · 10 · 8');
  assert.equal(isUniformSets([]), false);
});

test('weight step uses the configured increment only for the preferred unit', () => {
  const prefs = { unit: 'lbs', increment: 2.5 };
  assert.equal(stepForUnit('lbs', prefs), 2.5);
  assert.equal(stepForUnit('kg', prefs), 2.5);
  assert.equal(stepForUnit('kg', { unit: 'lbs', increment: 5 }), 2.5);
  assert.equal(stepForUnit('lbs', { unit: 'kg', increment: 1 }), 5);
  assert.equal(stepForUnit('kg', { unit: 'kg', increment: 1 }), 1);
});

test('unit conversion rounds to the nearest half', () => {
  assert.equal(convertWeight(30, 'lbs', 'kg'), 13.5);
  assert.equal(convertWeight(20, 'kg', 'lbs'), 44);
  assert.equal(convertWeight(30, 'lbs', 'lbs'), 30);
  assert.equal(convertWeight(0, 'kg', 'lbs'), 0);
  assert.equal(roundToStep(27.4, 2.5), 27.5);
});

test('warm-up suggestions ramp up toward the working weight', () => {
  assert.deepEqual(suggestWarmup(100, 0, 5), { weight: 50, reps: 10 });
  assert.deepEqual(suggestWarmup(100, 1, 5), { weight: 75, reps: 5 });
  assert.deepEqual(suggestWarmup(100, 5, 5), { weight: 90, reps: 3 });
  assert.deepEqual(suggestWarmup(0, 0, 5), { weight: 0, reps: 10 });
});

test('a valid draft passes and is cleaned', () => {
  const r = validateProgramExerciseDraft(goodDraft());
  assert.equal(r.ok, true);
  assert.equal(r.value.notes, 'slow negatives');
  assert.equal(r.value.workingSets.length, 3);
});

test('empty notes become null', () => {
  const r = validateProgramExerciseDraft({ ...goodDraft(), notes: '   ' });
  assert.equal(r.value.notes, null);
});

test('rep ranges: top can not be below bottom, reps must be whole numbers in range', () => {
  const bad = (sets) => validateProgramExerciseDraft({ ...goodDraft(), workingSets: sets });
  assert.equal(bad([{ min: 12, max: 8 }]).ok, false);
  assert.equal(bad([{ min: 0, max: 5 }]).ok, false);
  assert.equal(bad([{ min: 5, max: 101 }]).ok, false);
  assert.equal(bad([{ min: 5.5, max: 8 }]).ok, false);
  assert.equal(bad([]).ok, false);
  assert.equal(bad(Array.from({ length: 11 }, () => ({ min: 8, max: 12 }))).ok, false);
  assert.equal(bad([{ min: 10, max: 10 }]).ok, true, 'exact reps are a range where min = max');
});

test('weight, unit, rest, and warm-ups are validated', () => {
  const d = goodDraft();
  assert.equal(validateProgramExerciseDraft({ ...d, weightUnit: 'stone' }).ok, false);
  assert.equal(validateProgramExerciseDraft({ ...d, workingWeight: -1 }).ok, false);
  assert.equal(validateProgramExerciseDraft({ ...d, workingWeight: NaN }).ok, false);
  assert.equal(validateProgramExerciseDraft({ ...d, workingWeight: 0 }).ok, true, 'bodyweight exercises use 0');
  assert.equal(validateProgramExerciseDraft({ ...d, restSeconds: 5 }).ok, false);
  assert.equal(validateProgramExerciseDraft({ ...d, restSeconds: 601 }).ok, false);
  assert.equal(validateProgramExerciseDraft({ ...d, warmupSets: [{ reps: 0, weight: 10 }] }).ok, false);
  assert.equal(validateProgramExerciseDraft({ ...d, warmupSets: [{ reps: 5, weight: -5 }] }).ok, false);
  const many = Array.from({ length: 7 }, () => ({ reps: 5, weight: 10 }));
  assert.equal(validateProgramExerciseDraft({ ...d, warmupSets: many }).ok, false);
});

test('day input: training days need a name, rest days do not', () => {
  assert.equal(validateDayInput({ name: '  ', isRest: false }).ok, false);
  assert.equal(validateDayInput({ name: 'x'.repeat(25), isRest: false }).ok, false);
  assert.deepEqual(validateDayInput({ name: ' Push ', isRest: false }).value, { name: 'Push', isRest: false });
  assert.deepEqual(validateDayInput({ name: '', isRest: true }).value, { name: 'Rest', isRest: true });
});
