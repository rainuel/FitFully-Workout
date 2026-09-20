// Exercise library (SQL only). Built-in and custom exercises share one table.
// Workout history keeps its own copy of the exercise name, so renaming or
// deleting an exercise here never rewrites past workouts.

function mapExercise(row) {
  return {
    id: row.id,
    name: row.name,
    muscleGroup: row.muscle_group,
    instructions: row.instructions,
    notes: row.notes,
    isCustom: row.is_custom === 1,
    isArchived: row.is_archived === 1,
  };
}

const COLUMNS = 'id, name, muscle_group, instructions, notes, is_custom, is_archived';

/** All visible exercises, A to Z. Archived ones are hidden unless asked for. */
export async function listExercises(db, { includeArchived = false } = {}) {
  const rows = await db.all(
    `SELECT ${COLUMNS} FROM exercises ${includeArchived ? '' : 'WHERE is_archived = 0'} ORDER BY name COLLATE NOCASE`,
  );
  return rows.map(mapExercise);
}

export async function getExercise(db, id) {
  const row = await db.get(`SELECT ${COLUMNS} FROM exercises WHERE id = ?`, [id]);
  return row ? mapExercise(row) : null;
}

/** Finds a visible exercise by name, ignoring case. `excludeId` skips the exercise being edited. */
export async function findExerciseByName(db, name, excludeId = null) {
  const row = await db.get(
    `SELECT ${COLUMNS} FROM exercises WHERE LOWER(name) = LOWER(?) AND is_archived = 0 AND id != ?`,
    [name, excludeId ?? -1],
  );
  return row ? mapExercise(row) : null;
}

export async function insertExercise(db, { name, muscleGroup, instructions, notes }) {
  const res = await db.run(
    'INSERT INTO exercises (name, muscle_group, instructions, notes, is_custom) VALUES (?, ?, ?, ?, 1)',
    [name, muscleGroup, instructions, notes],
  );
  return res.lastId ?? (await db.get('SELECT MAX(id) AS id FROM exercises')).id;
}

export async function updateExercise(db, id, { name, muscleGroup, instructions, notes }) {
  await db.run('UPDATE exercises SET name = ?, muscle_group = ?, instructions = ?, notes = ? WHERE id = ?', [
    name,
    muscleGroup,
    instructions,
    notes,
    id,
  ]);
}

export async function deleteExercise(db, id) {
  await db.run('DELETE FROM exercises WHERE id = ?', [id]);
}

export async function archiveExercise(db, id) {
  await db.run('UPDATE exercises SET is_archived = 1 WHERE id = ?', [id]);
}

/** How many program slots use this exercise right now. */
export async function countProgramUses(db, id) {
  const row = await db.get('SELECT COUNT(*) AS n FROM program_exercises WHERE exercise_id = ?', [id]);
  return row.n;
}
