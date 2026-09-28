import test from 'node:test';
import assert from 'node:assert/strict';
import { saveDayStyle, loadDayEditor } from '../www/js/services/program-service.js';
import { loadWeek } from '../www/js/services/schedule-service.js';
import { validateDayStyle } from '../www/js/services/program-rules.js';
import { createBackup, inspectBackup, restoreBackup } from '../www/js/services/backup-service.js';
import { dayIdFor, setupDb } from './helpers/scenario.js';

test('day style: only known icons and colours are accepted, null means default', () => {
  assert.equal(validateDayStyle({ icon: 'dumbbell', color: 'red' }).ok, true);
  assert.equal(validateDayStyle({}).ok, true);
  assert.equal(validateDayStyle({ icon: 'skull', color: null }).ok, false);
  assert.equal(validateDayStyle({ icon: null, color: '#ff0000' }).ok, false);
});

test('saved icon and colour show up on the editor and in the week', async () => {
  const db = await setupDb();
  const monday = await dayIdFor(db, 1);
  assert.equal((await saveDayStyle(db, monday, { icon: 'dumbbell', color: 'purple' })).ok, true);
  const { day } = await loadDayEditor(db, 1);
  assert.equal(day.icon, 'dumbbell');
  assert.equal(day.color, 'purple');
  const { week } = await loadWeek(db, new Date(2026, 8, 28, 9));
  assert.equal(week[0].icon, 'dumbbell');
  assert.equal(week[0].color, 'purple');
  assert.equal(week[1].icon, null);

  assert.equal((await saveDayStyle(db, monday, { icon: 'nope', color: null })).ok, false);
  assert.equal((await loadDayEditor(db, 1)).day.icon, 'dumbbell');
});

test('rest days never show a custom icon', async () => {
  const db = await setupDb();
  const rest = await db.get('SELECT id, weekday FROM program_days WHERE is_rest = 1 LIMIT 1');
  await saveDayStyle(db, rest.id, { icon: 'star', color: 'pink' });
  const { week } = await loadWeek(db, new Date(2026, 8, 28, 9));
  const entry = week.find((d) => d.weekday === rest.weekday);
  assert.equal(entry.icon, null);
  assert.equal(entry.color, null);
});

test('icon and colour survive a backup and restore', async () => {
  const db = await setupDb();
  const monday = await dayIdFor(db, 1);
  await saveDayStyle(db, monday, { icon: 'kettlebell', color: 'teal' });
  const made = await createBackup(db);
  const inspected = inspectBackup(made.text);
  assert.equal(inspected.ok, true);
  await saveDayStyle(db, monday, { icon: null, color: null });
  assert.equal((await restoreBackup(db, inspected.backup)).ok, true);
  const { day } = await loadDayEditor(db, 1);
  assert.equal(day.icon, 'kettlebell');
  assert.equal(day.color, 'teal');
});