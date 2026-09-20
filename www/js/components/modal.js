import { h } from '../utils/dom.js';

/**
 * Confirmation dialog built on the native <dialog> element (focus trap and
 * inert background come for free). Resolves true if confirmed, false otherwise.
 */
export function confirmDialog({ title, body, confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false }) {
  return new Promise((resolve) => {
    const dialog = h(
      'dialog',
      { class: 'dialog', 'aria-labelledby': 'dialog-title' },
      h(
        'form',
        { method: 'dialog', class: 'dialog__body' },
        h('h2', { class: 'dialog__title', id: 'dialog-title' }, title),
        body ? h('p', { class: 'dialog__text' }, body) : null,
        h(
          'div',
          { class: 'dialog__actions' },
          h('button', { class: 'btn btn--secondary', type: 'submit', value: 'cancel' }, cancelLabel),
          h('button', { class: `btn ${danger ? 'btn--danger' : 'btn--primary'}`, type: 'submit', value: 'confirm' }, confirmLabel),
        ),
      ),
    );

    dialog.addEventListener('close', () => {
      const confirmed = dialog.returnValue === 'confirm';
      dialog.remove();
      resolve(confirmed);
    });
    // A tap on the dimmed backdrop lands on the <dialog> itself, not its content.
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) dialog.close('cancel');
    });

    document.body.append(dialog);
    dialog.showModal();
  });
}

/** The standard "leave without saving?" question. Resolves true if the user wants to leave. */
export function confirmDiscard() {
  return confirmDialog({
    title: 'Discard changes?',
    body: 'Your edits on this screen haven’t been saved.',
    confirmLabel: 'Discard',
    cancelLabel: 'Keep editing',
    danger: true,
  });
}
