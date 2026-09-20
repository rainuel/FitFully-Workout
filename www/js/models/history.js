// Workout history reads (SQL only): what ACTUALLY happened.
//
// Nothing here looks at the program to work out what a past workout was.
// Every number comes from the snapshot rows stored when each set was logged.
// An exercise is matched by its library id, or by name if the library entry
// has since been deleted (the same rule the "previous workout" lookup uses).

function mapSummary(row) {
  return {
    id: row.id,
    date: row.session_date,
    weekday: row.weekday,
    dayName: row.day_name,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    pausedAt: null,
    pausedMs: row.paused_ms ?? 0,
    exercisesPlanned: row.exercises_planned,
    exercisesCompleted: row.exercises_completed,
    workingSets: row.working_sets,
  };
}

const SUMMARY_SELECT = `
  SELECT s.id, s.session_date, s.weekday, s.day_name, s.started_at, s.finished_at, s.paused_ms,
         s.exercises_planned, s.exercises_completed,
         (SELECT COUNT(*)
            FROM workout_sets ws
            JOIN workout_exercises we ON we.id = ws.workout_exercise_id
           WHERE we.session_id = s.id AND ws.kind = 'working' AND ws.completed = 1) AS working_sets
    FROM workout_sessions s
   WHERE s.status = 'completed'`;

// ---- Workouts ---------------------------------------------------------------

export async function countCompletedSessions(db) {
  const row = await db.get(`SELECT COUNT(*) AS n FROM workout_sessions WHERE status = 'completed'`);
  return row.n;
}

/** Finished workouts, newest first. */
export async function listCompletedSessions(db, { limit, offset = 0 }) {
  const rows = await db.all(`${SUMMARY_SELECT} ORDER BY s.session_date DESC, s.id DESC LIMIT ? OFFSET ?`, [limit, offset]);
  return rows.map(mapSummary);
}

// ---- Exercises --------------------------------------------------------------

/**
 * One row per logged exercise in a finished workout that has at least one
 * completed working set, newest first: { id, libraryId, name, unit, date, sessionId, topWeight }.
 */
export async function listLoggedExerciseRows(db) {
  const rows = await db.all(
    `SELECT we.id, we.exercise_id, we.exercise_name, we.weight_unit, s.session_date, s.id AS session_id,
            MAX(ws.weight) AS top_weight
       FROM workout_exercises we
       JOIN workout_sessions s ON s.id = we.session_id
       JOIN workout_sets ws ON ws.workout_exercise_id = we.id
      WHERE s.status = 'completed' AND ws.kind = 'working' AND ws.completed = 1
      GROUP BY we.id
      ORDER BY s.session_date DESC, s.id DESC, we.id DESC`,
  );
  return rows.map((r) => ({
    id: r.id,
    libraryId: r.exercise_id,
    name: r.exercise_name,
    unit: r.weight_unit,
    date: r.session_date,
    sessionId: r.session_id,
    topWeight: Number(r.top_weight),
  }));
}

/** Which exercise a logged workout-exercise row belongs to: { libraryId, name } or null. */
export async function getExerciseIdentity(db, workoutExerciseId) {
  const row = await db.get('SELECT exercise_id, exercise_name FROM workout_exercises WHERE id = ?', [workoutExerciseId]);
  return row ? { libraryId: row.exercise_id, name: row.exercise_name } : null;
}

/**
 * Every completed working set ever logged for an exercise, newest workout first,
 * sets in order: { workoutExerciseId, sessionId, date, dayName, name, unit, setNumber, weight, reps }.
 */
export async function listExerciseSetRows(db, { libraryId, name }) {
  const rows = await db.all(
    `SELECT we.id AS we_id, s.id AS session_id, s.session_date, s.day_name, we.exercise_name, we.weight_unit,
            ws.set_number, ws.weight, ws.reps
       FROM workout_exercises we
       JOIN workout_sessions s ON s.id = we.session_id
       JOIN workout_sets ws ON ws.workout_exercise_id = we.id
      WHERE s.status = 'completed' AND ws.kind = 'working' AND ws.completed = 1
        AND (we.exercise_id = ? OR (we.exercise_id IS NULL AND we.exercise_name = ?))
      ORDER BY s.session_date DESC, s.id DESC, we.id DESC, ws.set_number`,
    [libraryId, name],
  );
  return rows.map((r) => ({
    workoutExerciseId: r.we_id,
    sessionId: r.session_id,
    date: r.session_date,
    dayName: r.day_name,
    name: r.exercise_name,
    unit: r.weight_unit,
    setNumber: r.set_number,
    weight: Number(r.weight),
    reps: r.reps,
  }));
}

/**
 * The heaviest working weight logged for an exercise (in one unit) in finished
 * workouts BEFORE the given one. Returns null if there is no earlier history.
 */
export async function getPriorTopWeight(db, { libraryId, name, unit, date, sessionId }) {
  const row = await db.get(
    `SELECT MAX(ws.weight) AS top, COUNT(*) AS n
       FROM workout_sets ws
       JOIN workout_exercises we ON we.id = ws.workout_exercise_id
       JOIN workout_sessions s ON s.id = we.session_id
      WHERE s.status = 'completed' AND ws.kind = 'working' AND ws.completed = 1
        AND we.weight_unit = ?
        AND (we.exercise_id = ? OR (we.exercise_id IS NULL AND we.exercise_name = ?))
        AND (s.session_date < ? OR (s.session_date = ? AND s.id < ?))`,
    [unit, libraryId, name, date, date, sessionId],
  );
  return row.n > 0 ? Number(row.top) : null;
}

// ---- Program (current plan, shown next to history but never used to rebuild it) ----

/** The working weight the ACTIVE program currently uses for an exercise, or null if it is not in the program. */
export async function getProgramWeight(db, libraryId) {
  if (libraryId === null || libraryId === undefined) return null;
  const row = await db.get(
    `SELECT pe.working_weight, pe.weight_unit, d.name AS day_name
       FROM program_exercises pe
       JOIN program_days d ON d.id = pe.program_day_id
       JOIN programs p ON p.id = d.program_id
      WHERE p.is_active = 1 AND pe.exercise_id = ?
      ORDER BY d.weekday
      LIMIT 1`,
    [libraryId],
  );
  return row ? { weight: Number(row.working_weight), unit: row.weight_unit, dayName: row.day_name } : null;
}
