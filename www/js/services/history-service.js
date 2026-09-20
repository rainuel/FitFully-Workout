// Workout history. Screens call these functions; they never write SQL.
//
// Everything here reads what was actually logged. The program is only ever
// consulted to show today's working weight next to an exercise's history.

import * as W from '../models/workout.js';
import * as H from '../models/history.js';
import { elapsedMs, summarizeSession } from './workout-rules.js';
import { analyzeExercise, groupExerciseRows, summarizeLoggedExercises, topSet } from './history-rules.js';
import { loadStreaks } from './streak-service.js';

export const PAGE_SIZE = 30;
export const RECENT_COUNT = 5;

function withDuration(session, nowMs) {
  return { ...session, durationMs: elapsedMs(session, nowMs) };
}

/** Everything the Progress screen shows about history. */
export async function loadProgressOverview(db, now = new Date()) {
  const nowMs = now.getTime();
  const streaks = await loadStreaks(db, now);
  const workouts = await H.countCompletedSessions(db);
  const recent = (await H.listCompletedSessions(db, { limit: RECENT_COUNT })).map((s) => withDuration(s, nowMs));
  const exercises = summarizeLoggedExercises(await H.listLoggedExerciseRows(db));
  return { workouts, currentStreak: streaks.current, bestStreak: streaks.best, recent, exercises };
}

/** One page of finished workouts, newest first: { sessions, total, hasMore }. */
export async function loadHistoryPage(db, { limit = PAGE_SIZE, offset = 0 } = {}, now = new Date()) {
  const nowMs = now.getTime();
  const total = await H.countCompletedSessions(db);
  const sessions = (await H.listCompletedSessions(db, { limit, offset })).map((s) => withDuration(s, nowMs));
  return { sessions, total, hasMore: offset + sessions.length < total };
}

/**
 * One finished workout, exactly as it was logged. Returns null if it does not
 * exist or is still in progress. Each exercise carries:
 *   working / warmups   the sets that were actually completed
 *   topSet              the best working set
 *   isPr                true when its top weight beat everything logged before
 */
export async function loadSessionDetail(db, sessionId, now = new Date()) {
  const session = await W.getSession(db, sessionId);
  if (!session || session.status !== 'completed') return null;

  const logged = await W.getSessionExercises(db, sessionId);
  const exercises = [];
  for (const exercise of logged) {
    const working = exercise.sets.filter((s) => s.kind === 'working' && s.completed);
    const warmups = exercise.sets.filter((s) => s.kind === 'warmup' && s.completed);
    const best = topSet(working);

    let isPr = false;
    if (best && Number(best.weight) > 0) {
      const prior = await H.getPriorTopWeight(db, {
        libraryId: exercise.libraryId,
        name: exercise.name,
        unit: exercise.unit,
        date: session.date,
        sessionId,
      });
      isPr = prior !== null && Number(best.weight) > prior;
    }
    exercises.push({ ...exercise, working, warmups, topSet: best, isPr });
  }

  return { session, summary: summarizeSession(session, logged, now.getTime()), exercises };
}

/**
 * The history of one exercise, opened from any logged row of it. Returns null
 * if the row does not exist. `analysis` is null when nothing was completed.
 * `program` is the exercise's CURRENT working weight in the active program
 * (or null when it is not in the program).
 */
export async function loadExerciseHistory(db, workoutExerciseId) {
  const identity = await H.getExerciseIdentity(db, workoutExerciseId);
  if (!identity) return null;

  const sessions = groupExerciseRows(await H.listExerciseSetRows(db, identity));
  return {
    name: sessions[0]?.name ?? identity.name,
    program: await H.getProgramWeight(db, identity.libraryId),
    sessions,
    analysis: analyzeExercise(sessions),
  };
}
