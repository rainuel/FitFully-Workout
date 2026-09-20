// History rules: personal records, exercise summaries. Pure functions only.
//
// Weights of 0 mean bodyweight. Records are only compared within ONE unit (the
// unit of the most recent workout), because 100 kg and 100 lbs are not the
// same lift.

export const MAX_ESTIMATE_REPS = 12;

/**
 * Estimated one-rep max (Epley formula), rounded to 0.1. A rough guide only:
 * it is not reported for bodyweight sets or for sets above 12 reps, where the
 * formula stops being useful. Returns null in those cases.
 */
export function estimateOneRepMax(weight, reps) {
  const w = Number(weight);
  if (!(w > 0) || !Number.isInteger(reps) || reps < 1 || reps > MAX_ESTIMATE_REPS) return null;
  const value = reps === 1 ? w : w * (1 + reps / 30);
  return Math.round(value * 10) / 10;
}

/** True when set `a` is a better lift than set `b`: heavier, or the same weight for more reps. */
export function isBetterSet(a, b) {
  const wa = Number(a.weight);
  const wb = Number(b.weight);
  return wa > wb || (wa === wb && a.reps > b.reps);
}

/** The best set of a list (heaviest, then most reps), or null. */
export function topSet(sets) {
  let best = null;
  for (const set of sets) {
    if (best === null || isBetterSet(set, best)) best = set;
  }
  return best;
}

/**
 * Turns set rows (models/history.listExerciseSetRows, newest workout first)
 * into one entry per workout: { workoutExerciseId, sessionId, date, dayName, name, unit, sets }.
 */
export function groupExerciseRows(rows) {
  const byWorkout = new Map();
  for (const row of rows) {
    let entry = byWorkout.get(row.workoutExerciseId);
    if (!entry) {
      entry = {
        workoutExerciseId: row.workoutExerciseId,
        sessionId: row.sessionId,
        date: row.date,
        dayName: row.dayName,
        name: row.name,
        unit: row.unit,
        sets: [],
      };
      byWorkout.set(row.workoutExerciseId, entry);
    }
    entry.sets.push({ setNumber: row.setNumber, weight: row.weight, reps: row.reps });
  }
  return [...byWorkout.values()];
}

/**
 * Records and chart data for one exercise. `sessions` are newest first, as
 * groupExerciseRows returns them. Returns null when there is nothing logged.
 *
 *   heaviest        the heaviest set (then most reps): { weight, reps, date }
 *   bestEstimate    highest estimated one-rep max: { value, weight, reps, date } or null
 *   mostReps        the most reps in one set: { reps, weight, date }
 *   repsAtWeight    the most reps at each weight, heaviest first: [{ weight, reps, date }]
 *   chart           one point per workout, oldest first: [{ date, value }]
 *   isBodyweight    every logged set was bodyweight (the chart then shows reps)
 *
 * A record's date is when it was FIRST reached, so matching it later does not move it.
 */
export function analyzeExercise(sessions) {
  if (sessions.length === 0) return null;

  const unit = sessions[0].unit;
  const inUnit = sessions.filter((s) => s.unit === unit);
  const chronological = [...inUnit].reverse();

  let heaviest = null;
  let bestEstimate = null;
  let mostReps = null;
  const repsAt = new Map();
  const chartWeight = [];
  const chartReps = [];

  for (const session of chronological) {
    let sessionTopWeight = 0;
    let sessionTopReps = 0;
    for (const set of session.sets) {
      const weight = Number(set.weight);
      const candidate = { weight, reps: set.reps, date: session.date };

      if (heaviest === null || isBetterSet(candidate, heaviest)) heaviest = candidate;
      if (mostReps === null || set.reps > mostReps.reps) mostReps = { reps: set.reps, weight, date: session.date };

      const estimate = estimateOneRepMax(weight, set.reps);
      if (estimate !== null && (bestEstimate === null || estimate > bestEstimate.value)) {
        bestEstimate = { value: estimate, weight, reps: set.reps, date: session.date };
      }

      const known = repsAt.get(weight);
      if (!known || set.reps > known.reps) repsAt.set(weight, candidate);

      sessionTopWeight = Math.max(sessionTopWeight, weight);
      sessionTopReps = Math.max(sessionTopReps, set.reps);
    }
    chartWeight.push({ date: session.date, value: sessionTopWeight });
    chartReps.push({ date: session.date, value: sessionTopReps });
  }

  const isBodyweight = heaviest.weight === 0;
  return {
    unit,
    sessionCount: inUnit.length,
    otherUnitSessions: sessions.length - inUnit.length,
    isBodyweight,
    heaviest,
    bestEstimate,
    mostReps,
    repsAtWeight: [...repsAt.values()].sort((a, b) => b.weight - a.weight),
    chartMetric: isBodyweight ? 'reps' : 'weight',
    chart: isBodyweight ? chartReps : chartWeight,
  };
}

/**
 * One entry per exercise for the Progress list, most recently done first.
 * `rows` come from models/history.listLoggedExerciseRows (newest first).
 * The heaviest weight only counts workouts in the exercise's latest unit.
 * Returns [{ id, name, unit, sessions, lastDate, topWeight }], where `id` is
 * a logged row of that exercise (used to open its history).
 */
export function summarizeLoggedExercises(rows) {
  const groups = new Map();
  for (const row of rows) {
    const key = row.libraryId === null || row.libraryId === undefined ? `n:${row.name}` : `i:${row.libraryId}`;
    let group = groups.get(key);
    if (!group) {
      group = { id: row.id, name: row.name, unit: row.unit, sessions: 0, lastDate: row.date, topWeight: 0 };
      groups.set(key, group);
    }
    group.sessions += 1;
    if (row.unit === group.unit) group.topWeight = Math.max(group.topWeight, row.topWeight);
  }
  return [...groups.values()];
}
