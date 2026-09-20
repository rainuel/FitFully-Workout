import { h, pluralize } from '../utils/dom.js';
import { formatLongDate } from '../utils/dates.js';
import { loadWeek } from '../services/schedule-service.js';
import { getActiveSession } from '../services/workout-service.js';
import { weekStrip } from '../components/week-strip.js';
import { restDayPanel } from '../components/rest-day.js';

export async function renderHome(root, { db }) {
  const now = new Date();
  const { week, today } = await loadWeek(db, now);
  const active = await getActiveSession(db);

  let subline;
  if (active) subline = 'Your workout is in progress.';
  else if (today.isRest) subline = 'No workout scheduled today.';
  else if (today.exerciseCount === 0) subline = 'No exercises in this day yet.';
  else subline = pluralize(today.exerciseCount, 'exercise');

  root.append(
    h(
      'header',
      { class: 'hero' },
      h('p', { class: 'hero__date' }, formatLongDate(now)),
      h('h1', { class: 'hero__title' }, today.isRest ? 'Rest day' : today.name),
      h('p', { class: 'hero__sub' }, subline),
    ),
    today.isRest && !active
      ? restDayPanel()
      : h('a', { class: 'btn btn--primary btn--block', href: '#/workout' }, active ? 'Continue workout' : 'Open today’s workout'),
    weekStrip(week),
  );
}
