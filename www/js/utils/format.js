// Display formatting shared by screens. Pure functions, no DOM.

function pad2(n) {
  return String(n).padStart(2, '0');
}

/** 30 -> "30", 27.5 -> "27.5", 27.500001 -> "27.5". */
export function formatWeight(value) {
  const n = Number(value);
  if (value === null || value === undefined || !Number.isFinite(n)) return '';
  return String(Math.round(n * 100) / 100);
}

/** 30, 'lbs' -> "30 lbs". A weight of 0 is a bodyweight exercise. */
export function formatWeightWithUnit(value, unit) {
  if (!Number(value)) return 'Bodyweight';
  return `${formatWeight(value)} ${unit}`;
}

/** 90 -> "1:30", 45 -> "0:45". */
export function formatRest(seconds) {
  const s = Math.max(0, Math.round(Number(seconds) || 0));
  return `${Math.floor(s / 60)}:${pad2(s % 60)}`;
}

/** (8, 12) -> "8–12", (10, 10) -> "10". */
export function formatRepTarget(min, max) {
  return min === max ? String(min) : `${min}–${max}`;
}
