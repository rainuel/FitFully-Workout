import { h, pluralize } from '../utils/dom.js';
import { formatLongDate } from '../utils/dates.js';
import { loadHomeConsistency } from '../services/streak-service.js';
import { getActiveSession } from '../services/workout-service.js';
import { weekStrip } from '../components/week-strip.js';
import { restDayPanel } from '../components/rest-day.js';
import { streakCard } from '../components/streak-card.js';
import { announceAchievements } from '../components/achievement-toast.js';

export async function renderHome(root, { db }) {
  const now = new Date();
  const { days, today, message, completed, scheduled } = await loadHomeConsistency(db, now);
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
    streakCard(message),
    weekStrip(days, { completed, scheduled }),
  );

  // Catches anything reached since the last look (for example a finished 4-week run).
  await announceAchievements(db);
}
