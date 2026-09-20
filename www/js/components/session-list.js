import { h, pluralize } from '../utils/dom.js';
import { formatShortDate } from '../utils/dates.js';
import { formatDurationWords } from '../services/workout-rules.js';
import { icon } from './icons.js';

/** "Mon, 21 Sep · 4 / 6 exercises · 12 sets · 52 min" for one finished workout. */
export function sessionMeta(session) {
  return [
    formatShortDate(session.date),
    `${session.exercisesCompleted} / ${session.exercisesPlanned} exercises`,
    pluralize(session.workingSets, 'set'),
    formatDurationWords(session.durationMs),
  ].join(' · ');
}

/** A list of finished workouts (from history-service), each opening its detail screen. */
export function sessionList(sessions) {
  return h(
    'ul',
    { class: 'hist-list' },
    ...sessions.map((session) =>
      h(
        'li',
        null,
        h(
          'a',
          { class: 'hist-row', href: `#/progress/workout/${session.id}` },
          h('span', { class: 'hist-row__body' }, h('span', { class: 'hist-row__title' }, session.dayName), h('span', { class: 'hist-row__meta' }, sessionMeta(session))),
          icon('chevron'),
        ),
      ),
    ),
  );
}
