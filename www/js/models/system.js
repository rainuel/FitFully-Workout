// Read-only database facts used by backup and tests.

const COUNTABLE_TABLES = new Set([
  'exercises',
  'programs',
  'program_days',
  'program_exercises',
  'workout_sessions',
  'workout_sets',
]);

export async function countRows(db, table) {
  if (!COUNTABLE_TABLES.has(table)) throw new Error(`countRows: unsupported table "${table}"`);
  const row = await db.get(`SELECT COUNT(*) AS n FROM ${table}`);
  return row.n;
}

export async function getSchemaVersion(db) {
  const row = await db.get('SELECT MAX(version) AS version FROM schema_migrations');
  return row?.version ?? 0;
}

/** true / false, or null if the driver could not report it. */
export async function getForeignKeysEnabled(db) {
  try {
    const row = await db.get('PRAGMA foreign_keys');
    if (!row) return null;
    return Number(Object.values(row)[0]) === 1;
  } catch {
    return null;
  }
}
