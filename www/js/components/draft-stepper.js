import { h } from '../utils/dom.js';
import { stepper } from './controls.js';

/**
 * A stepper that keeps its own value for forms with a Save button.
 * Returns { element, get value(), set(value) }. `stepper` itself is
 * stateless, so this redraws it whenever the value changes.
 */
export function draftStepper({ value, onChange = null, ...options }) {
  const element = h('div');
  let current = value;

  function draw() {
    element.replaceChildren(
      stepper({
        ...options,
        value: current,
        onChange: (next) => {
          current = next;
          draw();
          if (onChange) onChange(next);
        },
      }),
    );
  }

  draw();
  return {
    element,
    get value() {
      return current;
    },
    set(next) {
      current = next;
      draw();
    },
  };
}
