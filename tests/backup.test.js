import test from 'node:test';
import assert from 'node:assert/strict';
import { LATEST_SCHEMA_VERSION } from '../www/js/db/migrations.js';
import { seedIfNeeded } from '../www/js/db/seed.js';
import { getSetting, setSetting } from '../www/js/models/settings.js';
import { saveBodyweight, setHeightCm } from '../www/js/models/profile.js';
import { readAllTables } from '../www/js/models/backup.js';
import {
  BACKUP_APP,
  BACKUP_FORMAT,
  BACKUP_TABLES,
  backupFilename,
  buildWorkoutCsv,
  csvCell,
  validateBackup,
  workoutCsvFilename,
} from '../www/js/services/backup-rules.js';
import {
  createBackup,
  createWorkoutCsv,
  inspectBackup,
  loadBackupStatus,
  recordBackupExport,
  restoreBackup,
} from '../www/js/services/backup-service.js';
import { at, logWorkout, planDay, setupDb } from './helpers/scenario.js';

// Monday 7 Sep 2026 and Tuesday 8 Sep 2026.
const MON = at(2026, 9, 7, 10);
const TUE = at(2026, 9, 8, 10);

async function tablesOf(db) {
  return readAllTables(db, BACKUP_TABLES);
}

/** A device with a plan, two finished workouts, bodyweight, height, and a changed setting. */
async function busyDevice() {
  const db = await setupDb();
  await planDay(db, 1, [
    { name: 'Bench Press', weight: 100, warmups: [{ reps: 10, weight: 45 }] },
    { name: 'Shoulder Press', weight: 60 },
  ]);
  await planDay(db, 2, [{ name: 'Barbell Row', weight: 90 }]);
  await logWorkout(db, MON, { 'Bench Press': [[100, 10], [100, 9], [100, 8]], 'Shoulder Press': [[60, 12], [60, 12], [60, 12]] }, { warmups: true });
  await logWorkout(db, TUE, { 'Barbell Row': [[90, 10], [90, 10], [90, 9]] });
  await saveBodyweight(db, { date: '2026-09-07', weight: 165.5, unit: 'lbs' });
  await saveBodyweight(db, { date: '2026-09-14', weight: 166, unit: 'lbs' });
  await setHeightCm(db, 178);
  await setSetting(db, 'weight_increment', '2.5');
  return db;
}

async function backupOf(db) {
  const made = await createBackup(db, new Date(2026, 8, 20, 9, 30));
  return JSON.parse(made.text);
}

// ---- The backup covers the whole schema ---------------------------------------------

test('BACKUP_TABLES lists every table and column in the database', async () => {
  const db = await setupDb();
  const tables = (await db.all(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`))
    .map((r) => r.name)
    .filter((name) => name !== 'schema_migrations')
    .sort();
  assert.deepEqual(BACKUP_TABLES.map((t) => t.name).sort(), tables, 'a table is missing from (or extra in) BACKUP_TABLES');

  for (const def of BACKUP_TABLES) {
    const columns = (await db.all(`PRAGMA table_info(${def.name})`)).map((c) => c.name).sort();
    assert.deepEqual([...def.columns].sort(), columns, `columns of ${def.name} differ from the schema`);
    assert.ok(def.columns.includes(def.orderBy), `${def.name} orderBy must be one of its columns`);
  }
});

test('filenames carry the local date', () => {
  const now = new Date(2026, 8, 5, 23, 59);
  assert.equal(backupFilename(now), 'fitfully-backup-2026-09-05.json');
  assert.equal(workoutCsvFilename(now), 'fitfully-workouts-2026-09-05.csv');
});

// ---- Export ------------------------------------------------------------------------------

test('a backup is a labelled file with every table and no migration bookkeeping', async () => {
  const db = await busyDevice();
  const made = await createBackup(db, new Date(2026, 8, 20, 9, 30));
  assert.equal(made.filename, 'fitfully-backup-2026-09-20.json');
  assert.deepEqual(made.summary, { workouts: 2, bodyweightEntries: 2, firstWorkout: '2026-09-07', lastWorkout: '2026-09-08' });

  const file = JSON.parse(made.text);
  assert.equal(file.app, BACKUP_APP);
  assert.equal(file.format, BACKUP_FORMAT);
  assert.equal(file.schemaVersion, LATEST_SCHEMA_VERSION);
  assert.equal(typeof file.exportedAt, 'string');
  assert.deepEqual(Object.keys(file.tables).sort(), BACKUP_TABLES.map((t) => t.name).sort());
  assert.equal(file.tables.schema_migrations, undefined);
  assert.equal(file.tables.workout_sessions.length, 2);
  assert.equal(file.tables.bodyweight_records.length, 2);
  assert.equal(file.tables.profile[0].height_cm, 178);
});

test('the time of the last backup is remembered', async () => {
  const db = await setupDb();
  assert.equal((await loadBackupStatus(db)).lastBackupAt, null);
  await recordBackupExport(db, new Date(2026, 8, 20, 9, 30));
  assert.equal((await loadBackupStatus(db)).lastBackupAt, new Date(2026, 8, 20, 9, 30).toISOString());
});

// ---- Restore: the round trip -----------------------------------------------------------

test('restoring onto a fresh phone brings back everything, exactly', async () => {
  const oldPhone = await busyDevice();
  const file = await backupOf(oldPhone);

  const newPhone = await setupDb(); // just installed: seeded defaults only
  const inspected = inspectBackup(JSON.stringify(file));
  assert.equal(inspected.ok, true);
  const result = await restoreBackup(newPhone, inspected.backup);
  assert.equal(result.ok, true);
  assert.equal(result.summary.workouts, 2);

  const before = await tablesOf(oldPhone);
  const after = await tablesOf(newPhone);
  assert.deepEqual(after, before);
});

test('restore replaces what was on the phone; it does not merge', async () => {
  const oldPhone = await busyDevice();
  const file = await backupOf(oldPhone);

  const other = await setupDb();
  await planDay(other, 3, [{ name: 'Squat', weight: 200 }]);
  await logWorkout(other, at(2026, 9, 9, 10), { Squat: [[200, 8], [200, 8], [200, 8]] });
  await saveBodyweight(other, { date: '2026-09-09', weight: 190, unit: 'lbs' });

  const inspected = inspectBackup(JSON.stringify(file));
  assert.equal((await restoreBackup(other, inspected.backup)).ok, true);

  const names = (await other.all('SELECT DISTINCT exercise_name AS n FROM workout_exercises ORDER BY n')).map((r) => r.n);
  assert.deepEqual(names, ['Barbell Row', 'Bench Press', 'Shoulder Press']);
  assert.equal((await other.get('SELECT COUNT(*) AS n FROM workout_sessions')).n, 2);
  assert.equal((await other.get('SELECT COUNT(*) AS n FROM bodyweight_records')).n, 2);
  assert.equal((await other.get('SELECT COUNT(*) AS n FROM program_exercises')).n, 3);
});

test('history stays exactly as logged, and links between tables survive', async () => {
  const oldPhone = await busyDevice();
  const inspected = inspectBackup((await createBackup(oldPhone)).text);
  const newPhone = await setupDb();
  await restoreBackup(newPhone, inspected.backup);

  const sets = await newPhone.all(
    `SELECT ws.kind, ws.weight, ws.reps, we.exercise_name, we.weight_unit
       FROM workout_sets ws JOIN workout_exercises we ON we.id = ws.workout_exercise_id
      WHERE we.exercise_name = 'Bench Press' AND ws.completed = 1 ORDER BY ws.kind DESC, ws.set_number`,
  );
  assert.deepEqual(
    sets.map((s) => [s.kind, s.weight, s.reps]),
    [['working', 100, 10], ['working', 100, 9], ['working', 100, 8], ['warmup', 45, 10]],
  );

  const orphans = await newPhone.all('PRAGMA foreign_key_check');
  assert.equal(orphans.length, 0);
  const linked = await newPhone.get(
    `SELECT COUNT(*) AS n FROM workout_exercises we JOIN program_exercises pe ON pe.id = we.program_exercise_id`,
  );
  assert.ok(linked.n > 0, 'workout exercises keep their link to the program');
});

test('settings come back, and the seed is not run again on top of restored data', async () => {
  const oldPhone = await busyDevice();
  const inspected = inspectBackup((await createBackup(oldPhone)).text);
  const newPhone = await setupDb();
  await restoreBackup(newPhone, inspected.backup);

  assert.equal(await getSetting(newPhone, 'weight_increment'), '2.5');
  assert.equal(await getSetting(newPhone, 'seed_version'), '1');
  assert.deepEqual(await seedIfNeeded(newPhone), { seeded: false });
  assert.equal((await newPhone.get('SELECT COUNT(*) AS n FROM programs')).n, 1);
});

test('a backup that lacks the seed marker still cannot cause a second seed', async () => {
  const oldPhone = await busyDevice();
  const file = await backupOf(oldPhone);
  file.tables.settings = file.tables.settings.filter((s) => s.key !== 'seed_version');
  const newPhone = await setupDb();
  assert.equal((await restoreBackup(newPhone, inspectBackup(JSON.stringify(file)).backup)).ok, true);
  assert.deepEqual(await seedIfNeeded(newPhone), { seeded: false });
});

test('a large history restores correctly (rows are written in batches)', async () => {
  const db = await setupDb();
  const file = await backupOf(db);
  const start = file.tables.bodyweight_records.length;
  file.tables.bodyweight_records = Array.from({ length: 1200 }, (_, i) => ({ id: start + i + 1, recorded_on: `2024-01-${String((i % 28) + 1).padStart(2, '0')}`, weight: 150 + i / 100, unit: 'lbs' }));
  const target = await setupDb();
  const inspected = inspectBackup(JSON.stringify(file));
  assert.equal((await restoreBackup(target, inspected.backup)).ok, true);
  assert.equal((await target.get('SELECT COUNT(*) AS n FROM bodyweight_records')).n, 1200);
});

test('a backup from an older version of the schema restores with defaults filled in', async () => {
  const oldPhone = await busyDevice();
  const file = await backupOf(oldPhone);
  file.schemaVersion = 1;
  for (const s of file.tables.workout_sessions) {
    delete s.paused_at;
    delete s.paused_ms;
  }
  const newPhone = await setupDb();
  const result = await restoreBackup(newPhone, inspectBackup(JSON.stringify(file)).backup);
  assert.equal(result.ok, true);
  const sessions = await newPhone.all('SELECT paused_at, paused_ms FROM workout_sessions');
  assert.equal(sessions.length, 2);
  for (const s of sessions) {
    assert.equal(s.paused_at, null);
    assert.equal(s.paused_ms, 0);
  }
});

test('an unfinished workout in a backup can be resumed after restoring', async () => {
  const oldPhone = await busyDevice();
  const { startWorkout, getActiveSession } = await import('../www/js/services/workout-service.js');
  assert.equal((await startWorkout(oldPhone, at(2026, 9, 14, 10))).ok, true);
  const inspected = inspectBackup((await createBackup(oldPhone)).text);
  const newPhone = await setupDb();
  await restoreBackup(newPhone, inspected.backup);
  const active = await getActiveSession(newPhone);
  assert.ok(active, 'the in-progress workout came across');
});

// ---- Restore: bad files are refused and change nothing -----------------------------------------------

async function assertRefused(db, text, pattern) {
  const before = await tablesOf(db);
  const inspected = inspectBackup(text);
  assert.equal(inspected.ok, false, 'the file should be refused');
  assert.match(inspected.errors[0], pattern);
  assert.deepEqual(await tablesOf(db), before, 'nothing on the phone may change');
}

test('files that are not backups are refused', async () => {
  const db = await busyDevice();
  await assertRefused(db, 'this is not json', /isn’t a Fit Fully backup/);
  await assertRefused(db, '[]', /isn’t a Fit Fully backup/);
  await assertRefused(db, JSON.stringify({ hello: 'world' }), /isn’t a Fit Fully backup/);
  await assertRefused(db, JSON.stringify({ app: 'some-other-app', format: 1, schemaVersion: 1, tables: {} }), /isn’t a Fit Fully backup/);
});

test('a backup from a newer Fit Fully is refused', async () => {
  const db = await busyDevice();
  const file = await backupOf(db);
  await assertRefused(db, JSON.stringify({ ...file, schemaVersion: LATEST_SCHEMA_VERSION + 1 }), /newer version/);
  await assertRefused(db, JSON.stringify({ ...file, format: BACKUP_FORMAT + 1 }), /newer version/);
});

test('a damaged backup is refused', async () => {
  const db = await busyDevice();
  const file = await backupOf(db);

  await assertRefused(db, JSON.stringify({ ...file, tables: 'nope' }), /damaged/);
  await assertRefused(db, JSON.stringify({ ...file, schemaVersion: 'two' }), /damaged/);
  await assertRefused(db, JSON.stringify({ ...file, tables: { ...file.tables, workout_sets: {} } }), /damaged/);
  await assertRefused(db, JSON.stringify({ ...file, tables: { ...file.tables, exercises: [42] } }), /damaged/);
  await assertRefused(
    db,
    JSON.stringify({ ...file, tables: { ...file.tables, exercises: [{ ...file.tables.exercises[0], name: { nested: true } }] } }),
    /damaged/,
  );
});

test('a backup with no workout program is refused', async () => {
  const db = await busyDevice();
  const file = await backupOf(db);
  await assertRefused(db, JSON.stringify({ ...file, tables: { ...file.tables, programs: [] } }), /no workout program/);
  await assertRefused(db, JSON.stringify({ ...file, tables: { ...file.tables, program_days: [] } }), /no workout program/);
});

test('a backup that fails half-way through is rolled back completely', async () => {
  const db = await busyDevice();
  const file = await backupOf(db);
  // A workout exercise pointing at a session that is not in the file: the database refuses it mid-restore.
  file.tables.workout_exercises[0].session_id = 9999;

  const before = await tablesOf(db);
  const inspected = inspectBackup(JSON.stringify(file));
  assert.equal(inspected.ok, true, 'this problem is only found by the database');

  const originalError = console.error;
  console.error = () => {};
  let result;
  try {
    result = await restoreBackup(db, inspected.backup);
  } finally {
    console.error = originalError;
  }
  assert.equal(result.ok, false);
  assert.match(result.errors[0], /Nothing on this phone was changed/);
  assert.deepEqual(await tablesOf(db), before);
});

test('unknown tables and columns from a file are ignored, not written', async () => {
  const db = await setupDb();
  const file = await backupOf(db);
  file.tables.mystery = [{ a: 1 }];
  file.tables.exercises[0].sneaky = 'x';
  const checked = validateBackup(file, { latestSchemaVersion: LATEST_SCHEMA_VERSION });
  assert.equal(checked.ok, true);
  assert.equal(checked.tables.mystery, undefined);
  assert.equal(checked.tables.exercises[0].sneaky, undefined);
});

test('a byte-order mark at the start of a backup is tolerated', async () => {
  const db = await setupDb();
  const text = '\uFEFF' + (await createBackup(db)).text;
  assert.equal(inspectBackup(text).ok, true);
});

// ---- CSV ---------------------------------------------------------------------------------------------

test('CSV cells are quoted when needed and cannot become spreadsheet formulas', () => {
  assert.equal(csvCell('Bench Press'), 'Bench Press');
  assert.equal(csvCell('Press, incline'), '"Press, incline"');
  assert.equal(csvCell('He said "go"'), '"He said ""go"""');
  assert.equal(csvCell('two\nlines'), '"two\nlines"');
  assert.equal(csvCell('=SUM(A1:A9)'), "'=SUM(A1:A9)");
  assert.equal(csvCell('@home'), "'@home");
  assert.equal(csvCell('-cmd'), "'-cmd");
  assert.equal(csvCell(null), '');
  assert.equal(csvCell(undefined), '');
  assert.equal(csvCell(0), '0');
  assert.equal(csvCell(-5), '-5');
});

test('the CSV has one line per completed set, with a header and Windows line endings', () => {
  const csv = buildWorkoutCsv([
    { date: '2026-09-07', dayName: 'Push', exerciseName: 'Bench Press', kind: 'warmup', setNumber: 1, weight: 45, unit: 'lbs', reps: 10, targetWeight: 45, targetRepMin: 10, targetRepMax: 10 },
    { date: '2026-09-07', dayName: 'Push', exerciseName: 'Bench Press', kind: 'working', setNumber: 1, weight: 27.5, unit: 'kg', reps: 9, targetWeight: 30, targetRepMin: 8, targetRepMax: 12 },
  ]);
  assert.equal(
    csv,
    [
      'Date,Workout,Exercise,Set type,Set,Weight,Unit,Reps,Target weight,Target reps min,Target reps max',
      '2026-09-07,Push,Bench Press,Warm-up,1,45,lbs,10,45,10,10',
      '2026-09-07,Push,Bench Press,Working,1,27.5,kg,9,30,8,12',
      '',
    ].join('\r\n'),
  );
});

test('an empty history exports just the header', () => {
  assert.equal(buildWorkoutCsv([]).split('\r\n').length, 2);
});

test('the workout CSV comes from the history tables, finished workouts only', async () => {
  const db = await busyDevice();
  const { startWorkout } = await import('../www/js/services/workout-service.js');
  await startWorkout(db, at(2026, 9, 14, 10)); // an unfinished workout must not be exported

  const csv = await createWorkoutCsv(db, new Date(2026, 8, 20));
  assert.equal(csv.filename, 'fitfully-workouts-2026-09-20.csv');
  assert.ok(csv.text.startsWith('\uFEFFDate,Workout,'), 'starts with a byte-order mark for spreadsheet apps');

  const lines = csv.text.slice(1).trimEnd().split('\r\n');
  // Bench: 1 warm-up + 3 working; Shoulder Press: 3 working; Row: 3 working.
  assert.equal(csv.rowCount, 10);
  assert.equal(lines.length, 11);
  assert.deepEqual(lines.slice(1, 5), [
    '2026-09-07,Push,Bench Press,Warm-up,1,45,lbs,10,45,10,10',
    '2026-09-07,Push,Bench Press,Working,1,100,lbs,10,100,8,12',
    '2026-09-07,Push,Bench Press,Working,2,100,lbs,9,100,8,12',
    '2026-09-07,Push,Bench Press,Working,3,100,lbs,8,100,8,12',
  ]);
  assert.match(lines[5], /^2026-09-07,Push,Shoulder Press,Working,1,60,lbs,12,60,8,12$/);
  assert.match(lines[10], /^2026-09-08,Pull,Barbell Row,Working,3,90,lbs,9,90,8,12$/);
});

test('the CSV keeps history as it was after the program changes', async () => {
  const db = await busyDevice();
  const before = (await createWorkoutCsv(db)).text;
  await db.run('UPDATE program_exercises SET working_weight = 300');
  await db.run('DELETE FROM program_exercises');
  assert.equal((await createWorkoutCsv(db)).text, before);
});

test('exporting changes nothing in the database', async () => {
  const db = await busyDevice();
  const before = await tablesOf(db);
  await createBackup(db);
  await createWorkoutCsv(db);
  assert.deepEqual(await tablesOf(db), before);
});
