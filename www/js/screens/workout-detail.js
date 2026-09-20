import { h, pluralize } from '../utils/dom.js';
import { formatFullDate } from '../utils/dates.js';
import { formatWeightWithUnit } from '../utils/format.js';
import { loadSessionDetail } from '../services/history-service.js';
import { describeTargets, formatDurationWords, formatLoggedSet } from '../services/workout-rules.js';
import { screenHeader } from '../components/screen-header.js';

function stat(value, label) {
  return h('div', { class: 'stat' }, h('span', { class: 'stat__value' }, String(value)), h('span', { class: 'stat__label' }, label));
}

function chips(sets, { warmup = false } = {}) {
  return h(
    'ul',
    { class: 'set-chips' },
    ...sets.map((set) => h('li', { class: warmup ? 'is-warmup' : null }, formatLoggedSet(set))),
  );
}

function progressionNote(ex) {
  if (ex.progressionState === 'committed') {
    const to = ex.suggestedWeight ? ` to ${formatWeightWithUnit(ex.suggestedWeight, ex.unit)}` : '';
    return `Top of the range on every set. Weight increase committed${to}.`;
  }
  if (ex.progressionState === 'kept') return 'Top of the range on every set. Kept the same weight.';
  if (ex.progressionState === 'eligible') return 'Top of the range on every set.';
  return null;
}

function exerciseCard(ex) {
  const totalWorking = ex.sets.filter((s) => s.kind === 'working').length;
  const done = ex.working.length > 0;
  const note = progressionNote(ex);

  return h(
    'li',
    { class: `hx-card${done ? '' : ' is-skipped'}` },
    h(
      'div',
      { class: 'hx-card__head' },
      done ? h('a', { class: 'hx-card__name', href: `#/progress/exercise/${ex.id}` }, ex.name) : h('span', { class: 'hx-card__name' }, ex.name),
      ex.isPr ? h('span', { class: 'tag tag--pr' }, 'New PR') : null,
    ),
    h('p', { class: 'hx-card__meta' }, `${describeTargets(ex)} · ${formatWeightWithUnit(ex.targetWeight, ex.unit)}`),
    ex.warmups.length > 0 ? h('p', { class: 'hx-card__label' }, 'Warm-up') : null,
    ex.warmups.length > 0 ? chips(ex.warmups, { warmup: true }) : null,
    done && ex.warmups.length > 0 ? h('p', { class: 'hx-card__label' }, 'Working sets') : null,
    done ? chips(ex.working) : h('p', { class: 'hx-card__note' }, 'Not done in this workout.'),
    done && ex.working.length < totalWorking ? h('p', { class: 'hx-card__note' }, `${ex.working.length} of ${pluralize(totalWorking, 'set')} done.`) : null,
    note ? h('p', { class: 'hx-card__note' }, note) : null,
  );
}

/** One finished workout exactly as it was logged. Route: /progress/workout/:id */
export async function renderWorkoutDetail(root, { db, params }) {
  const id = Number(params.id);
  const data = Number.isInteger(id) ? await loadSessionDetail(db, id) : null;
  if (!data) {
    root.append(
      screenHeader({ title: 'Workout not found', backHref: '#/progress', backLabel: 'Progress' }),
      h('p', { class: 'muted' }, 'That workout isn’t in your history.'),
    );
    return;
  }

  const { session, summary, exercises } = data;
  const earlyNote = summary.early
    ? h('p', { class: 'notice' }, 'Finished early. The exercises left undone weren’t marked as done, and this still counted as a workout.')
    : null;

  root.append(
    screenHeader({ eyebrow: formatFullDate(session.date), title: session.dayName, backHref: '#/progress', backLabel: 'Progress' }),
    h(
      'section',
      { class: 'stats', 'aria-label': 'Workout totals' },
      stat(`${summary.exercisesDone} / ${summary.exercisesPlanned}`, 'Exercises'),
      stat(summary.workingSets, 'Sets'),
      stat(formatDurationWords(summary.durationMs), 'Time'),
    ),
    ...(earlyNote ? [earlyNote] : []),
    h('ul', { class: 'stack' }, ...exercises.map(exerciseCard)),
  );
}
