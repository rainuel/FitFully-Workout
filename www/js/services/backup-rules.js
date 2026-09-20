// Backup and export rules. Pure functions: no database, no plugin, no DOM.
//
// A backup is one JSON file holding every user table, row for row, with the
// original ids so links between tables survive. Restore REPLACES the data on
// the device; it never merges.
//
// BACKUP_TABLES is in insertion order (parents before children). Restore
// deletes in the reverse order. When a migration adds a column or table, it
// must be added here too (a test fails until it is).

import { formatWeight } from '../utils/format.js';

export const BACKUP_APP = 'fit-fully';
export const BACKUP_FORMAT = 1;
export const MAX_BACKUP_BYTES = 50 * 1024 * 1024;

export const BACKUP_TABLES = [
  { name: 'settings', columns: ['key', 'value'], orderBy: 'key' },
  { name: 'profile', columns: ['id', 'height_cm', 'created_at'], orderBy: 'id' },
  { name: 'bodyweight_records', columns: ['id', 'recorded_on', 'weight', 'unit'], orderBy: 'id' },
  { name: 'exercises', columns: ['id', 'name', 'muscle_group', 'instructions', 'notes', 'is_custom', 'is_archived'], orderBy: 'id' },
  { name: 'programs', columns: ['id', 'name', 'is_active'], orderBy: 'id' },
  { name: 'program_days', columns: ['id', 'program_id', 'weekday', 'name', 'is_rest'], orderBy: 'id' },
  {
    name: 'program_exercises',
    columns: ['id', 'program_day_id', 'exercise_id', 'position', 'working_weight', 'weight_unit', 'rest_seconds', 'notes'],
    orderBy: 'id',
  },
  { name: 'program_sets', columns: ['id', 'program_exercise_id', 'kind', 'set_number', 'rep_min', 'rep_max', 'weight'], orderBy: 'id' },
  {
    name: 'workout_sessions',
    columns: [
      'id',
      'session_date',
      'weekday',
      'day_name',
      'status',
      'started_at',
      'finished_at',
      'exercises_planned',
      'exercises_completed',
      'rest_ends_at',
      'notes',
      'paused_at',
      'paused_ms',
    ],
    orderBy: 'id',
  },
  {
    name: 'workout_exercises',
    columns: [
      'id',
      'session_id',
      'exercise_id',
      'program_exercise_id',
      'exercise_name',
      'position',
      'target_weight',
      'weight_unit',
      'rest_seconds',
      'status',
      'progression_state',
      'suggested_weight',
    ],
    orderBy: 'id',
  },
  {
    name: 'workout_sets',
    columns: [
      'id',
      'workout_exercise_id',
      'kind',
      'set_number',
      'target_rep_min',
      'target_rep_max',
      'target_weight',
      'weight',
      'reps',
      'weight_unit',
      'completed',
      'completed_at',
    ],
    orderBy: 'id',
  },
  { name: 'schedule_log', columns: ['date', 'weekday', 'day_name', 'outcome'], orderBy: 'date' },
  { name: 'progression_events', columns: ['id', 'exercise_id', 'exercise_name', 'from_weight', 'to_weight', 'unit', 'created_at'], orderBy: 'id' },
  { name: 'achievements', columns: ['code', 'unlocked_at'], orderBy: 'code' },
];

// ---- Files --------------------------------------------------------------------

function pad2(n) {
  return String(n).padStart(2, '0');
}

function localDate(now) {
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

export function backupFilename(now = new Date()) {
  return `fitfully-backup-${localDate(now)}.json`;
}

export function workoutCsvFilename(now = new Date()) {
  return `fitfully-workouts-${localDate(now)}.csv`;
}

// ---- Backup file ----------------------------------------------------------------

/** The object that is written to a .json backup. `tables` maps table name -> rows. */
export function buildBackup(tables, { now = new Date(), schemaVersion }) {
  return {
    app: BACKUP_APP,
    format: BACKUP_FORMAT,
    schemaVersion,
    exportedAt: now.toISOString(),
    tables,
  };
}

/** Short facts about a set of tables, shown before a restore and after an export. */
export function summarizeTables(tables) {
  const done = (tables.workout_sessions ?? []).filter((s) => s.status === 'completed');
  const dates = done.map((s) => s.session_date).filter(Boolean).sort();
  return {
    workouts: done.length,
    bodyweightEntries: (tables.bodyweight_records ?? []).length,
    firstWorkout: dates[0] ?? null,
    lastWorkout: dates[dates.length - 1] ?? null,
  };
}

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isCellValue = (v) => v === null || typeof v === 'string' || (typeof v === 'number' && Number.isFinite(v));

const damaged = (where) => ({ ok: false, errors: [`This backup file is damaged${where ? ` (${where})` : ''}, so it can’t be restored.`] });

/**
 * Checks a parsed backup before anything on the device is touched.
 * Returns { ok: true, tables, exportedAt, summary } with rows cleaned down to
 * known columns, or { ok: false, errors: [message] }.
 */
export function validateBackup(input, { latestSchemaVersion }) {
  if (!isPlainObject(input) || input.app !== BACKUP_APP) {
    return { ok: false, errors: ['This file isn’t a Fit Fully backup.'] };
  }
  const newer = { ok: false, errors: ['This backup was made by a newer version of Fit Fully. Update the app, then try again.'] };
  if (!Number.isInteger(input.format) || input.format < 1) return damaged('format');
  if (input.format > BACKUP_FORMAT) return newer;
  if (!Number.isInteger(input.schemaVersion) || input.schemaVersion < 1) return damaged('version');
  if (input.schemaVersion > latestSchemaVersion) return newer;
  if (!isPlainObject(input.tables)) return damaged('tables');

  const tables = {};
  for (const def of BACKUP_TABLES) {
    const rows = input.tables[def.name] ?? [];
    if (!Array.isArray(rows)) return damaged(def.name);

    const clean = [];
    for (const row of rows) {
      if (!isPlainObject(row)) return damaged(def.name);
      const out = {};
      for (const column of def.columns) {
        if (!Object.hasOwn(row, column)) continue; // older backups lack newer columns; the database default applies
        if (!isCellValue(row[column])) return damaged(def.name);
        out[column] = row[column];
      }
      clean.push(out);
    }
    tables[def.name] = clean;
  }

  // Settings are text, and a setting without a value is dropped.
  tables.settings = tables.settings
    .filter((row) => typeof row.key === 'string' && row.key !== '' && row.value !== null && row.value !== undefined)
    .map((row) => ({ key: row.key, value: String(row.value) }));

  if (!tables.programs.some((p) => Number(p.is_active) === 1) || tables.program_days.length === 0) {
    return { ok: false, errors: ['This backup has no workout program in it, so it can’t be restored.'] };
  }

  return {
    ok: true,
    tables,
    exportedAt: typeof input.exportedAt === 'string' ? input.exportedAt : null,
    summary: summarizeTables(tables),
  };
}

// ---- CSV ------------------------------------------------------------------------

export const CSV_HEADER = [
  'Date',
  'Workout',
  'Exercise',
  'Set type',
  'Set',
  'Weight',
  'Unit',
  'Reps',
  'Target weight',
  'Target reps min',
  'Target reps max',
];

/**
 * One CSV cell. Quotes cells that need it, and stops spreadsheet apps from
 * treating a typed exercise name like "=SUM(A1)" as a formula.
 */
export function csvCell(value) {
  if (value === null || value === undefined) return '';
  let text = String(value);
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function weightCell(value) {
  return value === null || value === undefined ? '' : formatWeight(value);
}

/**
 * Builds the workout-history CSV from logged sets (see listLoggedSetRows).
 * One line per completed set, warm-ups included and labelled. No byte-order mark: the caller adds it.
 */
export function buildWorkoutCsv(rows) {
  const lines = [CSV_HEADER.map(csvCell).join(',')];
  for (const r of rows) {
    lines.push(
      [
        csvCell(r.date),
        csvCell(r.dayName),
        csvCell(r.exerciseName),
        csvCell(r.kind === 'warmup' ? 'Warm-up' : 'Working'),
        csvCell(r.setNumber),
        csvCell(weightCell(r.weight)),
        csvCell(r.unit),
        csvCell(r.reps),
        csvCell(weightCell(r.targetWeight)),
        csvCell(r.targetRepMin),
        csvCell(r.targetRepMax),
      ].join(','),
    );
  }
  return lines.join('\r\n') + '\r\n';
}
