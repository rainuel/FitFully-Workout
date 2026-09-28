// Coach queries (SQL only).

/** [{ muscle, lastDate }] for every muscle group in the library; lastDate is null if never trained. */
export async function listMuscleLastTrained(db) {
  const rows = await db.all(
    `SELECT e.muscle_group AS muscle, MAX(s.session_date) AS last_date
       FROM exercises e
       LEFT JOIN workout_exercises we ON we.exercise_id = e.id
       LEFT JOIN workout_sessions s ON s.id = we.session_id AND s.status = 'completed'
      WHERE e.is_archived = 0 AND e.muscle_group IS NOT NULL AND e.muscle_group <> ''
      GROUP BY e.muscle_group
      ORDER BY e.muscle_group`,
  );
  return rows.map((r) => ({ muscle: r.muscle, lastDate: r.last_date ?? null }));
}

/** Names of the first few library exercises for a muscle group. */
export async function listExerciseNames(db, muscle, limit = 3) {
  const rows = await db.all('SELECT name FROM exercises WHERE muscle_group = ? AND is_archived = 0 ORDER BY id LIMIT ?', [muscle, limit]);
  return rows.map((r) => r.name);
}