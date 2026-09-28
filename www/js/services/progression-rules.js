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
 * Returns { state, totalSets, doneSets, liftedWeight, suggestedWeight }, plus, once every set is
 * done, `sets` ([{ weight, reps, targetWeight }] in order) and the rep range `targetRepMin` /
 * `targetRepMax`, so the UI can explain how each set went.
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

  const result = {
    ...base,
    liftedWeight: lifted,
    sets: done.map((s) => ({ weight: Number(s.weight), reps: s.reps, targetWeight: Number(s.targetWeight ?? 0) })),
    targetRepMin: Math.min(...done.map((s) => (Number.isInteger(s.targetRepMin) ? s.targetRepMin : s.targetRepMax))),
    targetRepMax: Math.max(...done.map((s) => s.targetRepMax)),
  };
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

// ---- "Keep pushing" wording ----------------------------------------------------------

/**
 * The goal sentence on a card where the top of the rep range wasn't reached.
 * Same facts every time, worded a few different ways. The wording is picked from
 * `seed` (exercise name + what was lifted), so it doesn't change when the screen redraws.
 * `reps` and `sets` are counts, `weight` is like "30 lbs", `range` is like "8–12".
 */
export const GOAL_TEMPLATES = [
  ({ reps, sets, weight, range }) => `Keep pushing! To move up, hit ${reps} on all ${sets} sets at ${weight}. Your target range is ${range} reps.`,
  ({ reps, sets, weight, range }) => `Almost there! Get ${reps} on every one of your ${sets} sets at ${weight} and you’re ready to level up. The range you’re working in is ${range} reps.`,
  ({ reps, sets, weight, range }) => `You’re building strength. Your next goal: ${reps} on all ${sets} sets at ${weight}. Stay within ${range} reps and the weight will go up soon.`,
  ({ reps, sets, weight, range }) => `Good effort! Reach ${reps} on each of ${sets} sets at ${weight} to earn your next weight increase. Target range: ${range} reps.`,
  ({ reps, sets, weight, range }) => `Stay with it. Once all ${sets} sets hit ${reps} at ${weight}, you move up. Keep your reps inside ${range}.`,
  ({ reps, sets, weight, range }) => `One step at a time. Aim for ${reps} across all ${sets} sets at ${weight}, and keep working in the ${range} rep range.`,
];

function hashSeed(seed) {
  let hash = 0;
  for (const ch of String(seed)) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return hash;
}

export function goalMessage({ reps, sets, weight, range, seed = '' }) {
  const template = GOAL_TEMPLATES[hashSeed(seed) % GOAL_TEMPLATES.length];
  return template({ reps, sets, weight, range });
}