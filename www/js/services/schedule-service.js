// Weekly schedule calculations.
//
// The plan is strictly by weekday: Tuesday is always Tuesday's day, whether or
// not Monday's workout was done. A missed workout is never pushed forward.

import { getActiveProgram, getProgramDays } from '../models/program.js';
import { isoWeekday, toLocalDateString, weekDates, weekdayName, weekdayShort } from '../utils/dates.js';

/** The program day scheduled for `date`, based only on its weekday. */
export function findDayForDate(days, date) {
  const weekday = isoWeekday(date);
  return days.find((d) => d.weekday === weekday) ?? null;
}

/**
 * Seven entries (Mon..Sun) for the week containing `now`.
 * `plateIndex` numbers the training days 0, 1, 2 ... in week order (null for
 * rest days); the UI uses it to pick each day's plate colour.
 */
export function buildWeekView(days, now = new Date()) {
  const todayKey = toLocalDateString(now);
  let plateCounter = 0;

  return weekDates(now).map((date) => {
    const weekday = isoWeekday(date);
    const day = days.find((d) => d.weekday === weekday);
    const isRest = day ? day.isRest : true;
    const dateKey = toLocalDateString(date);

    let relation = 'future';
    if (dateKey === todayKey) relation = 'today';
    else if (dateKey < todayKey) relation = 'past';

    return {
      date: dateKey,
      weekday,
      weekdayName: weekdayName(weekday),
      short: weekdayShort(weekday),
      dayId: day ? day.id : null,
      name: day ? day.name : 'Rest',
      isRest,
      exerciseCount: day ? day.exerciseCount : 0,
      plateIndex: isRest ? null : plateCounter++,
      relation,
    };
  });
}

/** Loads the active program and derives the current week + today's entry. */
export async function loadWeek(db, now = new Date()) {
  const program = await getActiveProgram(db);
  if (!program) throw new Error('No active program found in the database.');
  const days = await getProgramDays(db, program.id);
  const week = buildWeekView(days, now);
  const today = week.find((d) => d.relation === 'today');
  return { program, days, week, today };
}
