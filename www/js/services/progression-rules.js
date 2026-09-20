// Progression rules (double progression). Pure functions: no DOM, no database.
//
// A working weight is ready to go up when EVERY working set of an exercise was
// completed at (or above) the planned weight and reached the TOP of its rep
// range. Anything less keeps the weight where it is. Nothing here ever lowers
// a weight or changes a program: it only describes what happened.

import { roundWeight } from './program-rules.js';

export const MAX_INCREMENT = 100;

export const INCREMENT_PRESETS = {
  lbs: [2.5, 5, 10],
  kg: [1, 1.25, 2.5, 5],
};

/** True when a logged working set reached the top of its rep range at its planned weight. */
export function hitTopOfRange(set) {
  if (!set.completed || !Number.isInteger(set.reps) || !Number.isInteger(set.targetRepMax)) return false;
  return set.reps >= set.targetRepMax && Number(set.weight) >= Number(set.targetWeight ?? 0);
}

/** The next weight to suggest: the weight actually lifted plus the user's increment. */
export function nextWeight(liftedWeight, increment) {
  return roundWeight(Number(liftedWeight) + Number(increment));
}

/**
 * Looks at one exercise's sets and says how progression stands.
 *
 * state:
 *   not_applicable  nothing to progress (no working sets, or a bodyweight exercise)
 *   incomplete      some working sets were not done, so there is nothing to judge yet
 *   not_reached     every set was done but the top of the range was not reached everywhere
 *   eligible        every set was done at the top of its range
 *
 * Only completed working sets are examined; warm-ups are ignored.
 * Returns { state, totalSets, doneSets, liftedWeight, suggestedWeight }.
 */
export function evaluateProgression({ sets, increment }) {
  const working = sets.filter((s) => s.kind === 'working');
  const done = working.filter((s) => s.completed);
  const base = { totalSets: working.length, doneSets: done.length, liftedWeight: null, suggestedWeight: null };

  if (working.length === 0) return { ...base, state: 'not_applicable' };
  if (done.length < working.length) return { ...base, state: 'incomplete' };

  const lifted = Math.min(...done.map((s) => Number(s.weight)));
  if (!(lifted > 0) || working.some((s) => !Number.isInteger(s.targetRepMax))) {
    return { ...base, state: 'not_applicable' };
  }

  const result = { ...base, liftedWeight: lifted };
  if (done.every(hitTopOfRange)) {
    return { ...result, state: 'eligible', suggestedWeight: nextWeight(lifted, increment) };
  }
  return { ...result, state: 'not_reached' };
}

/** Checks a weight increment typed or picked by the user. */
export function validateIncrement(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0 || n > MAX_INCREMENT) {
    return { ok: false, errors: [`The increment must be more than 0 and at most ${MAX_INCREMENT}.`] };
  }
  return { ok: true, value: roundWeight(n) };
}
