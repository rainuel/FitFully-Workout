// Profile rules: height, bodyweight, BMI, and unit conversion.
// Pure functions only (no DOM, no database).
//
// BMI is a general screening number for adults. It is not a diagnosis and it
// ignores muscle mass and body composition. The wording below says so.

import { UNITS } from './program-rules.js';
import { parseLocalDate } from '../utils/dates.js';

export const HEIGHT_UNITS = ['cm', 'ft'];

export const HEIGHT_LIMITS = { minCm: 100, maxCm: 250 };
export const BODYWEIGHT_LIMITS = { minKg: 20, maxKg: 400 };

const CM_PER_INCH = 2.54;
const LBS_PER_KG = 2.2046226218;

export const DEFAULT_INCREMENT = { kg: 2.5, lbs: 5 };

// ---- Units ---------------------------------------------------------------------

export function toKg(value, unit) {
  return unit === 'lbs' ? value / LBS_PER_KG : value;
}

export function fromKg(kg, unit) {
  return unit === 'lbs' ? kg * LBS_PER_KG : kg;
}

/** Converts a bodyweight between units, rounded to 0.1. */
export function convertBodyweight(value, from, to) {
  if (from === to) return Math.round(value * 10) / 10;
  return Math.round(fromKg(toKg(value, from), to) * 10) / 10;
}

export function bodyweightBounds(unit) {
  return {
    min: Math.round(fromKg(BODYWEIGHT_LIMITS.minKg, unit)),
    max: Math.round(fromKg(BODYWEIGHT_LIMITS.maxKg, unit)),
  };
}

// ---- Height ----------------------------------------------------------------------

/** 170 -> { feet: 5, inches: 7 }. Inches are whole and never 12. */
export function cmToFeetInches(cm) {
  const totalInches = Math.round(cm / CM_PER_INCH);
  return { feet: Math.floor(totalInches / 12), inches: totalInches % 12 };
}

/** 5, 7 -> 170.2 (rounded to 0.1 cm). */
export function feetInchesToCm(feet, inches) {
  return Math.round((feet * 12 + inches) * CM_PER_INCH * 10) / 10;
}

export function formatHeight(cm, unit) {
  if (!(cm > 0)) return '';
  if (unit === 'ft') {
    const { feet, inches } = cmToFeetInches(cm);
    return `${feet}′ ${inches}″`;
  }
  return `${Math.round(cm * 10) / 10} cm`;
}

export function validateHeightCm(cm) {
  const n = Number(cm);
  if (!Number.isFinite(n) || n < HEIGHT_LIMITS.minCm || n > HEIGHT_LIMITS.maxCm) {
    return { ok: false, errors: [`Height must be between ${HEIGHT_LIMITS.minCm} and ${HEIGHT_LIMITS.maxCm} cm.`] };
  }
  return { ok: true, value: Math.round(n * 10) / 10 };
}

// ---- Bodyweight entries ------------------------------------------------------------

/**
 * Checks a bodyweight entry: { weight, unit, date } against today's local date.
 * Returns { ok, value: { weight, unit, date } } or { ok: false, errors }.
 */
export function validateBodyweightEntry({ weight, unit, date }, today) {
  const errors = [];
  const n = Number(weight);
  if (!UNITS.includes(unit)) errors.push('Choose kg or lbs.');
  else if (!Number.isFinite(n) || n <= 0) errors.push('Enter your bodyweight.');
  else {
    const kg = toKg(n, unit);
    if (kg < BODYWEIGHT_LIMITS.minKg || kg > BODYWEIGHT_LIMITS.maxKg) {
      const { min, max } = bodyweightBounds(unit);
      errors.push(`Bodyweight must be between ${min} and ${max} ${unit}.`);
    }
  }
  if (!parseLocalDate(date)) errors.push('Choose a valid date.');
  else if (date > today) errors.push('The date can’t be in the future.');
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: { weight: Math.round(n * 10) / 10, unit, date } };
}

/**
 * Turns stored records (oldest first) into what screens and the chart use, all
 * in `unit`: [{ id, date, weight, unit }]. Each record keeps the number the
 * user typed when it is already in `unit`.
 */
export function toDisplayRecords(records, unit) {
  return records.map((r) => ({ id: r.id, date: r.date, weight: convertBodyweight(r.weight, r.unit, unit), unit }));
}

/** Days between two 'YYYY-MM-DD' dates (whole number, DST-safe). */
export function daysBetweenDates(from, to) {
  const a = parseLocalDate(from);
  const b = parseLocalDate(to);
  return Math.round((b - a) / 86400000);
}

/** Chart points for line-chart.js: x = days since the first record. Records must be oldest first. */
export function bodyweightChartPoints(records, formatLabel) {
  if (records.length === 0) return [];
  const first = records[0].date;
  return records.map((r) => ({ x: daysBetweenDates(first, r.date), y: r.weight, label: formatLabel(r.date) }));
}

/**
 * Latest weight and the change since the first record:
 * { latest, first, change } (all in the records' unit) or null when empty.
 * `change` is null with fewer than two records.
 */
export function summarizeBodyweight(records) {
  if (records.length === 0) return null;
  const first = records[0];
  const latest = records[records.length - 1];
  const change = records.length > 1 ? Math.round((latest.weight - first.weight) * 10) / 10 : null;
  return { latest, first, change };
}

export function formatChange(change, unit) {
  if (change === null) return '';
  if (change === 0) return `No change`;
  return `${change > 0 ? '+' : '−'}${Math.abs(change)} ${unit}`;
}

// ---- BMI -----------------------------------------------------------------------------

export const BMI_RANGE = { low: 18.5, high: 25 };

/** BMI to one decimal, or null when either input is missing. */
export function calculateBmi(weightKg, heightCm) {
  if (!(weightKg > 0) || !(heightCm > 0)) return null;
  const m = heightCm / 100;
  return Math.round((weightKg / (m * m)) * 10) / 10;
}

/** 'below' | 'within' | 'above', judged on the rounded number that is shown. */
export function bmiCategory(bmi) {
  if (bmi < BMI_RANGE.low) return 'below';
  if (bmi < BMI_RANGE.high) return 'within';
  return 'above';
}

export const BMI_DISCLAIMER =
  'BMI is a general screening number for adults, not a medical diagnosis. It doesn’t account for muscle mass, body composition, or your individual circumstances. If you have health concerns, talk to a doctor or dietitian.';

const GUIDANCE = {
  below: {
    label: 'Below the standard adult range',
    summary: 'Your BMI is under 18.5, the low end of the standard adult range.',
    suggestion:
      'If your goal is healthy weight gain, you may consider gradually increasing your calorie intake and eating nutrient-dense foods, while keeping up your strength training.',
  },
  within: {
    label: 'Within the standard adult range',
    summary: 'Your BMI is between 18.5 and 24.9, the standard adult range.',
    suggestion: 'Keep showing up to your routine. Your training and habits matter more than any single number.',
  },
  above: {
    label: 'Above the standard adult range',
    summary: 'Your BMI is 25 or higher, above the standard adult range.',
    suggestion:
      'If your goal is fat loss, you may consider a sustainable calorie deficit while prioritizing protein, vegetables, whole foods, and regular activity. Muscle adds weight too, so this number can read high for people who train.',
  },
};

/** { bmi, category, label, summary, suggestion, disclaimer } for a BMI value. */
export function describeBmi(bmi) {
  const category = bmiCategory(bmi);
  return { bmi, category, ...GUIDANCE[category], disclaimer: BMI_DISCLAIMER };
}
