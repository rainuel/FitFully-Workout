// Workout rules: clock and rest-timer maths, set validation, and summaries.
// Pure functions only (no DOM, no database), so they are easy to test.
//
// All timestamps here are epoch milliseconds, except `startedAt` / `finishedAt`
// which are ISO strings (that is how the database stores them).

import { LIMITS, clamp } from './program-rules.js';
import { formatRepTarget, formatWeight } from '../utils/format.js';

export const REST_MAX_MS = 15 * 60 * 1000;
export const REST_STEP_MS = 15 * 1000;

// The longer break after finishing all the sets of an exercise, before the next one.
export const BREAK_OPTIONS = [
  { seconds: 0, label: 'Off' },
  { seconds: 5 * 60, label: '5 min' },
  { seconds: 10 * 60, label: '10 min' },
];
export const DEFAULT_BREAK_SECONDS = 5 * 60;

/** Anything that isn't one of the offered choices falls back to the default. */
export function normalizeBreakSeconds(value) {
  const n = Number(value);
  return BREAK_OPTIONS.some((o) => o.seconds === n) ? n : DEFAULT_BREAK_SECONDS;
}
// A finished rest that nobody dismissed stops being shown after this long.
export const REST_STALE_MS = 2 * 60 * 1000;

/** Workout time in ms, not counting time spent paused. */
export function elapsedMs(session, nowMs) {
  const start = Date.parse(session.startedAt);
  if (!Number.isFinite(start)) return 0;
  let end = nowMs;
  if (session.finishedAt) end = Date.parse(session.finishedAt);
  else if (session.pausedAt !== null && session.pausedAt !== undefined) end = session.pausedAt;
  return Math.max(0, end - start - (session.pausedMs || 0));
}

/**
 * What the rest timer should show: null (nothing), or
 * { remainingMs, over, paused }. While paused, time is frozen at the moment of the pause.
 */
export function restState(session, nowMs) {
  if (session.restEndsAt === null || session.restEndsAt === undefined) return null;
  const paused = session.pausedAt !== null && session.pausedAt !== undefined;
  const remaining = session.restEndsAt - (paused ? session.pausedAt : nowMs);
  if (remaining < -REST_STALE_MS) return null;
  return { remainingMs: Math.max(0, remaining), over: remaining <= 0, paused };
}

/** 754000 -> "12:34", 3723000 -> "1:02:03". */
export function formatClock(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const two = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${two(m)}:${two(s)}` : `${m}:${two(s)}`;
}

/** "1h 05m" / "42 min" / "under a minute" for summaries. */
export function formatDurationWords(ms) {
  const minutes = Math.round(ms / 60000);
  if (minutes < 1) return '<1 min';
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`;
}

/** Checks the weight and reps for one set. */
export function validateSetEntry({ weight, reps }) {
  const errors = [];
  if (typeof weight !== 'number' || !Number.isFinite(weight) || weight < 0 || weight > LIMITS.maxWeight) {
    errors.push(`Weight must be between 0 and ${LIMITS.maxWeight}.`);
  }
  if (!Number.isInteger(reps) || reps < LIMITS.minReps || reps > LIMITS.maxReps) {
    errors.push(`Reps must be a whole number from ${LIMITS.minReps} to ${LIMITS.maxReps}.`);
  }
  return errors.length > 0 ? { ok: false, errors } : { ok: true, errors: [] };
}

/**
 * Reps to show before the user has entered anything.
 *  - already entered: keep it
 *  - warm-up: the planned reps
 *  - working set: last time's reps, but only if last time used the same weight
 *    (after a weight increase, start from the bottom of the range instead of
 *    pretending the old reps carry over)
 */
export function defaultReps(set, previousSet = null) {
  if (Number.isInteger(set.reps)) return set.reps;
  const floor = set.targetRepMin ?? LIMITS.minReps;
  if (set.kind === 'warmup') return clamp(set.targetRepMax ?? floor, LIMITS.minReps, LIMITS.maxReps);
  const sameWeight = previousSet && Number(previousSet.weight) === Number(set.weight ?? set.targetWeight);
  if (sameWeight && Number.isInteger(previousSet.reps)) return clamp(previousSet.reps, LIMITS.minReps, LIMITS.maxReps);
  return clamp(floor, LIMITS.minReps, LIMITS.maxReps);
}

/** Working-set progress for one exercise: { done, total }. Warm-ups never count. */
export function setProgress(exercise) {
  const working = exercise.sets.filter((s) => s.kind === 'working');
  return { done: working.filter((s) => s.completed).length, total: working.length };
}

/** "8–12 reps", or "12 · 10 · 8 reps" when sets differ. */
export function describeTargets(exercise) {
  const working = exercise.sets.filter((s) => s.kind === 'working');
  if (working.length === 0) return 'No sets';
  const labels = working.map((s) => formatRepTarget(s.targetRepMin ?? 0, s.targetRepMax ?? 0));
  const uniform = labels.every((l) => l === labels[0]);
  return uniform ? `${working.length} × ${labels[0]}` : labels.join(' · ');
}

/** "135 × 10" for one logged set. Weight 0 reads as bodyweight. */
export function formatLoggedSet(set) {
  const w = Number(set.weight) ? formatWeight(set.weight) : 'BW';
  return `${w} × ${set.reps}`;
}

/** Totals for the finished-workout card. */
export function summarizeSession(session, exercises, nowMs) {
  let sets = 0;
  for (const ex of exercises) sets += ex.sets.filter((s) => s.kind === 'working' && s.completed).length;
  return {
    exercisesDone: exercises.filter((e) => e.status === 'completed').length,
    exercisesPlanned: session.exercisesPlanned,
    workingSets: sets,
    durationMs: elapsedMs(session, nowMs),
    early: session.status === 'completed' && exercises.some((e) => e.status !== 'completed'),
  };
}