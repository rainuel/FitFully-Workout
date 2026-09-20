// Profile logic: height, bodyweight, BMI, and unit preferences.
// Screens call these functions; they never write SQL.
//
// Nothing here touches the program or workout history. Changing the weight
// unit only affects what is shown and what NEW exercises default to.

import * as M from '../models/profile.js';
import { getSetting, setSetting } from '../models/settings.js';
import { UNITS } from './program-rules.js';
import { getProgramDefaults } from './program-service.js';
import {
  DEFAULT_INCREMENT,
  HEIGHT_UNITS,
  bodyweightChartPoints,
  calculateBmi,
  describeBmi,
  summarizeBodyweight,
  toDisplayRecords,
  toKg,
  validateBodyweightEntry,
  validateHeightCm,
} from './profile-rules.js';
import { formatDayMonth, toLocalDateString } from '../utils/dates.js';

export const RECENT_ENTRIES = 10;

async function loadHeightUnit(db) {
  const value = await getSetting(db, 'height_unit', 'cm');
  return HEIGHT_UNITS.includes(value) ? value : 'cm';
}

/** Bodyweight records in the user's unit (oldest first), plus latest and change. */
export async function loadBodyweightOverview(db) {
  const { unit } = await getProgramDefaults(db);
  const records = toDisplayRecords(await M.listBodyweight(db), unit);
  return {
    unit,
    records,
    summary: summarizeBodyweight(records),
    points: bodyweightChartPoints(records, formatDayMonth),
  };
}

/** Everything the Profile screen shows. */
export async function loadProfile(db) {
  const overview = await loadBodyweightOverview(db);
  const heightCm = await M.getHeightCm(db);
  const { increment } = await getProgramDefaults(db);

  let bmi = null;
  if (heightCm && overview.summary) {
    const { latest } = overview.summary;
    const value = calculateBmi(toKg(latest.weight, latest.unit), heightCm);
    if (value !== null) bmi = { ...describeBmi(value), weightDate: latest.date };
  }

  return {
    ...overview,
    heightCm,
    heightUnit: await loadHeightUnit(db),
    increment,
    bmi,
  };
}

export async function saveHeight(db, heightCm) {
  const checked = validateHeightCm(heightCm);
  if (!checked.ok) return checked;
  await M.setHeightCm(db, checked.value);
  return { ok: true, value: checked.value };
}

export async function saveHeightUnit(db, unit) {
  if (!HEIGHT_UNITS.includes(unit)) return { ok: false, errors: ['Choose cm or ft/in.'] };
  await setSetting(db, 'height_unit', unit);
  return { ok: true };
}

/**
 * Logs bodyweight in the user's current unit. One record per date: logging
 * the same date again replaces it. Returns { ok, replaced } or { ok: false, errors }.
 */
export async function logBodyweight(db, { weight, date }, now = new Date()) {
  const { unit } = await getProgramDefaults(db);
  const checked = validateBodyweightEntry({ weight, unit, date: date ?? toLocalDateString(now) }, toLocalDateString(now));
  if (!checked.ok) return checked;
  const { replaced } = await M.saveBodyweight(db, checked.value);
  return { ok: true, replaced, ...checked.value };
}

export async function removeBodyweight(db, id) {
  await M.deleteBodyweight(db, id);
  return { ok: true };
}

/**
 * Switches the preferred weight unit. New program exercises start in this
 * unit, and the increment goes back to a sensible default for it (5 lbs
 * must not become 5 kg). Exercises already in the program, and every logged
 * workout, keep the unit they have.
 */
export async function saveWeightUnit(db, unit) {
  if (!UNITS.includes(unit)) return { ok: false, errors: ['Choose kg or lbs.'] };
  const current = await getProgramDefaults(db);
  if (current.unit === unit) return { ok: true, changed: false, unit, increment: current.increment };
  await setSetting(db, 'weight_unit', unit);
  await setSetting(db, 'weight_increment', DEFAULT_INCREMENT[unit]);
  return { ok: true, changed: true, unit, increment: DEFAULT_INCREMENT[unit] };
}
