// The progression prompt for one exercise: congratulations + KEEP / COMMIT when
// the top of the rep range was reached on every set; when not, a set-by-set
// breakdown with a suggestion.
// The card only asks; the program changes only when the user taps COMMIT.
//
//   progressionCard({ name, progression, onKeep, onCommit })

import { h } from '../utils/dom.js';
import { formatWeight } from '../utils/format.js';

const UNEVEN_SPREAD = 3; // gap between best and worst set that counts as "uneven"

const w = (value, unit) => `${formatWeight(value)} ${unit}`;
const repsLabel = (n) => `${n} ${n === 1 ? 'rep' : 'reps'}`;

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
};

/** Suggestions from the pattern across sets. Returns a list of short sentences. */
function advice({ sets, targetRepMin, targetRepMax, unit }) {
  const reps = sets.map((s) => s.reps);
  const min = Math.min(...reps);
  const max = Math.max(...reps);
  const tips = [];

  // A set done lighter than planned is the first thing to fix.
  const planned = Math.max(...sets.map((s) => s.targetWeight));
  const lighter = sets.map((s, i) => (s.weight < s.targetWeight ? i + 1 : null)).filter(Boolean);
  if (lighter.length) {
    const which = lighter.length === 1 ? `Set ${lighter[0]} was` : `Sets ${lighter.join(', ')} were`;
    tips.push(`${which} lighter than your planned ${w(planned, unit)}. Try to keep ${w(planned, unit)} on every set.`);
  }

  // Reps dropped on every set: fatigue is the likely culprit.
  const declining = sets.length > 2 && reps.every((r, i) => i === 0 || r < reps[i - 1]);
  // Anchor on the typical set, kept inside the rep range.
  const anchor = Math.min(Math.max(median(reps), targetRepMin), targetRepMax);

  if (declining) {
    tips.push(`Your reps dropped on every set. Rest a little longer between sets, and consistently hit ${repsLabel(anchor)} on each one before trying to add more.`);
  } else if (max - min >= UNEVEN_SPREAD) {
    tips.push(`Your sets were uneven. Balance things out: consistently hit ${repsLabel(anchor)} on every set before trying to add more.`);
  } else {
    const next = Math.min(min + 1, targetRepMax);
    tips.push(`Nice and steady. Aim for ${repsLabel(next)} on every set next time, then keep building toward ${targetRepMax}.`);
  }
  return tips;
}

export function progressionCard({ name, progression, onKeep, onCommit }) {
  const { state, totalSets, liftedWeight, suggestedWeight, currentWeight, unit, sets, targetRepMin, targetRepMax } = progression;
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

  // Not reached, with per-set data: show each set and tailored advice.
  if (state === 'not_reached' && Array.isArray(sets) && sets.length && targetRepMax != null) {
    const range = targetRepMin === targetRepMax ? `${targetRepMax}` : `${targetRepMin}–${targetRepMax}`;
    const planned = Math.max(...sets.map((s) => s.targetWeight || 0)) || liftedWeight;
    return h(
      'section',
      { class: 'progress-card', 'aria-label': `Progression for ${name}` },
      h('p', { class: 'progress-card__name' }, name),
      h('p', null, `Keep pushing! To move up, hit ${repsLabel(targetRepMax)} on all ${totalSets} sets at ${w(planned, unit)}. Your target range is ${range} reps.`),
      h(
        'ul',
        { class: 'progress-card__sets' },
        ...sets.map((s, i) =>
          h(
            'li',
            null,
            h('span', null, `Set ${i + 1}`),
            h('span', null, `${w(s.weight, unit)} × ${repsLabel(s.reps)}`),
          ),
        ),
      ),
      ...advice({ sets, targetRepMin, targetRepMax, unit }).map((tip) => h('p', { class: 'progress-card__tip' }, tip)),
    );
  }

  const body = {
    // Fallback when per-set data isn't available.
    not_reached: `Keep pushing! You didn’t reach your full target this time, but you’re getting closer. Keep working at ${w(liftedWeight, unit)} and aim to complete your target next time.`,
    kept: `Staying at ${w(liftedWeight, unit)}. Your program is unchanged. Go for ${targetRepMax != null ? repsLabel(targetRepMax) : 'the top of the range'} on every set next time.`,
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