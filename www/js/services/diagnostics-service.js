// Phase 1 "foundation check": proves the database opened, migrated, seeded, and
// persisted across launches. Shown on the Profile screen. Remove in Phase 8.

import { LATEST_SCHEMA_VERSION } from '../db/migrations.js';
import { getSetting } from '../models/settings.js';
import { countRows, getForeignKeysEnabled, getSchemaVersion } from '../models/system.js';
import { getActiveProgram, getProgramDays } from '../models/program.js';

export async function getFoundationReport(db) {
  const program = await getActiveProgram(db);
  const days = program ? await getProgramDays(db, program.id) : [];

  return {
    schemaVersion: await getSchemaVersion(db),
    latestSchemaVersion: LATEST_SCHEMA_VERSION,
    launchCount: Number(await getSetting(db, 'launch_count', '0')),
    firstLaunchAt: await getSetting(db, 'first_launch_at'),
    foreignKeys: await getForeignKeysEnabled(db),
    exerciseCount: await countRows(db, 'exercises'),
    programName: program ? program.name : null,
    dayCount: days.length,
    restDayCount: days.filter((d) => d.isRest).length,
    weekSummary: days.map((d) => `${d.name}`).join(', '),
  };
}
