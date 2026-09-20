// First-launch seed data: settings, profile row, exercise library, and the
// default weekly program. Runs in ONE transaction and marks itself done at the
// end, so an interrupted first launch simply seeds again next time.
//
// Seeding never touches workout history and never overwrites existing settings.

import { EXERCISE_LIBRARY } from './exercise-library.js';

export const SEED_VERSION = 1;

export const DEFAULT_SETTINGS = {
  weight_unit: 'lbs',
  weight_increment: '5',
  default_rest_seconds: '90',
  notif_enabled: '0',
  notif_time: '07:00',
  launch_count: '0',
};

// ISO weekday: 1 = Monday ... 7 = Sunday
export const DEFAULT_WEEK = [
  { weekday: 1, name: 'Push', isRest: false },
  { weekday: 2, name: 'Pull', isRest: false },
  { weekday: 3, name: 'Legs', isRest: false },
  { weekday: 4, name: 'Rest', isRest: true },
  { weekday: 5, name: 'Upper', isRest: false },
  { weekday: 6, name: 'Lower', isRest: false },
  { weekday: 7, name: 'Rest', isRest: true },
];

export const DEFAULT_PROGRAM_NAME = 'My Program';

/** Seeds the database if it has not been seeded yet. Returns { seeded }. */
export async function seedIfNeeded(db) {
  const row = await db.get(`SELECT value FROM settings WHERE key = 'seed_version'`);
  if (row && Number(row.value) >= SEED_VERSION) {
    return { seeded: false };
  }

  const now = new Date().toISOString();

  await db.transaction(async (tx) => {
    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
      await tx.run('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)', [key, value]);
    }
    await tx.run('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)', ['first_launch_at', now]);

    await tx.run('INSERT OR IGNORE INTO profile (id, height_cm, created_at) VALUES (1, NULL, ?)', [now]);

    for (const ex of EXERCISE_LIBRARY) {
      await tx.run(
        'INSERT INTO exercises (name, muscle_group, instructions, is_custom) VALUES (?, ?, ?, 0)',
        [ex.name, ex.muscle, ex.instructions],
      );
    }

    const program = await tx.run('INSERT INTO programs (name, is_active) VALUES (?, 1)', [DEFAULT_PROGRAM_NAME]);
    const programId = program.lastId ?? (await tx.get('SELECT MAX(id) AS id FROM programs')).id;
    for (const day of DEFAULT_WEEK) {
      await tx.run(
        'INSERT INTO program_days (program_id, weekday, name, is_rest) VALUES (?, ?, ?, ?)',
        [programId, day.weekday, day.name, day.isRest],
      );
    }

    await tx.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', ['seed_version', String(SEED_VERSION)]);
  });

  return { seeded: true };
}
