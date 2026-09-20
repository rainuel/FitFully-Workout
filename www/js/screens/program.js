import { h, pluralize } from '../utils/dom.js';
import { loadWeek } from '../services/schedule-service.js';
import { loadLibrary } from '../services/exercise-service.js';
import { plate } from '../components/plate.js';
import { icon } from '../components/icons.js';

/** Program tab: the week at a glance. Tap a day to edit it. */
export async function renderProgram(root, { db }) {
  const { program, week } = await loadWeek(db);
  const library = await loadLibrary(db);

  const trainingDays = week.filter((d) => !d.isRest);
  const totalExercises = trainingDays.reduce((sum, d) => sum + d.exerciseCount, 0);

  root.append(
    h('h1', { class: 'screen-title' }, 'Program'),
    h('p', { class: 'muted' }, `${program.name} · ${pluralize(trainingDays.length, 'training day')} · ${pluralize(totalExercises, 'exercise')}`),
    h(
      'ul',
      { class: 'day-list' },
      ...week.map((day) =>
        h(
          'li',
          null,
          h(
            'a',
            {
              class: `day-list__row${day.isRest ? ' is-rest' : ''}${day.relation === 'today' ? ' is-today' : ''}`,
              href: `#/program/day/${day.weekday}`,
            },
            plate({ plateIndex: day.plateIndex, isRest: day.isRest, large: true }),
            h(
              'div',
              { class: 'day-list__text' },
              h('span', { class: 'day-list__weekday' }, day.weekdayName, day.relation === 'today' ? h('span', { class: 'tag tag--today' }, 'Today') : null),
              h('span', { class: 'day-list__name' }, day.isRest ? 'Rest' : day.name),
            ),
            h('span', { class: 'day-list__meta' }, day.isRest ? 'Rest day' : pluralize(day.exerciseCount, 'exercise')),
            icon('chevron'),
          ),
        ),
      ),
    ),
    h(
      'a',
      { class: 'link-card', href: '#/program/library' },
      icon('library'),
      h('span', { class: 'link-card__text' }, h('span', { class: 'link-card__title' }, 'Exercise library'), h('span', { class: 'muted small' }, `${pluralize(library.length, 'exercise')}, plus your own`)),
      icon('chevron'),
    ),
  );
}
