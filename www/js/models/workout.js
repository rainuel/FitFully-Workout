// Workout history (SQL only): what ACTUALLY happened.
//
// A workout is copied ("snapshotted") from the program when it starts. After
// that it never reads the program again, so editing the plan mid-workout, or
// deleting an exercise later, cannot change a workout that was already logged.
//
// Every function takes `db`, which may also be the `tx` object handed to a
// db.transaction() callback.

const SESSION_COLUMNS = `id, session_date, weekday, day_name, status, started_at, finished_at,
  exercises_planned, exercises_completed, rest_ends_at, paused_at, paused_ms`;

function mapSession(row) {
  return {
    id: row.id,
    date: row.session_date,
    weekday: row.weekday,
    dayName: row.day_name,
    status: row.status,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    exercisesPlanned: row.exercises_planned,
    exercisesCompleted: row.exercises_completed,
    restEndsAt: row.rest_ends_at ?? null,
    pausedAt: row.paused_at ?? null,
    pausedMs: row.paused_ms ?? 0,
  };
}

function mapSet(row) {
  return {
    id: row.id,
    exerciseId: row.workout_exercise_id,
    kind: row.kind,
    setNumber: row.set_number,
    targetRepMin: row.target_rep_min,
    targetRepMax: row.target_rep_max,
    targetWeight: row.target_weight,
    weight: row.weight,
    reps: row.reps,
    unit: row.weight_unit,
    completed: row.completed === 1,
    completedAt: row.completed_at,
  };
}

function mapExercise(row, sets) {
  return {
    id: row.id,
    sessionId: row.session_id,
    libraryId: row.exercise_id,
    programExerciseId: row.program_exercise_id,
    name: row.exercise_name,
    position: row.position,
    targetWeight: row.target_weight,
    unit: row.weight_unit,
    restSeconds: row.rest_seconds,
    status: row.status,
    progressionState: row.progression_state ?? null,
    suggestedWeight: row.suggested_weight ?? null,
    sets,
  };
}

const EXERCISE_COLUMNS = `id, session_id, exercise_id, program_exercise_id, exercise_name, position,
  target_weight, weight_unit, rest_seconds, status, progression_state, suggested_weight`;

const SET_COLUMNS = `id, workout_exercise_id, kind, set_number, target_rep_min, target_rep_max,
  target_weight, weight, reps, weight_unit, completed, completed_at`;

const SET_COLUMNS_WS = SET_COLUMNS.split(',').map((c) => `ws.${c.trim()}`).join(', ');

// Warm-ups first, then working sets, each in set-number order.
const bySetOrder = (a, b) => (a.kind === b.kind ? a.setNumber - b.setNumber : a.kind === 'warmup' ? -1 : 1);

async function lastId(db, res, table) {
  return res.lastId ?? (await db.get(`SELECT MAX(id) AS id FROM ${table}`)).id;
}

// ---- Sessions ---------------------------------------------------------------

export async function getSession(db, id) {
  const row = await db.get(`SELECT ${SESSION_COLUMNS} FROM workout_sessions WHERE id = ?`, [id]);
  return row ? mapSession(row) : null;
}

/** The workout that is currently in progress (there is at most one), or null. */
export async function getActiveSession(db) {
  const row = await db.get(`SELECT ${SESSION_COLUMNS} FROM workout_sessions WHERE status = 'in_progress' LIMIT 1`);
  return row ? mapSession(row) : null;
}

/** The most recent finished workout on a local date, or null. */
export async function getCompletedSessionForDate(db, date) {
  const row = await db.get(
    `SELECT ${SESSION_COLUMNS} FROM workout_sessions
      WHERE session_date = ? AND status = 'completed'
      ORDER BY id DESC LIMIT 1`,
    [date],
  );
  return row ? mapSession(row) : null;
}

/**
 * Copies a plan into a new in-progress workout.
 * `exercises`: [{ libraryId, programExerciseId, name, targetWeight, unit, restSeconds,
 *                 sets: [{ kind, setNumber, repMin, repMax, weight, reps }] }]
 * Returns the new session id. All-or-nothing.
 */
export async function insertSession(db, { date, weekday, dayName, startedAt, exercises }) {
  return db.transaction(async (tx) => {
    const res = await tx.run(
      `INSERT INTO workout_sessions (session_date, weekday, day_name, status, started_at, exercises_planned)
       VALUES (?, ?, ?, 'in_progress', ?, ?)`,
      [date, weekday, dayName, startedAt, exercises.length],
    );
    const sessionId = await lastId(tx, res, 'workout_sessions');

    for (let i = 0; i < exercises.length; i++) {
      const ex = exercises[i];
      const exRes = await tx.run(
        `INSERT INTO workout_exercises
           (session_id, exercise_id, program_exercise_id, exercise_name, position, target_weight, weight_unit, rest_seconds)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [sessionId, ex.libraryId, ex.programExerciseId, ex.name, i + 1, ex.targetWeight, ex.unit, ex.restSeconds],
      );
      const exerciseId = await lastId(tx, exRes, 'workout_exercises');
      for (const s of ex.sets) {
        await tx.run(
          `INSERT INTO workout_sets
             (workout_exercise_id, kind, set_number, target_rep_min, target_rep_max, target_weight, weight, reps, weight_unit)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [exerciseId, s.kind, s.setNumber, s.repMin, s.repMax, s.weight, s.weight, s.reps, ex.unit],
        );
      }
    }
    return sessionId;
  });
}

export async function deleteSession(db, id) {
  await db.run('DELETE FROM workout_sessions WHERE id = ?', [id]); // exercises and sets cascade
}

export async function markSessionFinished(db, id, { finishedAt, pausedMs }) {
  await db.run(
    `UPDATE workout_sessions
        SET status = 'completed', finished_at = ?, paused_at = NULL, paused_ms = ?, rest_ends_at = NULL
      WHERE id = ?`,
    [finishedAt, pausedMs, id],
  );
}

export async function setSessionPause(db, id, { pausedAt, pausedMs, restEndsAt }) {
  await db.run('UPDATE workout_sessions SET paused_at = ?, paused_ms = ?, rest_ends_at = ? WHERE id = ?', [
    pausedAt,
    pausedMs,
    restEndsAt,
    id,
  ]);
}

export async function setRestEndsAt(db, id, restEndsAt) {
  await db.run('UPDATE workout_sessions SET rest_ends_at = ? WHERE id = ?', [restEndsAt, id]);
}

/** Recounts finished exercises from the exercise rows, so the total can never drift. */
export async function recountCompletedExercises(db, sessionId) {
  await db.run(
    `UPDATE workout_sessions
        SET exercises_completed = (SELECT COUNT(*) FROM workout_exercises WHERE session_id = ? AND status = 'completed')
      WHERE id = ?`,
    [sessionId, sessionId],
  );
}

export async function countIncompleteWorkingSets(db, sessionId) {
  const row = await db.get(
    `SELECT COUNT(*) AS n
       FROM workout_sets ws
       JOIN workout_exercises we ON we.id = ws.workout_exercise_id
      WHERE we.session_id = ? AND ws.kind = 'working' AND ws.completed = 0`,
    [sessionId],
  );
  return row.n;
}

export async function countCompletedWorkingSets(db, sessionId) {
  const row = await db.get(
    `SELECT COUNT(*) AS n
       FROM workout_sets ws
       JOIN workout_exercises we ON we.id = ws.workout_exercise_id
      WHERE we.session_id = ? AND ws.kind = 'working' AND ws.completed = 1`,
    [sessionId],
  );
  return row.n;
}

export async function logScheduleOutcome(db, { date, weekday, dayName, outcome }) {
  await db.run('INSERT OR REPLACE INTO schedule_log (date, weekday, day_name, outcome) VALUES (?, ?, ?, ?)', [
    date,
    weekday,
    dayName,
    outcome,
  ]);
}

// ---- Exercises and sets -----------------------------------------------------

/** Every exercise of a workout, in order, each with its sets. */
export async function getSessionExercises(db, sessionId) {
  const rows = await db.all(`SELECT ${EXERCISE_COLUMNS} FROM workout_exercises WHERE session_id = ? ORDER BY position`, [sessionId]);
  const setRows = await db.all(
    `SELECT ${SET_COLUMNS_WS}
       FROM workout_sets ws
       JOIN workout_exercises we ON we.id = ws.workout_exercise_id
      WHERE we.session_id = ?`,
    [sessionId],
  );
  const sets = setRows.map(mapSet);
  return rows.map((row) => mapExercise(row, sets.filter((s) => s.exerciseId === row.id).sort(bySetOrder)));
}

export async function getWorkoutExercise(db, id) {
  const row = await db.get(`SELECT ${EXERCISE_COLUMNS} FROM workout_exercises WHERE id = ?`, [id]);
  if (!row) return null;
  const setRows = await db.all(`SELECT ${SET_COLUMNS} FROM workout_sets WHERE workout_exercise_id = ?`, [id]);
  return mapExercise(row, setRows.map(mapSet).sort(bySetOrder));
}

export async function getSet(db, id) {
  const row = await db.get(`SELECT ${SET_COLUMNS} FROM workout_sets WHERE id = ?`, [id]);
  return row ? mapSet(row) : null;
}

export async function updateSetValues(db, id, { weight, reps }) {
  await db.run('UPDATE workout_sets SET weight = ?, reps = ? WHERE id = ?', [weight, reps, id]);
}

export async function markSetCompleted(db, id, { weight, reps, completedAt }) {
  await db.run('UPDATE workout_sets SET weight = ?, reps = ?, completed = 1, completed_at = ? WHERE id = ?', [
    weight,
    reps,
    completedAt,
    id,
  ]);
}

export async function markSetIncomplete(db, id) {
  await db.run('UPDATE workout_sets SET completed = 0, completed_at = NULL WHERE id = ?', [id]);
}

export async function insertSet(db, exerciseId, { kind, setNumber, repMin, repMax, targetWeight, weight, reps, unit }) {
  const res = await db.run(
    `INSERT INTO workout_sets
       (workout_exercise_id, kind, set_number, target_rep_min, target_rep_max, target_weight, weight, reps, weight_unit)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [exerciseId, kind, setNumber, repMin, repMax, targetWeight, weight, reps, unit],
  );
  return lastId(db, res, 'workout_sets');
}

export async function deleteSet(db, id) {
  await db.run('DELETE FROM workout_sets WHERE id = ?', [id]);
}

export async function renumberSets(db, exerciseId, kind) {
  const rows = await db.all(
    'SELECT id FROM workout_sets WHERE workout_exercise_id = ? AND kind = ? ORDER BY set_number, id',
    [exerciseId, kind],
  );
  for (let i = 0; i < rows.length; i++) {
    await db.run('UPDATE workout_sets SET set_number = ? WHERE id = ?', [i + 1, rows[i].id]);
  }
}

/** Sets an exercise to 'completed' when every working set is done, otherwise 'pending'. Returns the new status. */
export async function syncExerciseStatus(db, exerciseId) {
  const row = await db.get(
    `SELECT COUNT(*) AS total, COALESCE(SUM(completed), 0) AS done
       FROM workout_sets WHERE workout_exercise_id = ? AND kind = 'working'`,
    [exerciseId],
  );
  const status = row.total > 0 && row.done === row.total ? 'completed' : 'pending';
  await db.run('UPDATE workout_exercises SET status = ? WHERE id = ?', [status, exerciseId]);
  return status;
}

export async function getExerciseInstructions(db, libraryId) {
  if (libraryId === null || libraryId === undefined) return null;
  const row = await db.get('SELECT instructions FROM exercises WHERE id = ?', [libraryId]);
  return row?.instructions ?? null;
}

// ---- Previous performance ---------------------------------------------------

/**
 * The most recent FINISHED workout that included this exercise (matched by
 * library id, or by name if the library entry has since been deleted), with
 * its completed working sets. Returns { date, sets } or null.
 */
export async function findPreviousPerformance(db, { sessionId, libraryId, name }) {
  const row = await db.get(
    `SELECT we.id, s.session_date
       FROM workout_exercises we
       JOIN workout_sessions s ON s.id = we.session_id
      WHERE s.status = 'completed'
        AND s.id != ?
        AND (we.exercise_id = ? OR (we.exercise_id IS NULL AND we.exercise_name = ?))
        AND EXISTS (
          SELECT 1 FROM workout_sets ws
           WHERE ws.workout_exercise_id = we.id AND ws.kind = 'working' AND ws.completed = 1
        )
      ORDER BY s.session_date DESC, s.id DESC
      LIMIT 1`,
    [sessionId, libraryId, name],
  );
  if (!row) return null;
  const setRows = await db.all(
    `SELECT ${SET_COLUMNS} FROM workout_sets
      WHERE workout_exercise_id = ? AND kind = 'working' AND completed = 1
      ORDER BY set_number`,
    [row.id],
  );
  return { date: row.session_date, sets: setRows.map(mapSet) };
}

/** Just enough of an exercise row to find its workout and rest time. */
export async function getExerciseHeader(db, id) {
  const row = await db.get('SELECT id, session_id, rest_seconds FROM workout_exercises WHERE id = ?', [id]);
  return row ? { id: row.id, sessionId: row.session_id, restSeconds: row.rest_seconds } : null;
}
