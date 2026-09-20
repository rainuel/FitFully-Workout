import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb } from './helpers/node-db.js';
import { runMigrations } from '../www/js/db/migrations.js';
import { DEFAULT_WEEK, seedIfNeeded } from '../www/js/db/seed.js';
import { EXERCISE_LIBRARY } from '../www/js/db/exercise-library.js';
import { getActiveProgram, getProgramDays } from '../www/js/models/program.js';
import { getAllSettings, recordLaunch } from '../www/js/models/settings.js';

async function seededDb() {
  const db = createTestDb();
  await runMigrations(db);
  await seedIfNeeded(db);
  return db;
}

test('seeds the default weekly program: Push, Pull, Legs, Rest, Upper, Lower, Rest', async () => {
  const db = await seededDb();
  const program = await getActiveProgram(db);
  const days = await getProgramDays(db, program.id);
  assert.deepEqual(
    days.map((d) => [d.weekday, d.name, d.isRest]),
    [
      [1, 'Push', false],
      [2, 'Pull', false],
      [3, 'Legs', false],
      [4, 'Rest', true],
      [5, 'Upper', false],
      [6, 'Lower', false],
      [7, 'Rest', true],
    ],
  );
  assert.equal(days.length, DEFAULT_WEEK.length);
});

test('seeds the exercise library and default settings', async () => {
  const db = await seededDb();
  const n = await db.get('SELECT COUNT(*) AS n FROM exercises');
  assert.equal(n.n, EXERCISE_LIBRARY.length);
  const names = EXERCISE_LIBRARY.map((e) => e.name);
  assert.equal(new Set(names).size, names.length, 'library names must be unique');
  assert.ok(EXERCISE_LIBRARY.every((e) => e.muscle && e.instructions));

  const settings = await getAllSettings(db);
  assert.equal(settings.weight_unit, 'lbs');
  assert.equal(settings.weight_increment, '5');
  assert.equal(settings.seed_version, '1');
  assert.ok(settings.first_launch_at);
});

test('seeding twice does not duplicate anything', async () => {
  const db = await seededDb();
  const again = await seedIfNeeded(db);
  assert.equal(again.seeded, false);
  const counts = await db.get(
    'SELECT (SELECT COUNT(*) FROM programs) AS programs, (SELECT COUNT(*) FROM program_days) AS days, (SELECT COUNT(*) FROM exercises) AS exercises',
  );
  assert.deepEqual({ ...counts }, { programs: 1, days: 7, exercises: EXERCISE_LIBRARY.length });
});

test('recordLaunch counts each app start and keeps the first-launch time', async () => {
  const db = await seededDb();
  const first = await recordLaunch(db);
  const second = await recordLaunch(db);
  assert.equal(first.launchCount, 1);
  assert.equal(second.launchCount, 2);
  assert.equal(second.firstLaunchAt, first.firstLaunchAt);
});
