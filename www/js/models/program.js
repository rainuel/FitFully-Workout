// Program (the PLAN): what the user intends to do. Never used to rebuild history.
//
// Sets live in program_sets:
//   working sets  rep_min..rep_max (equal = exact reps), weight NULL, so they use
//                 the exercise's working_weight
//   warm-up sets  rep_min = rep_max = reps, with their own weight

function mapDay(row) {
  return {
    id: row.id,
    weekday: row.weekday, // ISO: 1 = Monday ... 7 = Sunday
    name: row.name,
    isRest: row.is_rest === 1,
    exerciseCount: row.exercise_count,
  };
}

export async function getActiveProgram(db) {
  return db.get('SELECT id, name FROM programs WHERE is_active = 1 ORDER BY id LIMIT 1');
}

/** All seven days of a program, Monday first. */
export async function getProgramDays(db, programId) {
  const rows = await db.all(
    `SELECT d.id, d.weekday, d.name, d.is_rest,
            (SELECT COUNT(*) FROM program_exercises pe WHERE pe.program_day_id = d.id) AS exercise_count
       FROM program_days d
      WHERE d.program_id = ?
      ORDER BY d.weekday`,
    [programId],
  );
  return rows.map(mapDay);
}

export async function getProgramDay(db, programId, weekday) {
  const row = await db.get(
    `SELECT d.id, d.weekday, d.name, d.is_rest,
            (SELECT COUNT(*) FROM program_exercises pe WHERE pe.program_day_id = d.id) AS exercise_count
       FROM program_days d
      WHERE d.program_id = ? AND d.weekday = ?`,
    [programId, weekday],
  );
  return row ? mapDay(row) : null;
}

export async function updateProgramDay(db, dayId, { name, isRest }) {
  await db.run('UPDATE program_days SET name = ?, is_rest = ? WHERE id = ?', [name, isRest, dayId]);
}

// ---- Program exercises -----------------------------------------------------

const EXERCISE_SELECT = `
  SELECT pe.id, pe.program_day_id, pe.exercise_id, pe.position, pe.working_weight, pe.weight_unit,
         pe.rest_seconds, pe.notes, e.name, e.muscle_group, e.instructions, d.weekday, d.name AS day_name
    FROM program_exercises pe
    JOIN exercises e ON e.id = pe.exercise_id
    JOIN program_days d ON d.id = pe.program_day_id`;

const SET_SELECT = `
  SELECT ps.program_exercise_id, ps.kind, ps.set_number, ps.rep_min, ps.rep_max, ps.weight
    FROM program_sets ps
    JOIN program_exercises pe ON pe.id = ps.program_exercise_id`;

function mapProgramExercise(row, setRows) {
  const ordered = setRows
    .filter((s) => s.program_exercise_id === row.id)
    .sort((a, b) => a.set_number - b.set_number);
  return {
    id: row.id,
    dayId: row.program_day_id,
    weekday: row.weekday,
    dayName: row.day_name,
    exerciseId: row.exercise_id,
    position: row.position,
    name: row.name,
    muscleGroup: row.muscle_group,
    instructions: row.instructions,
    workingWeight: row.working_weight,
    weightUnit: row.weight_unit,
    restSeconds: row.rest_seconds,
    notes: row.notes,
    workingSets: ordered.filter((s) => s.kind === 'working').map((s) => ({ min: s.rep_min, max: s.rep_max })),
    warmupSets: ordered.filter((s) => s.kind === 'warmup').map((s) => ({ reps: s.rep_min, weight: s.weight ?? 0 })),
  };
}

/** Every exercise planned for a day, in order, with its sets. */
export async function getDayExercises(db, dayId) {
  const rows = await db.all(`${EXERCISE_SELECT} WHERE pe.program_day_id = ? ORDER BY pe.position`, [dayId]);
  const setRows = await db.all(`${SET_SELECT} WHERE pe.program_day_id = ?`, [dayId]);
  return rows.map((row) => mapProgramExercise(row, setRows));
}

export async function getProgramExercise(db, id) {
  const row = await db.get(`${EXERCISE_SELECT} WHERE pe.id = ?`, [id]);
  if (!row) return null;
  const setRows = await db.all(`${SET_SELECT} WHERE pe.id = ?`, [id]);
  return mapProgramExercise(row, setRows);
}

async function writeSets(tx, programExerciseId, workingSets, warmupSets) {
  await tx.run('DELETE FROM program_sets WHERE program_exercise_id = ?', [programExerciseId]);
  for (let i = 0; i < warmupSets.length; i++) {
    const s = warmupSets[i];
    await tx.run(
      `INSERT INTO program_sets (program_exercise_id, kind, set_number, rep_min, rep_max, weight)
       VALUES (?, 'warmup', ?, ?, ?, ?)`,
      [programExerciseId, i + 1, s.reps, s.reps, s.weight],
    );
  }
  for (let i = 0; i < workingSets.length; i++) {
    const s = workingSets[i];
    await tx.run(
      `INSERT INTO program_sets (program_exercise_id, kind, set_number, rep_min, rep_max, weight)
       VALUES (?, 'working', ?, ?, ?, NULL)`,
      [programExerciseId, i + 1, s.min, s.max],
    );
  }
}

/** Adds an exercise to the end of a day. Returns the new program exercise id. */
export async function insertProgramExercise(
  db,
  { dayId, exerciseId, workingWeight, weightUnit, restSeconds, notes = null, workingSets, warmupSets = [] },
) {
  return db.transaction(async (tx) => {
    const next = await tx.get(
      'SELECT COALESCE(MAX(position), 0) + 1 AS position FROM program_exercises WHERE program_day_id = ?',
      [dayId],
    );
    const res = await tx.run(
      `INSERT INTO program_exercises (program_day_id, exercise_id, position, working_weight, weight_unit, rest_seconds, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [dayId, exerciseId, next.position, workingWeight, weightUnit, restSeconds, notes],
    );
    const id = res.lastId ?? (await tx.get('SELECT MAX(id) AS id FROM program_exercises')).id;
    await writeSets(tx, id, workingSets, warmupSets);
    return id;
  });
}

/** Replaces the plan for one exercise: weight, unit, rest, notes, and all sets. */
export async function updateProgramExercise(db, id, { workingWeight, weightUnit, restSeconds, notes, workingSets, warmupSets }) {
  await db.transaction(async (tx) => {
    await tx.run(
      `UPDATE program_exercises
          SET working_weight = ?, weight_unit = ?, rest_seconds = ?, notes = ?
        WHERE id = ?`,
      [workingWeight, weightUnit, restSeconds, notes, id],
    );
    await writeSets(tx, id, workingSets, warmupSets);
  });
}

/** Removes an exercise from its day and closes the gap in the ordering. History is untouched (its link is set to NULL). */
export async function deleteProgramExercise(db, id) {
  await db.transaction(async (tx) => {
    const row = await tx.get('SELECT program_day_id FROM program_exercises WHERE id = ?', [id]);
    if (!row) return;
    await tx.run('DELETE FROM program_exercises WHERE id = ?', [id]);
    const remaining = await tx.all(
      'SELECT id FROM program_exercises WHERE program_day_id = ? ORDER BY position, id',
      [row.program_day_id],
    );
    for (let i = 0; i < remaining.length; i++) {
      await tx.run('UPDATE program_exercises SET position = ? WHERE id = ?', [i + 1, remaining[i].id]);
    }
  });
}

/** Sets the order of a day's exercises. `orderedIds` must be exactly the day's current exercises. */
export async function setExerciseOrder(db, dayId, orderedIds) {
  await db.transaction(async (tx) => {
    const current = await tx.all('SELECT id FROM program_exercises WHERE program_day_id = ?', [dayId]);
    const known = new Set(current.map((r) => r.id));
    const valid =
      orderedIds.length === known.size && new Set(orderedIds).size === orderedIds.length && orderedIds.every((id) => known.has(id));
    if (!valid) throw new Error('The new order does not match this day’s exercises.');
    for (let i = 0; i < orderedIds.length; i++) {
      await tx.run('UPDATE program_exercises SET position = ? WHERE id = ?', [i + 1, orderedIds[i]]);
    }
  });
}
