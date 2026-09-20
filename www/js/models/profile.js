// Profile and bodyweight records (SQL only).
//
// The profile row (id = 1) holds height. Bodyweight records are kept apart
// from workouts: logging bodyweight never touches the program or any workout.

export async function getHeightCm(db) {
  const row = await db.get('SELECT height_cm FROM profile WHERE id = 1');
  return row?.height_cm ?? null;
}

export async function setHeightCm(db, heightCm) {
  await db.run(
    `INSERT INTO profile (id, height_cm, created_at) VALUES (1, ?, ?)
     ON CONFLICT(id) DO UPDATE SET height_cm = excluded.height_cm`,
    [heightCm, new Date().toISOString()],
  );
}

const SELECT_RECORD = 'SELECT id, recorded_on AS date, weight, unit FROM bodyweight_records';

/** Every record, oldest first. */
export async function listBodyweight(db) {
  return db.all(`${SELECT_RECORD} ORDER BY recorded_on ASC, id ASC`);
}

export async function countBodyweight(db) {
  return (await db.get('SELECT COUNT(*) AS n FROM bodyweight_records')).n;
}

export async function getBodyweightOn(db, date) {
  return db.get(`${SELECT_RECORD} WHERE recorded_on = ? ORDER BY id DESC LIMIT 1`, [date]);
}

/** One record per date: logging again for a date replaces it. Returns { replaced }. */
export async function saveBodyweight(db, { date, weight, unit }) {
  return db.transaction(async (tx) => {
    const existing = await tx.get(`${SELECT_RECORD} WHERE recorded_on = ? ORDER BY id DESC LIMIT 1`, [date]);
    if (existing) {
      await tx.run('UPDATE bodyweight_records SET weight = ?, unit = ? WHERE id = ?', [weight, unit, existing.id]);
      await tx.run('DELETE FROM bodyweight_records WHERE recorded_on = ? AND id <> ?', [date, existing.id]);
      return { replaced: true };
    }
    await tx.run('INSERT INTO bodyweight_records (recorded_on, weight, unit) VALUES (?, ?, ?)', [date, weight, unit]);
    return { replaced: false };
  });
}

export async function deleteBodyweight(db, id) {
  await db.run('DELETE FROM bodyweight_records WHERE id = ?', [id]);
}
