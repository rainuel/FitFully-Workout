import { h } from '../utils/dom.js';

/** Marks a screen area that a later build phase will fill in. Removed as phases land. */
export function phaseNote(phase, text) {
  return h('p', { class: 'phase-note' }, h('strong', null, `Phase ${phase}. `), text);
}
