import { h, pluralize } from '../utils/dom.js';
import { emptyState } from '../components/empty-state.js';
import { formatDayMonth, formatShortDate } from '../utils/dates.js';
import { formatWeight, formatWeightWithUnit } from '../utils/format.js';
import { loadExerciseHistory } from '../services/history-service.js';
import { formatLoggedSet } from '../services/workout-rules.js';
import { lineChart } from '../components/line-chart.js';
import { screenHeader } from '../components/screen-header.js';

const RECENT_VISIBLE = 6;
const RECORD_ROWS = 6;

function recordCard(label, value, sub) {
  return h('div', { class: 'stat stat--record' }, h('span', { class: 'stat__label' }, label), h('span', { class: 'stat__value' }, value), h('span', { class: 'stat__sub' }, sub));
}

function recordsSection(analysis) {
  const { heaviest, bestEstimate, mostReps, isBodyweight, unit } = analysis;
  const cards = isBodyweight
    ? [recordCard('Most reps', String(mostReps.reps), formatDayMonth(mostReps.date))]
    : [
        recordCard('Heaviest', `${formatWeightWithUnit(heaviest.weight, unit)} × ${heaviest.reps}`, formatDayMonth(heaviest.date)),
        bestEstimate
          ? recordCard('Est. 1-rep max', formatWeightWithUnit(bestEstimate.value, unit), `from ${formatWeight(bestEstimate.weight)} × ${bestEstimate.reps}`)
          : null,
      ];
  return h('section', { class: 'stack', 'aria-label': 'Personal records' }, h('h2', { class: 'section-title' }, 'Personal records'), h('div', { class: 'records' }, ...cards));
}

function repsAtWeightSection(analysis) {
  const rows = analysis.repsAtWeight.slice(0, RECORD_ROWS);
  return h(
    'section',
    { class: 'panel', 'aria-label': 'Best reps at each weight' },
    h('h2', { class: 'section-title' }, 'Best reps at each weight'),
    h(
      'dl',
      { class: 'facts' },
      ...rows.map((r) =>
        h('div', { class: 'facts__row' }, h('dt', null, formatWeightWithUnit(r.weight, analysis.unit)), h('dd', null, `${pluralize(r.reps, 'rep')} · ${formatDayMonth(r.date)}`)),
      ),
    ),
  );
}

function chartSection(analysis) {
  const { chart, chartMetric, unit } = analysis;
  const title = chartMetric === 'reps' ? 'Best reps per workout' : 'Top weight per workout';
  const body =
    chart.length < 2
      ? h('p', { class: 'muted small' }, 'Log this exercise once more to see how it changes over time.')
      : lineChart({
          points: chart.map((p, i) => ({ x: i, y: p.value, label: formatDayMonth(p.date) })),
          integers: chartMetric === 'reps',
          ariaLabel: `${title}: from ${formatWeight(chart[0].value)} to ${formatWeight(chart[chart.length - 1].value)}${chartMetric === 'weight' ? ` ${unit}` : ' reps'} over ${pluralize(chart.length, 'workout')}`,
        });
  return h('section', { class: 'panel', 'aria-label': title }, h('h2', { class: 'section-title' }, title), body);
}

function recentSection(sessions, unit) {
  const list = h('ul', { class: 'stack' });
  const toggle = h('button', { class: 'btn btn--secondary btn--compact', type: 'button', hidden: sessions.length <= RECENT_VISIBLE });
  let expanded = false;

  function paint() {
    const shown = expanded ? sessions : sessions.slice(0, RECENT_VISIBLE);
    list.replaceChildren(
      ...shown.map((s) =>
        h(
          'li',
          { class: 'hx-session' },
          h('a', { class: 'hx-session__head', href: `#/progress/workout/${s.sessionId}` }, `${formatShortDate(s.date)} · ${s.dayName}${s.unit !== unit ? ` · ${s.unit}` : ''}`),
          h('ul', { class: 'set-chips' }, ...s.sets.map((set) => h('li', null, formatLoggedSet(set)))),
        ),
      ),
    );
    toggle.textContent = expanded ? 'Show fewer' : `Show all ${sessions.length}`;
  }
  toggle.addEventListener('click', () => {
    expanded = !expanded;
    paint();
  });
  paint();

  return h('section', { class: 'panel', 'aria-label': 'Recent workouts' }, h('h2', { class: 'section-title' }, 'Recent'), list, toggle);
}

/**
 * One exercise over time: current working weight, personal records, a chart,
 * and the sets from each workout. Route: /progress/exercise/:id
 * (id = any logged row of that exercise; the workout screens link it).
 */
export async function renderExerciseHistory(root, { db, params }) {
  const id = Number(params.id);
  const data = Number.isInteger(id) ? await loadExerciseHistory(db, id) : null;
  if (!data) {
    root.append(
      screenHeader({ title: 'Exercise not found', backHref: '#/progress', backLabel: 'Progress' }),
      h('p', { class: 'muted' }, 'That exercise isn’t in your history.'),
    );
    return;
  }

  const { name, program, sessions, analysis } = data;
  root.append(screenHeader({ eyebrow: 'Exercise history', title: name, backHref: '#/progress', backLabel: 'Progress' }));

  if (program) {
    root.append(
      h(
        'section',
        { class: 'summary-card', 'aria-label': 'Current working weight' },
        h('p', { class: 'muted small' }, 'Current'),
        h('p', { class: 'summary-card__target' }, formatWeightWithUnit(program.weight, program.unit)),
        h('p', { class: 'muted small' }, `In your program · ${program.dayName}`),
      ),
    );
  }

  if (!analysis) {
    root.append(emptyState({ title: 'Nothing logged yet', body: 'Complete a set of this exercise in a workout and its history, records, and chart appear here.', action: { href: '#/workout', label: 'Go to workout' } }));
    return;
  }

  root.append(recordsSection(analysis));
  if (!analysis.isBodyweight) root.append(repsAtWeightSection(analysis));
  root.append(chartSection(analysis), recentSection(sessions, analysis.unit));

  if (analysis.otherUnitSessions > 0) {
    root.append(
      h('p', { class: 'field__hint' }, `${pluralize(analysis.otherUnitSessions, 'earlier workout')} used a different unit, so ${analysis.otherUnitSessions === 1 ? 'it isn’t' : 'they aren’t'} counted in the records or chart.`),
    );
  }
}
