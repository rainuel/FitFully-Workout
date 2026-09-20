// Program rules: validation, rep targets, weight steps, and summaries.
// Pure functions only (no DOM, no database) so they are easy to test and reuse
// from the workout and progression code in later phases.

import { formatRepTarget, formatRest, formatWeightWithUnit } from '../utils/format.js';

export const UNITS = ['kg', 'lbs'];

export const LIMITS = {
  maxWorkingSets: 10,
  maxWarmupSets: 6,
  minReps: 1,
  maxReps: 100,
  minRestSeconds: 15,
  maxRestSeconds: 600,
  restStepSeconds: 15,
  maxWeight: 2000,
  maxNotesLength: 500,
  maxDayNameLength: 24,
};

export const DEFAULT_WORKING_SETS = 3;
export const DEFAULT_REP_MIN = 8;
export const DEFAULT_REP_MAX = 12;

const LBS_PER_KG = 2.2046226218;

export function roundWeight(value) {
  return Math.round(value * 100) / 100;
}

export function roundToStep(value, step) {
  if (!(step > 0)) return roundWeight(value);
  return roundWeight(Math.round(value / step) * step);
}

/**
 * How much the +/- buttons change a weight. Uses the user's configured
 * increment when the exercise uses their preferred unit; otherwise a sensible
 * default for that unit (a 5 lbs increment must not become 5 kg).
 */
export function stepForUnit(unit, prefs = {}) {
  if (unit === prefs.unit && prefs.increment > 0) return prefs.increment;
  return unit === 'kg' ? 2.5 : 5;
}

/** Converts between kg and lbs, rounded to the nearest 0.5. */
export function convertWeight(value, from, to) {
  if (from === to || !value) return value;
  const converted = from === 'kg' ? value * LBS_PER_KG : value / LBS_PER_KG;
  return Math.round(converted * 2) / 2;
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/** True when every working set has the same target (the "3 × 8–12" case). */
export function isUniformSets(sets) {
  return sets.length > 0 && sets.every((s) => s.min === sets[0].min && s.max === sets[0].max);
}

/** "3 × 8–12", "3 × 10", or "12 · 10 · 8" when sets differ. */
export function summarizeSets(sets) {
  if (sets.length === 0) return 'No sets';
  if (isUniformSets(sets)) return `${sets.length} × ${formatRepTarget(sets[0].min, sets[0].max)}`;
  return sets.map((s) => formatRepTarget(s.min, s.max)).join(' · ');
}

/** Short lines for a program exercise: { target, weight, rest, warmups }. */
export function summarizeProgramExercise(pe) {
  const warmups = pe.warmupSets.length;
  return {
    target: summarizeSets(pe.workingSets),
    weight: formatWeightWithUnit(pe.workingWeight, pe.weightUnit),
    rest: `Rest ${formatRest(pe.restSeconds)}`,
    warmups: warmups === 0 ? null : `${warmups} warm-up${warmups === 1 ? '' : 's'}`,
  };
}

/** A starting point for a new warm-up set: lighter than the working weight, ramping up. */
export function suggestWarmup(workingWeight, index, step) {
  const fractions = [0.5, 0.75, 0.9];
  const reps = [10, 5, 3];
  const i = Math.min(index, fractions.length - 1);
  const weight = workingWeight > 0 ? roundToStep(workingWeight * fractions[i], step) : 0;
  return { weight, reps: reps[i] };
}

function isWholeNumber(n) {
  return typeof n === 'number' && Number.isInteger(n);
}

function isWeight(n) {
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= LIMITS.maxWeight;
}

/**
 * Validates a program-exercise draft:
 *   { workingWeight, weightUnit, restSeconds, notes,
 *     workingSets: [{ min, max }], warmupSets: [{ reps, weight }] }
 * Returns { ok, errors, value } where value is the cleaned draft.
 */
export function validateProgramExerciseDraft(draft) {
  const errors = [];

  if (!UNITS.includes(draft.weightUnit)) errors.push('Choose kg or lbs.');
  if (!isWeight(draft.workingWeight)) errors.push(`Working weight must be between 0 and ${LIMITS.maxWeight}.`);

  if (
    !isWholeNumber(draft.restSeconds) ||
    draft.restSeconds < LIMITS.minRestSeconds ||
    draft.restSeconds > LIMITS.maxRestSeconds
  ) {
    errors.push(`Rest must be between ${formatRest(LIMITS.minRestSeconds)} and ${formatRest(LIMITS.maxRestSeconds)}.`);
  }

  const working = draft.workingSets ?? [];
  if (working.length < 1 || working.length > LIMITS.maxWorkingSets) {
    errors.push(`An exercise needs between 1 and ${LIMITS.maxWorkingSets} working sets.`);
  }
  working.forEach((s, i) => {
    const valid =
      isWholeNumber(s.min) &&
      isWholeNumber(s.max) &&
      s.min >= LIMITS.minReps &&
      s.max <= LIMITS.maxReps &&
      s.min <= s.max;
    if (!valid) errors.push(`Set ${i + 1}: reps must be whole numbers from ${LIMITS.minReps} to ${LIMITS.maxReps}, and the top of the range can't be below the bottom.`);
  });

  const warmups = draft.warmupSets ?? [];
  if (warmups.length > LIMITS.maxWarmupSets) errors.push(`Use at most ${LIMITS.maxWarmupSets} warm-up sets.`);
  warmups.forEach((s, i) => {
    if (!isWholeNumber(s.reps) || s.reps < LIMITS.minReps || s.reps > LIMITS.maxReps) {
      errors.push(`Warm-up ${i + 1}: reps must be a whole number from ${LIMITS.minReps} to ${LIMITS.maxReps}.`);
    }
    if (!isWeight(s.weight)) errors.push(`Warm-up ${i + 1}: weight must be between 0 and ${LIMITS.maxWeight}.`);
  });

  const notes = (draft.notes ?? '').trim();
  if (notes.length > LIMITS.maxNotesLength) errors.push(`Notes can be at most ${LIMITS.maxNotesLength} characters.`);

  if (errors.length > 0) return { ok: false, errors, value: null };

  return {
    ok: true,
    errors: [],
    value: {
      workingWeight: roundWeight(draft.workingWeight),
      weightUnit: draft.weightUnit,
      restSeconds: draft.restSeconds,
      notes: notes === '' ? null : notes,
      workingSets: working.map((s) => ({ min: s.min, max: s.max })),
      warmupSets: warmups.map((s) => ({ reps: s.reps, weight: roundWeight(s.weight) })),
    },
  };
}

/** Validates a day edit: { name, isRest }. Rest days keep any name; training days need one. */
export function validateDayInput({ name, isRest }) {
  const trimmed = (name ?? '').trim();
  if (isRest) return { ok: true, errors: [], value: { name: trimmed === '' ? 'Rest' : trimmed, isRest: true } };
  if (trimmed === '') return { ok: false, errors: ['Give this day a name, like Push or Upper.'], value: null };
  if (trimmed.length > LIMITS.maxDayNameLength) {
    return { ok: false, errors: [`Day names can be at most ${LIMITS.maxDayNameLength} characters.`], value: null };
  }
  return { ok: true, errors: [], value: { name: trimmed, isRest: false } };
}
