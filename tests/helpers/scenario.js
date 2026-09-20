// Test scenarios for history, streaks, and achievements: a seeded database,
// a planned program, and whole workouts played through the real services.
//
// The program is planned through the models (not program-service) so that
// planning never triggers the "record past days before editing" step against
// the real clock.

import assert from 'node:assert/strict';
import { createTestDb } from './node-db.js';
import { runMigrations } from '../../www/js/db/migrations.js';
import { seedIfNeeded } from '../../www/js/db/seed.js';
import { setSetting } from '../../www/js/models/settings.js';
import { insertProgramExercise } from '../../www/js/models/program.js';
import { completeSet, finishWorkout, startWorkout } from '../../www/js/services/workout-service.js';
import * as W from '../../www/js/models/workout.js';

export const MIN = 60 * 1000;

/** Epoch ms for a local date and time. `month` is 1-12. */
export const at = (year, month, day, hour = 10, minute = 0) => new Date(year, month - 1, day, hour, minute).getTime();

/** A seeded database whose "first launch" was on the given local date (a Date). */
export async function setupDb({ firstLaunch = new Date(2026, 8, 1, 8, 0) } = {}) {
  const db = createTestDb();
  await runMigrations(db);
  await seedIfNeeded(db);
  await setSetting(db, 'first_launch_at', firstLaunch.toISOString());
  return db;
}

export const exerciseId = async (db, name) => (await db.get('SELECT id FROM exercises WHERE name = ?', [name])).id;
export const dayIdFor = async (db, weekday) => (await db.get('SELECT id FROM program_days WHERE weekday = ?', [weekday])).id;

/**
 * Plans a training day. exercises: [{ name, weight, sets = 3, min = 8, max = 12, unit = 'lbs', warmups = [] }].
 * Returns the program exercise ids.
 */
export async function planDay(db, weekday, exercises) {
  const dayId = await dayIdFor(db, weekday);
  const ids = [];
  for (const ex of exercises) {
    ids.push(
      await insertProgramExercise(db, {
        dayId,
        exerciseId: await exerciseId(db, ex.name),
        workingWeight: ex.weight,
        weightUnit: ex.unit ?? 'lbs',
        restSeconds: 60,
        workingSets: Array.from({ length: ex.sets ?? 3 }, () => ({ min: ex.min ?? 8, max: ex.max ?? 12 })),
        warmupSets: ex.warmups ?? [],
      }),
    );
  }
  return ids;
}

/**
 * Plays a workout from `startMs`. results: { 'Bench Press': [[weight, reps], ...] } gives the
 * working sets to log, in order; exercises left out are not done. Finishes 1 minute after the last set.
 * Returns { sessionId, exercises (as started), result (from finishWorkout) }.
 */
export async function logWorkout(db, startMs, results, { warmups = false } = {}) {
  const started = await startWorkout(db, startMs);
  assert.equal(started.ok, true, 'the workout should start');
  const exercises = await W.getSessionExercises(db, started.sessionId);

  let t = startMs;
  for (const ex of exercises) {
    const rows = results[ex.name];
    if (!rows) continue;
    if (warmups) {
      for (const s of ex.sets.filter((x) => x.kind === 'warmup')) {
        t += MIN;
        await completeSet(db, s.id, { weight: s.weight, reps: s.reps }, t);
      }
    }
    const working = ex.sets.filter((x) => x.kind === 'working');
    for (let i = 0; i < rows.length; i++) {
      t += MIN;
      const r = await completeSet(db, working[i].id, { weight: rows[i][0], reps: rows[i][1] }, t);
      assert.equal(r.ok, true);
    }
  }
  const result = await finishWorkout(db, started.sessionId, t + MIN);
  return { sessionId: started.sessionId, exercises, result };
}
