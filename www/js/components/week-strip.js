import { h } from '../utils/dom.js';
import { icon } from './icons.js';
import { plate } from './plate.js';
import { describeWeekTotal } from '../services/streak-rules.js';

const STATUS_LABEL = {
  completed: 'workout done',
  missed: 'not done',
  today: 'today, not done yet',
  upcoming: 'upcoming',
  rest: 'rest day',
  none: 'not tracked',
};

/** A small mark under each day: done, not done, still to come, rest. */
function statusMark(status) {
  return h('span', { class: `week__mark week__mark--${status}`, 'aria-hidden': 'true' }, status === 'completed' ? icon('check', { strokeWidth: 3 }) : null);
}

/**
 * The current week (Mon..Sun) as a row of plates. Input comes from
 * schedule-service.buildWeekView, optionally with a `status` on each day
 * (streak-service.loadHomeConsistency). With `totals` it adds "4 / 5 scheduled workouts".
 */
export function weekStrip(week, totals = null) {
  return h(
    'section',
    { class: 'panel week', 'aria-labelledby': 'week-heading' },
    h('h2', { class: 'section-title', id: 'week-heading' }, 'This week'),
    h(
      'ol',
      { class: 'week__days' },
      ...week.map((day) =>
        h(
          'li',
          {
            class: `week__day${day.relation === 'today' ? ' is-today' : ''}`,
            'aria-label': `${day.weekdayName}: ${day.isRest ? 'rest day' : day.name}${day.status ? `, ${STATUS_LABEL[day.status]}` : ''}${day.relation === 'today' ? ', today' : ''}`,
            'aria-current': day.relation === 'today' ? 'date' : null,
          },
          plate({ plateIndex: day.plateIndex, isRest: day.isRest, isToday: day.relation === 'today' }),
          h('span', { class: 'week__short' }, day.short),
          h('span', { class: 'week__name' }, day.isRest ? 'Rest' : day.name),
          day.status ? statusMark(day.status) : null,
        ),
      ),
    ),
    totals ? h('p', { class: 'week__summary' }, describeWeekTotal(totals)) : null,
  );
}
