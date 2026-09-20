import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isoToCapacitorWeekday,
  isoWeekday,
  startOfWeek,
  toLocalDateString,
  weekDates,
} from '../www/js/utils/dates.js';

test('isoWeekday: Monday is 1 and Sunday is 7', () => {
  assert.equal(isoWeekday(new Date(2026, 8, 21)), 1); // Mon 21 Sep 2026
  assert.equal(isoWeekday(new Date(2026, 8, 19)), 6); // Sat
  assert.equal(isoWeekday(new Date(2026, 8, 20)), 7); // Sun
});

test('toLocalDateString uses the local date, even just after midnight', () => {
  assert.equal(toLocalDateString(new Date(2026, 8, 21, 0, 30)), '2026-09-21');
  assert.equal(toLocalDateString(new Date(2026, 8, 21, 23, 59)), '2026-09-21');
  assert.equal(toLocalDateString(new Date(2026, 0, 5)), '2026-01-05');
});

test('startOfWeek returns the Monday, including when the input is a Sunday', () => {
  assert.equal(toLocalDateString(startOfWeek(new Date(2026, 8, 20))), '2026-09-14'); // Sunday input
  assert.equal(toLocalDateString(startOfWeek(new Date(2026, 8, 21))), '2026-09-21'); // Monday input
});

test('weekDates returns seven consecutive days, Monday first', () => {
  const dates = weekDates(new Date(2026, 8, 24)).map(toLocalDateString);
  assert.deepEqual(dates, [
    '2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25', '2026-09-26', '2026-09-27',
  ]);
});

test('weekDates crosses month and year boundaries', () => {
  const dates = weekDates(new Date(2026, 11, 31)).map(toLocalDateString); // Thu 31 Dec 2026
  assert.equal(dates[0], '2026-12-28');
  assert.equal(dates[6], '2027-01-03');
});

test('isoToCapacitorWeekday maps Mon..Sun to Capacitor numbering (Sun = 1)', () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7].map(isoToCapacitorWeekday), [2, 3, 4, 5, 6, 7, 1]);
});

test('formatShortDate reads a local date without shifting the day', async () => {
  const { formatShortDate } = await import('../www/js/utils/dates.js');
  const text = formatShortDate('2026-09-21');
  assert.match(text, /21/);
  assert.equal(formatShortDate('nonsense'), 'nonsense');
});
