// One set on the exercise screen: weight, reps, and a tick button.
//
//   setRow({ set, label, step, previousSet, removable, onSave, onToggle, onRemove })
//
// The row keeps its own weight/reps while the user adjusts them and reports each
// change through onSave (saved to the database straight away). onToggle(values,
// wantDone) is called when the tick button is pressed and returns a promise.

import { h } from '../utils/dom.js';
import { formatRepTarget, formatWeight } from '../utils/format.js';
import { LIMITS } from '../services/program-rules.js';
import { defaultReps, formatLoggedSet } from '../services/workout-rules.js';
import { field, stepper } from './controls.js';
import { icon } from './icons.js';
import { primeRestAlert } from './rest-timer.js';

const showWeight = (value) => (value === 0 ? 'BW' : formatWeight(value));

export function setRow({ set, label, step, previousSet = null, removable = false, onSave, onToggle, onRemove }) {
  const isWarmup = set.kind === 'warmup';
  const values = {
    weight: set.weight ?? set.targetWeight ?? 0,
    reps: defaultReps(set, previousSet),
  };
  let busy = false;

  const li = h('li');

  function hint() {
    if (isWarmup) return 'Warm-up · not counted toward your sets';
    const target = `Target ${formatRepTarget(set.targetRepMin, set.targetRepMax)}`;
    return previousSet ? `${target} · Last ${formatLoggedSet(previousSet)}` : target;
  }

  function change(next) {
    Object.assign(values, next);
    onSave({ ...values });
    paint();
  }

  async function press() {
    if (busy) return;
    busy = true;
    if (!set.completed) primeRestAlert(); // must happen inside the tap
    try {
      await onToggle({ ...values }, !set.completed);
    } finally {
      busy = false;
    }
  }

  function paint() {
    li.className = `log-set${isWarmup ? ' log-set--warmup' : ''}${set.completed ? ' is-done' : ''}`;
    li.replaceChildren(
      h(
        'div',
        { class: 'log-set__head' },
        h('span', { class: 'log-set__label' }, isWarmup ? h('span', { class: 'tag tag--warmup' }, 'Warm-up') : null, label),
        removable && !set.completed
          ? h('button', { class: 'icon-btn', type: 'button', 'aria-label': `Remove ${isWarmup ? 'warm-up' : 'set'} ${label}`, onClick: onRemove }, icon('close'))
          : null,
      ),
      h('p', { class: 'log-set__hint' }, hint()),
      h(
        'div',
        { class: 'log-set__controls' },
        field(
          `Weight (${set.unit})`,
          stepper({
            label: `${isWarmup ? 'Warm-up' : 'Set'} ${label} weight`,
            value: values.weight,
            min: 0,
            max: LIMITS.maxWeight,
            step,
            format: showWeight,
            compact: true,
            onChange: (weight) => change({ weight }),
          }),
        ),
        field(
          'Reps',
          stepper({
            label: `${isWarmup ? 'Warm-up' : 'Set'} ${label} reps`,
            value: values.reps,
            min: LIMITS.minReps,
            max: LIMITS.maxReps,
            compact: true,
            onChange: (reps) => change({ reps }),
          }),
        ),
        h(
          'button',
          {
            class: 'log-set__check',
            type: 'button',
            'aria-pressed': String(set.completed),
            'aria-label': set.completed ? `${isWarmup ? 'Warm-up' : 'Set'} ${label} done. Tap to undo.` : `Mark ${isWarmup ? 'warm-up' : 'set'} ${label} done`,
            onClick: press,
          },
          icon('check', { strokeWidth: 3 }),
        ),
      ),
    );
  }

  paint();
  return li;
}
