import { h } from '../utils/dom.js';
import { icon } from './icons.js';
import { filterExercises } from '../services/exercise-service.js';

/**
 * Searchable, filterable list of exercises. Used by the library (rows are
 * links) and by the "add to day" picker (rows are buttons).
 *
 *   exerciseBrowser({ exercises, hrefFor })   rows link to hrefFor(exercise)
 *   exerciseBrowser({ exercises, onSelect })  rows call onSelect(exercise)
 */
export function exerciseBrowser({ exercises, hrefFor = null, onSelect = null }) {
  const state = { query: '', muscle: null };
  const groups = [...new Set(exercises.map((e) => e.muscleGroup).filter(Boolean))].sort();

  const results = h('ul', { class: 'pick-list' });
  const empty = h('p', { class: 'muted empty-note', hidden: true }, 'No exercises match. Try a different search, or create your own.');
  const chipsRow = h('div', { class: 'chip-scroll', role: 'group', 'aria-label': 'Filter by muscle group' });

  function row(exercise) {
    const inner = [
      h(
        'span',
        { class: 'pick-row__text' },
        h('span', { class: 'pick-row__name' }, exercise.name),
        h('span', { class: 'pick-row__meta' }, [exercise.muscleGroup, exercise.isCustom ? 'Custom' : null].filter(Boolean).join(' · ')),
      ),
      icon('chevron'),
    ];
    return h(
      'li',
      null,
      hrefFor
        ? h('a', { class: 'pick-row', href: hrefFor(exercise) }, ...inner)
        : h('button', { class: 'pick-row', type: 'button', onClick: () => onSelect(exercise) }, ...inner),
    );
  }

  function paintChips() {
    chipsRow.replaceChildren(
      ...[null, ...groups].map((group) =>
        h(
          'button',
          {
            class: 'chip-btn',
            type: 'button',
            'aria-pressed': String(state.muscle === group),
            onClick: () => {
              state.muscle = group;
              paintChips();
              paintResults();
            },
          },
          group ?? 'All',
        ),
      ),
    );
  }

  function paintResults() {
    const list = filterExercises(exercises, state);
    results.replaceChildren(...list.map(row));
    results.hidden = list.length === 0;
    empty.hidden = list.length !== 0;
  }

  const search = h('input', {
    class: 'input input--search',
    type: 'search',
    placeholder: 'Search exercises',
    'aria-label': 'Search exercises',
    autocomplete: 'off',
    enterkeyhint: 'search',
    onInput: (event) => {
      state.query = event.target.value;
      paintResults();
    },
  });

  paintChips();
  paintResults();

  return h('div', { class: 'browser' }, h('div', { class: 'search-box' }, icon('search'), search), chipsRow, results, empty);
}
