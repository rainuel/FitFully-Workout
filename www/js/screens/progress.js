import { h, pluralize } from '../utils/dom.js';
import { emptyState } from '../components/empty-state.js';
import { loadProgressOverview } from '../services/history-service.js';
import { loadAchievements } from '../services/achievement-service.js';
import { formatDateTime } from '../utils/dates.js';
import { formatWeightWithUnit } from '../utils/format.js';
import { icon } from '../components/icons.js';
import { loadBodyweightOverview } from '../services/profile-service.js';
import { bodyweightChart, bodyweightStats } from '../components/bodyweight-chart.js';
import { sessionList } from '../components/session-list.js';
import { showUnlocked } from '../components/achievement-toast.js';

function stat(value, label) {
  return h('div', { class: 'stat' }, h('span', { class: 'stat__value' }, String(value)), h('span', { class: 'stat__label' }, label));
}

function sectionHead(title, link = null) {
  return h(
    'div',
    { class: 'section-head' },
    h('h2', { class: 'section-title' }, title),
    link ? h('a', { class: 'text-link', href: link.href }, link.label) : null,
  );
}

function exerciseList(exercises) {
  return h(
    'ul',
    { class: 'hist-list' },
    ...exercises.map((ex) => {
      const record = ex.topWeight > 0 ? `Heaviest ${formatWeightWithUnit(ex.topWeight, ex.unit)}` : 'Bodyweight';
      return h(
        'li',
        null,
        h(
          'a',
          { class: 'hist-row', href: `#/progress/exercise/${ex.id}` },
          h('span', { class: 'hist-row__body' }, h('span', { class: 'hist-row__title' }, ex.name), h('span', { class: 'hist-row__meta' }, `${record} · ${pluralize(ex.sessions, 'workout')}`)),
          icon('chevron'),
        ),
      );
    }),
  );
}

function achievementList(items) {
  return h(
    'ul',
    { class: 'ach-list' },
    ...items.map((a) =>
      h(
        'li',
        { class: `ach-row${a.unlocked ? '' : ' is-locked'}` },
        h('span', { class: 'ach-row__icon', 'aria-hidden': 'true' }, icon('trophy')),
        h(
          'span',
          { class: 'ach-row__body' },
          h('span', { class: 'ach-row__title' }, a.title),
          h('span', { class: 'ach-row__meta' }, a.unlocked ? `Unlocked ${formatDateTime(a.unlockedAt)}` : a.description),
        ),
        a.unlocked ? h('span', { class: 'sr-only' }, 'Unlocked') : h('span', { class: 'ach-row__count' }, `${a.progress.current} / ${a.progress.target}`),
      ),
    ),
  );
}

function bodyweightSection(bw) {
  const link = { href: '#/profile', label: 'Log weight' };
  if (!bw.summary) {
    return h(
      'section',
      { class: 'stack', 'aria-label': 'Bodyweight' },
      sectionHead('Bodyweight', link),
      h('p', { class: 'muted small' }, 'Log your bodyweight on the Profile tab and your trend appears here.'),
    );
  }
  return h(
    'section',
    { class: 'stack', 'aria-label': 'Bodyweight' },
    sectionHead('Bodyweight', link),
    bodyweightStats({ summary: bw.summary, unit: bw.unit, count: bw.records.length }),
    bodyweightChart({ points: bw.points, unit: bw.unit }),
  );
}

export async function renderProgress(root, { db }) {
  const overview = await loadProgressOverview(db);
  const bodyweight = await loadBodyweightOverview(db);
  const { items, newlyUnlocked } = await loadAchievements(db);
  showUnlocked(newlyUnlocked);

  root.append(
    h('h1', { class: 'screen-title' }, 'Progress'),
    h('section', { class: 'stats', 'aria-label': 'Totals' }, stat(overview.workouts, 'Workouts'), stat(overview.currentStreak, 'Streak'), stat(overview.bestStreak, 'Best streak')),
  );

  if (overview.workouts === 0) {
    root.append(
      emptyState({
        title: 'No workouts logged yet',
        body: 'Finish your first workout and your history, records, and streak start collecting here.',
        action: { href: '#/workout', label: 'Go to workout' },
      }),
    );
  } else {
    root.append(
      h(
        'section',
        { class: 'stack', 'aria-label': 'Recent workouts' },
        sectionHead('Recent workouts', overview.workouts > overview.recent.length ? { href: '#/progress/history', label: 'View all' } : null),
        sessionList(overview.recent),
      ),
      h(
        'section',
        { class: 'stack', 'aria-label': 'Exercises and records' },
        sectionHead('Exercises & records'),
        h('p', { class: 'muted small' }, 'Tap an exercise for its progression and personal records.'),
        exerciseList(overview.exercises),
      ),
    );
  }

  root.append(
    bodyweightSection(bodyweight),
    h('section', { class: 'stack', 'aria-label': 'Achievements' }, sectionHead('Achievements'), achievementList(items)),
  );
}
