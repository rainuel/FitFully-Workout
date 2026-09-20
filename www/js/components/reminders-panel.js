import { h } from '../utils/dom.js';
import { loadReminderState, sendTestReminder, setReminderTime, setRemindersEnabled } from '../services/notification-service.js';
import { formatReminderTime } from '../services/notification-rules.js';
import { field, toggle } from './controls.js';
import { showToast } from './toast.js';

const DENIED_TOAST = 'Android blocked notifications for Fit Fully. Allow them in Settings → Apps → Fit Fully → Notifications.';

/** Profile panel: turn workout reminders on or off and choose the time. Redraws itself. */
export async function remindersPanel(db) {
  const section = h('section', { class: 'panel panel--form', 'aria-labelledby': 'reminders-heading' });

  async function turnOn() {
    const result = await setRemindersEnabled(db, true);
    if (result.ok) showToast('Reminders on');
    else if (result.reason === 'denied') showToast(DENIED_TOAST, { ms: 5000 });
    else showToast('Couldn’t turn reminders on. Try again.');
    await draw();
  }

  function summary(state) {
    if (!state.enabled) return null;
    if (state.permission !== 'granted') {
      return h(
        'div',
        { class: 'notice notice--warn stack' },
        h('p', null, 'Android isn’t allowing notifications from Fit Fully, so reminders are paused.'),
        h('button', { class: 'btn btn--secondary btn--compact', type: 'button', onClick: turnOn }, 'Allow notifications'),
      );
    }
    if (!state.hasTrainingDays) return h('p', { class: 'muted small' }, 'Your program has no training days yet, so no reminders will be sent.');
    return h('p', { class: 'muted small' }, `You’ll be reminded ${state.daysLabel} at ${formatReminderTime(state.time)}. Rest days stay quiet.`);
  }

  async function draw() {
    const state = await loadReminderState(db);
    const heading = h('h2', { class: 'section-title', id: 'reminders-heading' }, 'Reminders');

    if (!state.supported) {
      section.replaceChildren(
        heading,
        h('p', { class: 'muted' }, 'Workout reminders are available in the Android app. They’re scheduled on the phone and need no internet connection.'),
      );
      return;
    }

    const timeInput = h('input', {
      class: 'input',
      type: 'time',
      value: state.time,
      required: true,
      'aria-label': 'Reminder time',
      onChange: async (event) => {
        const result = await setReminderTime(db, event.target.value);
        if (!result.ok) {
          showToast(result.errors[0]);
          event.target.value = state.time;
          return;
        }
        showToast(result.scheduleFailed ? 'Time saved, but reminders couldn’t be rescheduled' : `Reminder time: ${formatReminderTime(result.value)}`);
        await draw();
      },
    });
    timeInput.value = state.time;

    section.replaceChildren(
      heading,
      toggle({
        label: 'Workout reminders',
        description: 'A notification on the days you train.',
        checked: state.enabled,
        onChange: async (enabled) => {
          if (enabled) return turnOn();
          await setRemindersEnabled(db, false);
          showToast('Reminders off');
          await draw();
        },
      }),
      field('Reminder time', timeInput),
      summary(state),
      h(
        'button',
        {
          class: 'btn btn--secondary btn--block',
          type: 'button',
          onClick: async () => {
            const result = await sendTestReminder();
            if (result.ok) showToast('Test notification on its way');
            else if (result.reason === 'denied') showToast(DENIED_TOAST, { ms: 5000 });
            else showToast('Couldn’t send a test notification');
          },
        },
        'Send a test notification',
      ),
    );
  }

  await draw();
  return section;
}
