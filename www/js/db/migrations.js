// Schema migrations.
//
// Each migration is a list of single SQL statements (one per string, no
// trailing semicolon, no SQL comments) so they run identically on the Capacitor
// plugin and in Node tests. A migration runs inside one transaction together
// with the row that records it, so a crash mid-way leaves the DB untouched.
//
// RULE: never edit a migration that has shipped. Add a new one instead.
//
// Design rules baked into the schema:
//  - PROGRAM tables (programs, program_days, program_exercises, program_sets)
//    describe what the user PLANS to do.
//  - WORKOUT tables (workout_sessions, workout_exercises, workout_sets) describe
//    what ACTUALLY happened. They snapshot names, weights, and units, and are
//    never joined back to the program to rebuild history.
//  - Weekdays are ISO numbers (1 = Mon ... 7 = Sun). Dates are local 'YYYY-MM-DD'.

const migration001 = {
  version: 1,
  name: 'initial_schema',
  statements: [
    // ---- Configuration ----
    `CREATE TABLE settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )`,
    `CREATE TABLE profile (
      id         INTEGER PRIMARY KEY CHECK (id = 1),
      height_cm  REAL,
      created_at TEXT NOT NULL
    )`,
    `CREATE TABLE bodyweight_records (
      id          INTEGER PRIMARY KEY,
      recorded_on TEXT NOT NULL,
      weight      REAL NOT NULL,
      unit        TEXT NOT NULL CHECK (unit IN ('kg', 'lbs'))
    )`,

    // ---- Exercise library ----
    `CREATE TABLE exercises (
      id           INTEGER PRIMARY KEY,
      name         TEXT NOT NULL,
      muscle_group TEXT,
      instructions TEXT,
      notes        TEXT,
      is_custom    INTEGER NOT NULL DEFAULT 0,
      is_archived  INTEGER NOT NULL DEFAULT 0
    )`,

    // ---- PROGRAM: what the user plans to do ----
    `CREATE TABLE programs (
      id        INTEGER PRIMARY KEY,
      name      TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1
    )`,
    `CREATE TABLE program_days (
      id         INTEGER PRIMARY KEY,
      program_id INTEGER NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
      weekday    INTEGER NOT NULL CHECK (weekday BETWEEN 1 AND 7),
      name       TEXT NOT NULL,
      is_rest    INTEGER NOT NULL DEFAULT 0,
      UNIQUE (program_id, weekday)
    )`,
    `CREATE TABLE program_exercises (
      id             INTEGER PRIMARY KEY,
      program_day_id INTEGER NOT NULL REFERENCES program_days(id) ON DELETE CASCADE,
      exercise_id    INTEGER NOT NULL REFERENCES exercises(id),
      position       INTEGER NOT NULL,
      working_weight REAL NOT NULL DEFAULT 0,
      weight_unit    TEXT NOT NULL CHECK (weight_unit IN ('kg', 'lbs')),
      rest_seconds   INTEGER NOT NULL DEFAULT 90,
      notes          TEXT
    )`,
    `CREATE TABLE program_sets (
      id                  INTEGER PRIMARY KEY,
      program_exercise_id INTEGER NOT NULL REFERENCES program_exercises(id) ON DELETE CASCADE,
      kind                TEXT NOT NULL CHECK (kind IN ('warmup', 'working')),
      set_number          INTEGER NOT NULL,
      rep_min             INTEGER NOT NULL,
      rep_max             INTEGER NOT NULL,
      weight              REAL
    )`,

    // ---- HISTORY: what actually happened ----
    `CREATE TABLE workout_sessions (
      id                  INTEGER PRIMARY KEY,
      session_date        TEXT NOT NULL,
      weekday             INTEGER NOT NULL CHECK (weekday BETWEEN 1 AND 7),
      day_name            TEXT NOT NULL,
      status              TEXT NOT NULL CHECK (status IN ('in_progress', 'completed')),
      started_at          TEXT NOT NULL,
      finished_at         TEXT,
      exercises_planned   INTEGER NOT NULL,
      exercises_completed INTEGER NOT NULL DEFAULT 0,
      rest_ends_at        INTEGER,
      notes               TEXT
    )`,
    `CREATE UNIQUE INDEX one_active_session ON workout_sessions(status) WHERE status = 'in_progress'`,
    `CREATE TABLE workout_exercises (
      id                  INTEGER PRIMARY KEY,
      session_id          INTEGER NOT NULL REFERENCES workout_sessions(id) ON DELETE CASCADE,
      exercise_id         INTEGER REFERENCES exercises(id) ON DELETE SET NULL,
      program_exercise_id INTEGER REFERENCES program_exercises(id) ON DELETE SET NULL,
      exercise_name       TEXT NOT NULL,
      position            INTEGER NOT NULL,
      target_weight       REAL,
      weight_unit         TEXT NOT NULL CHECK (weight_unit IN ('kg', 'lbs')),
      rest_seconds        INTEGER,
      status              TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed')),
      progression_state   TEXT CHECK (progression_state IN ('not_reached', 'eligible', 'kept', 'committed')),
      suggested_weight    REAL
    )`,
    `CREATE TABLE workout_sets (
      id                  INTEGER PRIMARY KEY,
      workout_exercise_id INTEGER NOT NULL REFERENCES workout_exercises(id) ON DELETE CASCADE,
      kind                TEXT NOT NULL CHECK (kind IN ('warmup', 'working')),
      set_number          INTEGER NOT NULL,
      target_rep_min      INTEGER,
      target_rep_max      INTEGER,
      target_weight       REAL,
      weight              REAL,
      reps                INTEGER,
      weight_unit         TEXT NOT NULL CHECK (weight_unit IN ('kg', 'lbs')),
      completed           INTEGER NOT NULL DEFAULT 0,
      completed_at        TEXT
    )`,

    // ---- Consistency + achievements ----
    `CREATE TABLE schedule_log (
      date     TEXT PRIMARY KEY,
      weekday  INTEGER NOT NULL CHECK (weekday BETWEEN 1 AND 7),
      day_name TEXT NOT NULL,
      outcome  TEXT NOT NULL CHECK (outcome IN ('completed', 'missed', 'rest'))
    )`,
    `CREATE TABLE progression_events (
      id            INTEGER PRIMARY KEY,
      exercise_id   INTEGER,
      exercise_name TEXT NOT NULL,
      from_weight   REAL NOT NULL,
      to_weight     REAL NOT NULL,
      unit          TEXT NOT NULL CHECK (unit IN ('kg', 'lbs')),
      created_at    TEXT NOT NULL
    )`,
    `CREATE TABLE achievements (
      code        TEXT PRIMARY KEY,
      unlocked_at TEXT NOT NULL
    )`,

    // ---- Indexes for the queries the app will run most ----
    `CREATE INDEX idx_program_exercises_day ON program_exercises(program_day_id, position)`,
    `CREATE INDEX idx_program_sets_exercise ON program_sets(program_exercise_id, kind, set_number)`,
    `CREATE INDEX idx_sessions_date ON workout_sessions(session_date)`,
    `CREATE INDEX idx_workout_exercises_session ON workout_exercises(session_id, position)`,
    `CREATE INDEX idx_workout_exercises_exercise ON workout_exercises(exercise_id)`,
    `CREATE INDEX idx_workout_sets_exercise ON workout_sets(workout_exercise_id, kind, set_number)`,
    `CREATE INDEX idx_bodyweight_date ON bodyweight_records(recorded_on)`,
  ],
};

// Phase 3: pausing a workout. `paused_at` is set (epoch ms) while paused;
// `paused_ms` is the total time spent paused before that, so the workout clock
// and the rest timer can both be frozen and resumed without losing time.
const migration002 = {
  version: 2,
  name: 'workout_pause',
  statements: [
    `ALTER TABLE workout_sessions ADD COLUMN paused_at INTEGER`,
    `ALTER TABLE workout_sessions ADD COLUMN paused_ms INTEGER NOT NULL DEFAULT 0`,
  ],
};

export const MIGRATIONS = [migration001, migration002];

export const LATEST_SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1].version;

/**
 * Brings the database up to the latest schema.
 * Safe to call on every launch. Returns { from, to }.
 */
export async function runMigrations(db) {
  await db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version    INTEGER PRIMARY KEY,
    name       TEXT NOT NULL,
    applied_at TEXT NOT NULL
  )`);

  const row = await db.get('SELECT MAX(version) AS version FROM schema_migrations');
  const from = row?.version ?? 0;

  const pending = MIGRATIONS.filter((m) => m.version > from).sort((a, b) => a.version - b.version);

  for (const migration of pending) {
    await db.transaction(async (tx) => {
      for (const statement of migration.statements) {
        await tx.exec(statement);
      }
      await tx.run('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)', [
        migration.version,
        migration.name,
        new Date().toISOString(),
      ]);
    });
  }

  return { from, to: pending.length > 0 ? pending[pending.length - 1].version : from };
}
