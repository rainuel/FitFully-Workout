// The progression prompt for one exercise: congratulations + KEEP / COMMIT when
// the top of the rep range was reached on every set, encouragement when not.
// The card only asks; the program changes only when the user taps COMMIT.
//
//   progressionCard({ name, progression, onKeep, onCommit })

import { h } from '../utils/dom.js';
import { formatWeight } from '../utils/format.js';

const w = (value, unit) => `${formatWeight(value)} ${unit}`;

export function progressionCard({ name, progression, onKeep, onCommit }) {
  const { state, totalSets, liftedWeight, suggestedWeight, currentWeight, unit } = progression;
  let busy = false;
  const guard = (fn) => async () => {
    if (busy) return;
    busy = true;
    try {
      await fn();
    } finally {
      busy = false;
    }
  };

  if (state === 'eligible') {
    return h(
      'section',
      { class: 'progress-card progress-card--up', 'aria-label': `Progression for ${name}` },
      h('p', { class: 'progress-card__name' }, name),
      h('h3', { class: 'progress-card__title' }, 'Congratulations!'),
      h('p', null, `You completed all ${totalSets} sets at the top of your rep range.`),
      h('p', null, `You may now increase your weight to ${w(suggestedWeight, unit)}.`),
      progression.canCommit
        ? h(
            'div',
            { class: 'progress-card__actions' },
            h('button', { class: 'btn btn--secondary', type: 'button', onClick: guard(onKeep) }, `Keep ${w(liftedWeight, unit)}`),
            h('button', { class: 'btn btn--primary', type: 'button', onClick: guard(onCommit) }, `Commit to ${w(suggestedWeight, unit)}`),
          )
        : null,
    );
  }

  const body = {
    not_reached: `Keep pushing! You didn’t reach your full target this time, but you’re getting closer. Keep working at ${w(liftedWeight, unit)} and aim to complete your target next time.`,
    kept: `Staying at ${w(liftedWeight, unit)}. Your program is unchanged. Go for the top of the range on every set next time.`,
    committed: `Done. Your working weight for ${name} is now ${w(suggestedWeight ?? currentWeight, unit)}.`,
    applied: `Your program already uses ${w(currentWeight, unit)} for ${name}.`,
  }[state];
  if (!body) return null;

  return h(
    'section',
    { class: `progress-card${state === 'committed' ? ' progress-card--up' : ''}`, 'aria-label': `Progression for ${name}` },
    h('p', { class: 'progress-card__name' }, name),
    h('p', null, body),
  );
}
