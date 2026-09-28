import { h, pluralize } from '../utils/dom.js';
import { weekdayName } from '../utils/dates.js';
import { loadDayEditor, reorderDayExercises, saveDay, saveDayStyle } from '../services/program-service.js';
import { DAY_COLORS, DAY_ICONS, LIMITS, summarizeProgramExercise } from '../services/program-rules.js';
import { screenHeader } from '../components/screen-header.js';
import { panel } from '../components/panel.js';
import { toggle } from '../components/controls.js';
import { icon } from '../components/icons.js';
import { plate } from '../components/plate.js';
import { makeSortable } from '../components/sortable.js';
import { showToast } from '../components/toast.js';

export function dayNotFound(root) {
  root.append(
    screenHeader({ title: 'Day not found', backHref: '#/program', backLabel: 'Program' }),
    h('p', { class: 'muted' }, 'That day isn’t in your program.'),
  );
}

function exerciseRow(pe) {
  const s = summarizeProgramExercise(pe);
  return h(
    'li',
    { class: 'ex-row', 'data-sort-id': pe.id },
    h(
      'button',
      { class: 'drag-handle', type: 'button', 'data-sort-handle': true, 'aria-label': `Reorder ${pe.name}. Drag, or use the up and down arrow keys.` },
      icon('grip', { strokeWidth: 3 }),
    ),
    h(
      'a',
      { class: 'ex-row__body', href: `#/program/edit/${pe.id}` },
      h('span', { class: 'ex-row__name' }, pe.name),
      h('span', { class: 'ex-row__target' }, `${s.target} · ${s.weight}`),
      h('span', { class: 'ex-row__sub' }, [s.rest, s.warmups].filter(Boolean).join(' · ')),
    ),
    icon('chevron'),
  );
}

/** Edit one weekday: its name, whether it is a rest day, and its exercises in order. */
export async function renderProgramDay(root, { db, params }) {
  const weekday = Number(params.weekday);
  const first = Number.isInteger(weekday) ? await loadDayEditor(db, weekday) : null;
  if (!first) return dayNotFound(root);

  const live = h('p', { class: 'sr-only', role: 'status', 'aria-live': 'polite' });
  const body = h('div', { class: 'stack' });
  let focusName = false;

  root.append(screenHeader({ eyebrow: 'Program', title: weekdayName(weekday), backHref: '#/program', backLabel: 'Program' }), body, live);

  function settingsPanel(day) {
    const error = h('p', { class: 'field__error', role: 'alert', hidden: true });
    const showName = day.name.trim().toLowerCase() === 'rest' ? '' : day.name;

    const nameInput = h('input', {
      class: 'input',
      type: 'text',
      value: showName,
      maxlength: LIMITS.maxDayNameLength,
      placeholder: 'e.g. Push',
      enterkeyhint: 'done',
      autocomplete: 'off',
      'aria-label': 'Day name',
      onChange: async (event) => {
        const result = await saveDay(db, day.id, { name: event.target.value, isRest: false });
        if (!result.ok) {
          error.textContent = result.errors[0];
          error.hidden = false;
          return;
        }
        showToast('Day renamed');
        await paint();
      },
    });
    nameInput.value = showName;

    return panel(
      null,
      day.isRest
        ? null
        : h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Day name'), nameInput, error),
      toggle({
        label: 'Rest day',
        description: 'No workout is scheduled. Exercises are kept if you switch back.',
        checked: day.isRest,
        onChange: async (isRest) => {
          // A former rest day is called "Rest"; give it a working name the user can change.
          const name = !isRest && day.name.trim().toLowerCase() === 'rest' ? 'Workout' : day.name;
          const result = await saveDay(db, day.id, { name, isRest });
          if (result.ok) {
            focusName = !isRest;
            await paint();
          }
        },
      }),
    );
  }

  // Icon and colour for this day (shown in the week strip, the Program list and the Workout tab).
  function stylePanel(day) {
    if (day.isRest) return null;
    const save = async (next) => {
      const result = await saveDayStyle(db, day.id, { icon: day.icon, color: day.color, ...next });
      if (!result.ok) {
        showToast(result.errors[0]);
        return;
      }
      await paint();
    };

    const iconOption = (key, label, content) =>
      h('button', { class: 'style-option', type: 'button', role: 'radio', 'aria-checked': String(day.icon === key), 'aria-label': label, title: label, onClick: () => save({ icon: key }) }, content);
    const colorOption = (key, label) =>
      h('button', { class: `swatch${key === null ? ' swatch--auto' : ''}`, type: 'button', role: 'radio', 'data-color': key, 'aria-checked': String(day.color === key), 'aria-label': label, title: label, onClick: () => save({ color: key }) }, key === null ? 'A' : null);

    return panel(
      'Icon and colour',
      h('div', { class: 'style-preview' }, plate({ plateIndex: 2, large: true, icon: day.icon, color: day.color }), h('span', { class: 'muted' }, `How ${day.name} looks in your week`)),
      h('p', { class: 'field__label' }, 'Icon'),
      h(
        'div',
        { class: 'style-grid', role: 'radiogroup', 'aria-label': 'Day icon' },
        iconOption(null, 'Plate (default)', plate({ plateIndex: 2 })),
        ...DAY_ICONS.map((i) => iconOption(i.key, i.label, icon(i.key, { strokeWidth: 2.2 }))),
      ),
      h('p', { class: 'field__label' }, 'Colour'),
      h('div', { class: 'style-grid', role: 'radiogroup', 'aria-label': 'Day colour' }, colorOption(null, 'Automatic'), ...DAY_COLORS.map((c) => colorOption(c.key, c.label))),
    );
  }

  function exercisesSection(day, exercises) {
    const list = h('ul', { class: 'ex-list' }, ...exercises.map(exerciseRow));
    if (exercises.length > 1) {
      makeSortable(list, {
        announce: (text) => {
          live.textContent = text;
        },
        onReorder: async (ids) => {
          try {
            await reorderDayExercises(db, day.id, ids.map(Number));
          } catch (err) {
            console.error('Reorder failed', err);
            showToast('Couldn’t save the new order');
            await paint();
          }
        },
      });
    }

    return h(
      'section',
      { class: 'stack', 'aria-label': 'Exercises' },
      h('h2', { class: 'section-title' }, exercises.length === 0 ? 'Exercises' : `Exercises · ${exercises.length}`),
      exercises.length === 0
        ? h('div', { class: 'empty-state' }, h('p', { class: 'empty-state__title' }, 'No exercises yet'), h('p', { class: 'muted' }, `Add what you’ll do on ${day.name}.`))
        : list,
      exercises.length > 1 ? h('p', { class: 'muted small' }, 'Drag the handle on the left to reorder.') : null,
      h('a', { class: 'btn btn--primary btn--block', href: `#/program/day/${weekday}/add` }, icon('plus', { strokeWidth: 2.5 }), 'Add exercise'),
    );
  }

  async function paint() {
    const { day, exercises } = await loadDayEditor(db, weekday);
    const settings = settingsPanel(day);
    body.replaceChildren(
      ...[settings, stylePanel(day)].filter(Boolean),
      day.isRest
        ? h(
            'div',
            { class: 'empty-state' },
            h('p', { class: 'empty-state__title' }, 'Rest day'),
            h('p', { class: 'muted' }, exercises.length > 0 ? `${pluralize(exercises.length, 'exercise')} kept in case you switch back.` : 'No workout is scheduled for this day.'),
          )
        : exercisesSection(day, exercises),
    );
    if (focusName) {
      focusName = false;
      const input = settings.querySelector('input');
      input?.focus();
      input?.select();
    }
  }

  await paint();
}