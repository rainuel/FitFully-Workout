// Backup and export reads/writes (SQL only).
//
// Table and column names come from the fixed BACKUP_TABLES list, never from
// user input. Every value still goes through a bound parameter.

const IDENTIFIER = /^[a-z_]+$/;

function assertIdentifier(name) {
  if (!IDENTIFIER.test(name)) throw new Error(`Unsafe SQL identifier "${name}".`);
  return name;
}

// Keep well under SQLite's variable limit (999 on older Android versions).
const MAX_VARIABLES_PER_INSERT = 500;

/**
 * Every row of every table in one transaction, so the backup is a consistent
 * snapshot. Returns { tableName: rows }.
 */
export async function readAllTables(db, tableDefs) {
  return db.transaction(async (tx) => {
    const out = {};
    for (const def of tableDefs) {
      const columns = def.columns.map(assertIdentifier).join(', ');
      out[def.name] = await tx.all(`SELECT ${columns} FROM ${assertIdentifier(def.name)} ORDER BY ${assertIdentifier(def.orderBy)}`);
    }
    return out;
  });
}

/**
 * Replaces the contents of every table with `tables`, all or nothing. Any
 * error (a bad row, a broken link between tables) rolls the whole thing back
 * and leaves the existing data exactly as it was.
 */
export async function replaceAllTables(db, tableDefs, tables) {
  await db.transaction(async (tx) => {
    for (const def of [...tableDefs].reverse()) {
      await tx.run(`DELETE FROM ${assertIdentifier(def.name)}`);
    }

    for (const def of tableDefs) {
      const rows = tables[def.name] ?? [];
      if (rows.length === 0) continue;

      // Only columns present in every row are written; the rest use the schema default.
      const columns = def.columns.filter((column) => rows.every((row) => Object.hasOwn(row, column)));
      if (columns.length === 0) continue;

      const perInsert = Math.max(1, Math.floor(MAX_VARIABLES_PER_INSERT / columns.length));
      const names = columns.map(assertIdentifier).join(', ');
      const group = `(${columns.map(() => '?').join(', ')})`;

      for (let i = 0; i < rows.length; i += perInsert) {
        const chunk = rows.slice(i, i + perInsert);
        await tx.run(
          `INSERT INTO ${assertIdentifier(def.name)} (${names}) VALUES ${chunk.map(() => group).join(', ')}`,
          chunk.flatMap((row) => columns.map((column) => row[column])),
        );
      }
    }
  });
}

/**
 * Every completed set of every finished workout, oldest first, in the order
 * it was done: warm-ups before working sets. Straight from the history tables.
 */
export async function listLoggedSetRows(db) {
  const rows = await db.all(
    `SELECT s.session_date, s.day_name, we.exercise_name, ws.kind, ws.set_number,
            ws.weight, ws.weight_unit, ws.reps, ws.target_weight, ws.target_rep_min, ws.target_rep_max
       FROM workout_sets ws
       JOIN workout_exercises we ON we.id = ws.workout_exercise_id
       JOIN workout_sessions s ON s.id = we.session_id
      WHERE s.status = 'completed' AND ws.completed = 1
      ORDER BY s.session_date, s.id, we.position, we.id, CASE ws.kind WHEN 'warmup' THEN 0 ELSE 1 END, ws.set_number`,
  );
  return rows.map((r) => ({
    date: r.session_date,
    dayName: r.day_name,
    exerciseName: r.exercise_name,
    kind: r.kind,
    setNumber: r.set_number,
    weight: r.weight,
    unit: r.weight_unit,
    reps: r.reps,
    targetWeight: r.target_weight,
    targetRepMin: r.target_rep_min,
    targetRepMax: r.target_rep_max,
  }));
}
