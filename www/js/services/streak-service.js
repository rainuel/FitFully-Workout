// Streaks and weekly consistency. Screens call these functions; they never write SQL.
//
// The app cannot run while it is closed, so past days are written to the
// schedule log the next time they are needed ("reconcile"). Once a day has a
// row it is never rewritten, so editing the program later cannot change what
// counted as scheduled, missed, or a rest day back then.

import { getActiveProgram, getProgramDays } from '../models/program.js';
import * as C from '../models/consistency.js';
import { countCompletedSessions } from '../models/history.js';
import { getSetting } from '../models/settings.js';
import { addDays, datesBetween, isoWeekday, parseLocalDate, toLocalDateString } from '../utils/dates.js';
import { loadWeek } from './schedule-service.js';
import { buildWeekProgress, computeStreaks, describeStreak, outcomeForDate } from './streak-rules.js';

// Never fill more than two years back (a wrong device clock must not create thousands of rows).
const MAX_BACKFILL_DAYS = 730;

/**
 * The first day that can be counted. The day Fit Fully was first opened does
 * not count as missed (you may have installed it in the evening), unless a
 * workout was logged that day.
 */
async function trackingStart(db, todayKey) {
  const candidates = [];
  const first = await getSetting(db, 'first_launch_at');
  const firstDate = first ? new Date(first) : null;
  if (firstDate && !Number.isNaN(firstDate.getTime())) candidates.push(addDays(toLocalDateString(firstDate), 1));
  const earliest = await C.getEarliestSessionDate(db);
  if (earliest) candidates.push(earliest);

  const start = candidates.length > 0 ? candidates.sort()[0] : todayKey;
  const limit = addDays(todayKey, -MAX_BACKFILL_DAYS);
  return start < limit ? limit : start;
}

/**
 * Writes a schedule-log row for every finished day that does not have one yet:
 * completed (a workout was finished), missed (a scheduled workout was not
 * done), or rest (nothing scheduled). Safe to call any time, including inside
 * a transaction. Returns { filled }.
 */
export async function reconcileSchedule(db, now = new Date()) {
  const todayKey = toLocalDateString(now);
  const last = addDays(todayKey, -1);
  const first = await trackingStart(db, todayKey);
  if (first > last) return { filled: 0 };

  const logged = new Set((await C.getScheduleLogBetween(db, first, last)).map((r) => r.date));
  const missing = datesBetween(first, last).filter((date) => !logged.has(date));
  if (missing.length === 0) return { filled: 0 };

  const program = await getActiveProgram(db);
  if (!program) return { filled: 0 };
  const days = await getProgramDays(db, program.id);
  const workoutDates = new Set(await C.getCompletedSessionDates(db, first, last));
  const activeDate = await C.getActiveSessionDate(db);

  let filled = 0;
  for (const date of missing) {
    // An unfinished workout from that day can still be finished, so the day stays open.
    if (date === activeDate) continue;
    const weekday = isoWeekday(parseLocalDate(date));
    const day = days.find((d) => d.weekday === weekday) ?? null;
    await C.insertScheduleLogIfMissing(db, {
      date,
      weekday,
      dayName: day ? day.name : 'Rest',
      outcome: outcomeForDate({ day, completed: workoutDates.has(date) }),
    });
    filled += 1;
  }
  return { filled };
}

/** Current and best streak: { current, best }. */
export async function loadStreaks(db, now = new Date()) {
  await reconcileSchedule(db, now);
  return computeStreaks(await C.getScheduleLog(db), toLocalDateString(now));
}

/**
 * Everything the Home screen shows about consistency: the week with a status
 * per day, "completed / scheduled", the streak, and its message.
 */
export async function loadHomeConsistency(db, now = new Date()) {
  await reconcileSchedule(db, now);
  const { week } = await loadWeek(db, now);
  const monday = week[0].date;
  const sunday = week[6].date;

  const logByDate = new Map((await C.getScheduleLogBetween(db, monday, sunday)).map((r) => [r.date, r.outcome]));
  const workoutDates = new Set(await C.getCompletedSessionDates(db, monday, sunday));
  const progress = buildWeekProgress(week, logByDate, workoutDates);
  const today = progress.days.find((d) => d.relation === 'today');

  const streak = computeStreaks(await C.getScheduleLog(db), toLocalDateString(now));
  const workouts = await countCompletedSessions(db);
  const message = describeStreak({ current: streak.current, workouts, todayStatus: today.status });

  return { days: progress.days, today, completed: progress.completed, scheduled: progress.scheduled, streak, message };
}
