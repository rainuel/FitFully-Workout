// Small form controls shared by the program screens. Each one is a plain
// function that returns an element and reports changes through a callback.

import { h } from '../utils/dom.js';
import { icon } from './icons.js';
import { roundWeight } from '../services/program-rules.js';

let idCounter = 0;
export function uid(prefix = 'f') {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
}

/**
 * Number stepper: [ − ] value [ + ]. The value can also be typed. Out-of-range
 * or non-numeric entries snap back. `format` controls how the value is shown.
 */
export function stepper({ label, value, min, max, step = 1, unit = null, format = String, onChange, compact = false, editable = true }) {
  const inputId = uid('num');
  const integerOnly = Number.isInteger(step) && Number.isInteger(min);

  function commit(next) {
    const clamped = Math.min(max, Math.max(min, roundWeight(next)));
    if (clamped !== value) onChange(clamped);
    else input.value = format(value); // reset a rejected entry
  }

  const input = h('input', {
    id: inputId,
    class: 'stepper__input',
    type: 'text',
    inputmode: integerOnly ? 'numeric' : 'decimal',
    enterkeyhint: 'done',
    autocomplete: 'off',
    readonly: !editable,
    value: format(value),
    'aria-label': label,
    onFocus: (event) => event.target.select(),
    onChange: (event) => {
      const parsed = Number(String(event.target.value).replace(',', '.').replace(/[^\d.]/g, ''));
      if (event.target.value.trim() === '' || !Number.isFinite(parsed)) input.value = format(value);
      else commit(integerOnly ? Math.round(parsed) : parsed);
    },
  });
  // The `value` attribute alone does not update after the user types, so set the property too.
  input.value = format(value);

  const minus = h(
    'button',
    { class: 'stepper__btn', type: 'button', 'aria-label': `Decrease ${label}`, disabled: value <= min, onClick: () => commit(value - step) },
    icon('minus', { strokeWidth: 2.5 }),
  );
  const plus = h(
    'button',
    { class: 'stepper__btn', type: 'button', 'aria-label': `Increase ${label}`, disabled: value >= max, onClick: () => commit(value + step) },
    icon('plus', { strokeWidth: 2.5 }),
  );

  return h(
    'div',
    { class: `stepper${compact ? ' stepper--compact' : ''}` },
    minus,
    h('div', { class: 'stepper__value' }, input, unit ? h('span', { class: 'stepper__unit' }, unit) : null),
    plus,
  );
}

/** A labelled control row: small label above, control below. */
export function field(label, control, hint = null) {
  return h(
    'div',
    { class: 'field' },
    h('span', { class: 'field__label' }, label),
    control,
    hint ? h('p', { class: 'field__hint' }, hint) : null,
  );
}

/** Segmented choice (radio group look), e.g. [ lbs | kg ]. */
export function segmented({ label, options, value, onChange }) {
  return h(
    'div',
    { class: 'segmented', role: 'radiogroup', 'aria-label': label },
    ...options.map((option) =>
      h(
        'button',
        {
          class: 'segmented__option',
          type: 'button',
          role: 'radio',
          'aria-checked': String(option.value === value),
          onClick: () => {
            if (option.value !== value) onChange(option.value);
          },
        },
        option.label,
      ),
    ),
  );
}

/** On/off switch with a label and optional description. */
export function toggle({ label, description = null, checked, onChange }) {
  return h(
    'button',
    { class: 'toggle', type: 'button', role: 'switch', 'aria-checked': String(checked), onClick: () => onChange(!checked) },
    h('span', { class: 'toggle__text' }, h('span', { class: 'toggle__label' }, label), description ? h('span', { class: 'toggle__desc' }, description) : null),
    h('span', { class: 'toggle__track', 'aria-hidden': 'true' }, h('span', { class: 'toggle__thumb' })),
  );
}
