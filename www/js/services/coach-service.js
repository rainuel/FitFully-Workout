// Loads what the Home coach card needs and turns it into tips.

import { toLocalDateString } from '../utils/dates.js';
import * as H from '../models/history.js';
import * as W from '../models/workout.js';
import { listExerciseNames, listMuscleLastTrained } from '../models/coach.js';
import { loadProfile } from './profile-service.js';
import { buildCoachTips } from './coach-rules.js';

/** The four coach tips for Home. `isRestDay` comes from the Home screen. */
export async function loadCoachTips(db, { isRestDay = false, now = new Date() } = {}) {
  const profile = await loadProfile(db);
  const workouts = await H.countCompletedSessions(db);
  const [latest] = await H.listCompletedSessions(db, { limit: 1 });
  const lastWorkoutExercises = latest ? await W.getSessionExercises(db, latest.id) : [];

  const trained = await listMuscleLastTrained(db);
  const muscles = [];
  for (const m of trained) muscles.push({ ...m, exercises: await listExerciseNames(db, m.muscle) });

  return buildCoachTips({
    date: now,
    bmiCategory: profile.bmi?.category ?? null,
    lastWorkoutExercises,
    muscles,
    workouts,
    isRestDay,
    todayKey: toLocalDateString(now),
  });
}