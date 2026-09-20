import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWeekView, findDayForDate } from '../www/js/services/schedule-service.js';

const DAYS = [
  { id: 1, weekday: 1, name: 'Push', isRest: false, exerciseCount: 4 },
  { id: 2, weekday: 2, name: 'Pull', isRest: false, exerciseCount: 0 },
  { id: 3, weekday: 3, name: 'Legs', isRest: false, exerciseCount: 0 },
  { id: 4, weekday: 4, name: 'Rest', isRest: true, exerciseCount: 0 },
  { id: 5, weekday: 5, name: 'Upper', isRest: false, exerciseCount: 0 },
  { id: 6, weekday: 6, name: 'Lower', isRest: false, exerciseCount: 0 },
  { id: 7, weekday: 7, name: 'Rest', isRest: true, exerciseCount: 0 },
];

test('today is chosen by weekday only: Tuesday is Pull whether or not Monday was done', () => {
  assert.equal(findDayForDate(DAYS, new Date(2026, 8, 21)).name, 'Push'); // Mon
  assert.equal(findDayForDate(DAYS, new Date(2026, 8, 22)).name, 'Pull'); // Tue
  assert.equal(findDayForDate(DAYS, new Date(2026, 8, 24)).isRest, true); // Thu
  assert.equal(findDayForDate(DAYS, new Date(2026, 8, 27)).isRest, true); // Sun
});

test('buildWeekView marks past, today, and future for a Wednesday', () => {
  const week = buildWeekView(DAYS, new Date(2026, 8, 23, 15, 0)); // Wed 23 Sep 2026
  assert.deepEqual(
    week.map((d) => d.relation),
    ['past', 'past', 'today', 'future', 'future', 'future', 'future'],
  );
  assert.equal(week[0].date, '2026-09-21');
  assert.equal(week[6].date, '2026-09-27');
  assert.equal(week.find((d) => d.relation === 'today').name, 'Legs');
});

test('plate indexes count training days only; rest days get none', () => {
  const week = buildWeekView(DAYS, new Date(2026, 8, 21));
  assert.deepEqual(week.map((d) => d.plateIndex), [0, 1, 2, null, 3, 4, null]);
});

test('a Sunday belongs to the week that started the Monday before', () => {
  const week = buildWeekView(DAYS, new Date(2026, 8, 20)); // Sun 20 Sep 2026
  assert.equal(week[0].date, '2026-09-14');
  assert.equal(week[6].relation, 'today');
  assert.equal(week[6].isRest, true);
});
