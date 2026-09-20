// Consistency records (SQL only): the schedule log and unlocked achievements.
//
// schedule_log has one row per past calendar day: what the plan said that day
// was, and what happened. Rows are written once and never rewritten when the
// program changes later.

// ---- Schedule log -----------------------------------------------------------

/** Every logged day, oldest first: [{ date, outcome }]. */
export async function getScheduleLog(db) {
  const rows = await db.all('SELECT date, outcome FROM schedule_log ORDER BY date');
  return rows.map((r) => ({ date: r.date, outcome: r.outcome }));
}

/** Logged days from `from` to `to` (both included), oldest first. */
export async function getScheduleLogBetween(db, from, to) {
  const rows = await db.all('SELECT date, outcome FROM schedule_log WHERE date BETWEEN ? AND ? ORDER BY date', [from, to]);
  return rows.map((r) => ({ date: r.date, outcome: r.outcome }));
}

/** Adds a day to the log only if it has no row yet. Existing rows are never replaced. */
export async function insertScheduleLogIfMissing(db, { date, weekday, dayName, outcome }) {
  await db.run('INSERT OR IGNORE INTO schedule_log (date, weekday, day_name, outcome) VALUES (?, ?, ?, ?)', [
    date,
    weekday,
    dayName,
    outcome,
  ]);
}

/** Dates (from `from` to `to`) that have a finished workout. */
export async function getCompletedSessionDates(db, from, to) {
  const rows = await db.all(
    `SELECT DISTINCT session_date FROM workout_sessions
      WHERE status = 'completed' AND session_date BETWEEN ? AND ?`,
    [from, to],
  );
  return rows.map((r) => r.session_date);
}

/** The date of the workout in progress, or null. */
export async function getActiveSessionDate(db) {
  const row = await db.get(`SELECT session_date FROM workout_sessions WHERE status = 'in_progress' LIMIT 1`);
  return row ? row.session_date : null;
}

/** The date of the oldest workout of any kind, or null. */
export async function getEarliestSessionDate(db) {
  const row = await db.get('SELECT MIN(session_date) AS d FROM workout_sessions');
  return row?.d ?? null;
}

// ---- Achievements -----------------------------------------------------------

export async function listAchievements(db) {
  const rows = await db.all('SELECT code, unlocked_at FROM achievements ORDER BY unlocked_at, code');
  return rows.map((r) => ({ code: r.code, unlockedAt: r.unlocked_at }));
}

/** Records an unlock. Returns true if it was new. */
export async function insertAchievement(db, code, unlockedAt) {
  const res = await db.run('INSERT OR IGNORE INTO achievements (code, unlocked_at) VALUES (?, ?)', [code, unlockedAt]);
  return res.changes > 0;
}

/** How many different exercises have had a weight increase committed. */
export async function countProgressedExercises(db) {
  const row = await db.get(
    `SELECT COUNT(DISTINCT CASE WHEN exercise_id IS NULL THEN 'n:' || exercise_name ELSE 'i:' || exercise_id END) AS n
       FROM progression_events
      WHERE to_weight > from_weight`,
  );
  return row.n;
}
