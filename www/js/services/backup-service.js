// Backup, restore, and CSV export logic. Screens call these functions; they
// never write SQL. Getting a file to and from the phone is the file adapter's
// job; this file only builds and checks the text.

import { SEED_VERSION } from '../db/seed.js';
import { LATEST_SCHEMA_VERSION } from '../db/migrations.js';
import * as M from '../models/backup.js';
import { getSetting, setSetting } from '../models/settings.js';
import { getSchemaVersion } from '../models/system.js';
import {
  BACKUP_TABLES,
  MAX_BACKUP_BYTES,
  backupFilename,
  buildBackup,
  buildWorkoutCsv,
  summarizeTables,
  validateBackup,
  workoutCsvFilename,
} from './backup-rules.js';
import { syncReminders } from './notification-service.js';

export { MAX_BACKUP_BYTES };

// Spreadsheet apps need this marker to read accents and symbols in a UTF-8 CSV correctly.
const BYTE_ORDER_MARK = '\uFEFF';

/** The full backup as text, ready to save or share. Returns { filename, text, summary }. */
export async function createBackup(db, now = new Date()) {
  const tables = await M.readAllTables(db, BACKUP_TABLES);
  const backup = buildBackup(tables, { now, schemaVersion: await getSchemaVersion(db) });
  return { filename: backupFilename(now), text: JSON.stringify(backup), summary: summarizeTables(tables) };
}

/** Remembers when a backup was last handed off (shown on the Profile screen). */
export async function recordBackupExport(db, now = new Date()) {
  await setSetting(db, 'last_backup_at', now.toISOString());
}

export async function loadBackupStatus(db) {
  return { lastBackupAt: await getSetting(db, 'last_backup_at') };
}

/** Workout history as CSV text. Returns { filename, text, rowCount }. */
export async function createWorkoutCsv(db, now = new Date()) {
  const rows = await M.listLoggedSetRows(db);
  return { filename: workoutCsvFilename(now), text: BYTE_ORDER_MARK + buildWorkoutCsv(rows), rowCount: rows.length };
}

/**
 * Reads and checks the text of a backup file WITHOUT changing anything.
 * Returns { ok: true, backup } (pass `backup` to restoreBackup) or { ok: false, errors }.
 */
export function inspectBackup(text) {
  let parsed;
  try {
    parsed = JSON.parse(String(text).replace(/^\uFEFF/, ''));
  } catch {
    return { ok: false, errors: ['This file isn’t a Fit Fully backup.'] };
  }
  const checked = validateBackup(parsed, { latestSchemaVersion: LATEST_SCHEMA_VERSION });
  return checked.ok ? { ok: true, backup: checked } : checked;
}

/**
 * Replaces everything on this device with the backup. All or nothing: if any
 * part fails, nothing changes. Returns { ok: true, summary } or { ok: false, errors }.
 */
export async function restoreBackup(db, backup) {
  const tables = {
    ...backup.tables,
    // Without this row the app would seed its defaults on top of the restored data at next launch.
    settings: [...backup.tables.settings.filter((s) => s.key !== 'seed_version'), { key: 'seed_version', value: String(SEED_VERSION) }],
  };

  try {
    await M.replaceAllTables(db, BACKUP_TABLES, tables);
  } catch (err) {
    console.error('Restore failed and was rolled back', err);
    return {
      ok: false,
      errors: ['That backup couldn’t be restored. Nothing on this phone was changed.'],
      detail: String(err?.message ?? err),
    };
  }

  try {
    await syncReminders(db);
  } catch (err) {
    console.error('Backup restored, but reminders could not be rescheduled', err);
  }
  return { ok: true, summary: backup.summary };
}
