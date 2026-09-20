// Progression records (SQL only).
//
// Two things live here:
//  - the outcome of a progression check on a workout exercise (history side:
//    workout_exercises.progression_state / suggested_weight)
//  - the ONE place a program's working weight is changed by progression
//    (program side), plus a log of each change in progression_events.
//
// Workout sets are never touched by anything in this file.

export async function setProgressionState(db, workoutExerciseId, state, suggestedWeight) {
  await db.run('UPDATE workout_exercises SET progression_state = ?, suggested_weight = ? WHERE id = ?', [
    state,
    suggestedWeight,
    workoutExerciseId,
  ]);
}

export async function setProgramWorkingWeight(db, programExerciseId, weight) {
  await db.run('UPDATE program_exercises SET working_weight = ? WHERE id = ?', [weight, programExerciseId]);
}

export async function insertProgressionEvent(db, { exerciseId, exerciseName, fromWeight, toWeight, unit, createdAt }) {
  await db.run(
    `INSERT INTO progression_events (exercise_id, exercise_name, from_weight, to_weight, unit, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [exerciseId, exerciseName, fromWeight, toWeight, unit, createdAt],
  );
}

export async function countWeightIncreases(db) {
  const row = await db.get('SELECT COUNT(*) AS n FROM progression_events WHERE to_weight > from_weight');
  return row.n;
}
