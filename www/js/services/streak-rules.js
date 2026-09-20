// Streak and weekly-consistency rules. Pure functions: no DOM, no database.
//
// A streak counts COMPLETED scheduled workouts in a row. Rest days do not
// break it and do not add to it. Only a scheduled workout that was not done
// ("missed") resets it. Today never counts against you: it has no row until
// the day is over.

import { addDays, parseLocalDate, startOfWeek, toLocalDateString } from '../utils/dates.js';

/** Week-day statuses that count as a scheduled workout. */
const SCHEDULED_STATUSES = new Set(['completed', 'missed', 'today', 'upcoming']);

/** A day is a scheduled workout only if it is a training day with something to do. */
export function isScheduledDay(day) {
  return Boolean(day) && !day.isRest && day.exerciseCount > 0;
}

/** What to record for a finished calendar day. */
export function outcomeForDate({ day, completed }) {
  if (completed) return 'completed';
  return isScheduledDay(day) ? 'missed' : 'rest';
}

/**
 * Current and best streak from the schedule log ([{ date, outcome }]).
 * Only days up to `todayKey` are considered.
 */
export function computeStreaks(entries, todayKey) {
  const rows = entries.filter((e) => e.date <= todayKey).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  let run = 0;
  let best = 0;
  for (const entry of rows) {
    if (entry.outcome === 'completed') {
      run += 1;
      best = Math.max(best, run);
    } else if (entry.outcome === 'missed') {
      run = 0;
    }
  }
  return { current: run, best };
}

/**
 * The longest run of consecutive Monday-to-Sunday weeks in which every
 * scheduled workout was completed. A week only counts once it is over, and
 * needs at least one completed workout and no missed one.
 */
export function bestPerfectWeekRun(entries, todayKey) {
  const weeks = new Map();
  for (const entry of entries) {
    const date = parseLocalDate(entry.date);
    if (!date) continue;
    const monday = toLocalDateString(startOfWeek(date));
    const week = weeks.get(monday) ?? { completed: 0, missed: 0 };
    if (entry.outcome === 'completed') week.completed += 1;
    else if (entry.outcome === 'missed') week.missed += 1;
    weeks.set(monday, week);
  }

  const perfect = [...weeks.entries()]
    .filter(([monday, week]) => week.completed > 0 && week.missed === 0 && addDays(monday, 6) < todayKey)
    .map(([monday]) => monday)
    .sort();

  let best = 0;
  let run = 0;
  let previous = null;
  for (const monday of perfect) {
    run = previous !== null && addDays(previous, 7) === monday ? run + 1 : 1;
    best = Math.max(best, run);
    previous = monday;
  }
  return best;
}

/**
 * The status of one day of the week:
 *   completed  a workout was finished
 *   missed     a scheduled workout was not done (past days only)
 *   today      a scheduled workout, still open
 *   upcoming   a scheduled workout later this week
 *   rest       nothing scheduled
 *   none       before Fit Fully was tracking this day
 */
function dayStatus(day, outcome, hasWorkout) {
  if (hasWorkout || outcome === 'completed') return 'completed';
  if (day.relation === 'past') {
    if (outcome === 'missed') return 'missed';
    if (outcome === 'rest') return 'rest';
    return 'none';
  }
  const scheduled = isScheduledDay(day);
  if (day.relation === 'today') return scheduled ? 'today' : 'rest';
  return scheduled ? 'upcoming' : 'rest';
}

/**
 * Adds a status to each day of a week (from schedule-service.buildWeekView) and
 * counts "completed / scheduled" for the week.
 * `logByDate`: Map of date -> outcome. `workoutDates`: Set of dates with a finished workout.
 */
export function buildWeekProgress(week, logByDate, workoutDates) {
  const days = week.map((day) => ({ ...day, status: dayStatus(day, logByDate.get(day.date), workoutDates.has(day.date)) }));
  return {
    days,
    scheduled: days.filter((d) => SCHEDULED_STATUSES.has(d.status)).length,
    completed: days.filter((d) => d.status === 'completed').length,
  };
}

/** The streak card text. Encouraging, never guilt-inducing. */
export function describeStreak({ current, workouts, todayStatus }) {
  if (current > 0) {
    let sub = 'Keep going.';
    if (todayStatus === 'completed') sub = 'You showed up today.';
    else if (todayStatus === 'today') sub = 'Keep going. Today’s workout is waiting.';
    return { headline: `${current} workout streak`, sub, active: true };
  }
  if (workouts === 0) {
    return { headline: 'No streak yet', sub: 'Your first workout starts it.', active: false };
  }
  return {
    headline: 'Fresh start',
    sub:
      todayStatus === 'today'
        ? 'Life happens. Today is another opportunity to show up.'
        : 'Life happens. Your next workout is another opportunity to show up.',
    active: false,
  };
}

/** "4 / 5 scheduled workouts" for the week. */
export function describeWeekTotal({ completed, scheduled }) {
  if (scheduled === 0) return 'No workouts scheduled this week.';
  return `${completed} / ${scheduled} scheduled ${scheduled === 1 ? 'workout' : 'workouts'}`;
}
