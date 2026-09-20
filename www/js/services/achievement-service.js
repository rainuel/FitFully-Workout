// Achievement detection. Screens call these functions; they never write SQL.
//
// Checking is idempotent: an achievement is recorded once, with the time it
// was first noticed, and is never removed. Bookkeeping like this must never
// get in the way of what the person just did, so the "safe" variant swallows
// (and logs) any failure.

import * as C from '../models/consistency.js';
import { countCompletedSessions } from '../models/history.js';
import { countWeightIncreases } from '../models/progression.js';
import { toLocalDateString } from '../utils/dates.js';
import { ACHIEVEMENTS, findUnlockable, progressToward } from './achievement-rules.js';
import { bestPerfectWeekRun } from './streak-rules.js';
import { reconcileSchedule } from './streak-service.js';

/** The numbers the achievement rules look at. */
export async function gatherStats(db, now = new Date()) {
  await reconcileSchedule(db, now);
  const entries = await C.getScheduleLog(db);
  return {
    workouts: await countCompletedSessions(db),
    weightIncreases: await countWeightIncreases(db),
    exercisesProgressed: await C.countProgressedExercises(db),
    perfectWeeks: bestPerfectWeekRun(entries, toLocalDateString(now)),
  };
}

async function syncAchievements(db, now) {
  const stats = await gatherStats(db, now);
  const unlockedCodes = new Set((await C.listAchievements(db)).map((a) => a.code));
  const newly = [];
  for (const achievement of findUnlockable(stats, unlockedCodes)) {
    if (await C.insertAchievement(db, achievement.code, now.toISOString())) {
      newly.push({ code: achievement.code, title: achievement.title });
    }
  }
  return { stats, newly };
}

/** Unlocks whatever has been reached. Returns the ones unlocked just now: [{ code, title }]. */
export async function evaluateAchievements(db, now = new Date()) {
  return (await syncAchievements(db, now)).newly;
}

/** Same, but a failure is logged and ignored. Use this after a workout or a weight commit. */
export async function safeEvaluateAchievements(db, now = new Date()) {
  try {
    return await evaluateAchievements(db, now);
  } catch (err) {
    console.error('Achievement check failed', err);
    return [];
  }
}

/**
 * Every achievement with its state, for the Progress screen. Also unlocks
 * anything newly reached. Returns { items, newlyUnlocked }.
 */
export async function loadAchievements(db, now = new Date()) {
  const { stats, newly } = await syncAchievements(db, now);
  const unlockedAt = new Map((await C.listAchievements(db)).map((a) => [a.code, a.unlockedAt]));
  const items = ACHIEVEMENTS.map((a) => ({
    code: a.code,
    title: a.title,
    description: a.description,
    unlocked: unlockedAt.has(a.code),
    unlockedAt: unlockedAt.get(a.code) ?? null,
    progress: progressToward(a, stats),
  }));
  return { items, newlyUnlocked: newly };
}
