// The rest timer: a bar pinned above the bottom navigation while a rest is running.
//
// The rest itself lives in the database (an absolute end time), so this
// component only DISPLAYS it: it re-reads the current time every 250 ms and
// never counts down on its own. That is what makes it survive the app being
// closed, the phone sleeping, or the user switching screens.
//
//   const timer = createRestTimer({ session, onAdjust(deltaMs), onSkip() });
//   parent.append(timer.element);
//   timer.update(newSession);     // after anything changes the session
//   timer.destroy();              // from the screen's cleanup function

import { h } from '../utils/dom.js';
import { formatRest } from '../utils/format.js';
import { REST_STEP_MS, restState } from '../services/workout-rules.js';

let audio = null;

/**
 * Call from a tap handler (a set being ticked). Browsers only let a page make
 * sound after a user gesture, so this readies the audio for when the rest ends.
 */
export function primeRestAlert() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    audio = audio ?? new Ctx();
    if (audio.state === 'suspended') audio.resume();
  } catch {
    // no audio: the vibration and the bar still work
  }
}

function alertRestOver() {
  try {
    navigator.vibrate?.([250, 120, 250]);
  } catch {
    // vibration is optional
  }
  try {
    if (!audio || audio.state !== 'running') return;
    const start = audio.currentTime;
    [0, 0.28].forEach((offset) => {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, start + offset);
      gain.gain.exponentialRampToValueAtTime(0.25, start + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + 0.22);
      osc.connect(gain).connect(audio.destination);
      osc.start(start + offset);
      osc.stop(start + offset + 0.25);
    });
  } catch {
    // sound is optional
  }
}

export function createRestTimer({ session, onAdjust, onSkip }) {
  let current = session;
  let wasCounting = false;

  const label = h('span', { class: 'rest-bar__label' }, 'Rest');
  const time = h('span', { class: 'rest-bar__time', role: 'timer' });
  const less = h('button', { class: 'rest-bar__btn', type: 'button', 'aria-label': 'Subtract 15 seconds', onClick: () => onAdjust(-REST_STEP_MS) }, '−15');
  const more = h('button', { class: 'rest-bar__btn', type: 'button', 'aria-label': 'Add 15 seconds', onClick: () => onAdjust(REST_STEP_MS) }, '+15');
  const skip = h('button', { class: 'rest-bar__skip', type: 'button', onClick: () => onSkip() }, 'Skip');

  const element = h(
    'section',
    { class: 'rest-bar', 'aria-label': 'Rest timer', hidden: true },
    h('div', { class: 'rest-bar__clock' }, label, time),
    h('div', { class: 'rest-bar__actions' }, less, more, skip),
  );

  function tick() {
    if (document.hidden) return; // nothing to draw while the screen is off
    const state = restState(current, Date.now());
    if (!state) {
      element.hidden = true;
      wasCounting = false;
      return;
    }
    element.hidden = false;
    element.classList.toggle('is-over', state.over);
    element.classList.toggle('is-paused', state.paused);
    label.textContent = state.paused ? 'Rest paused' : state.over ? 'Rest over' : 'Rest';
    time.textContent = state.over ? 'Go' : formatRest(Math.ceil(state.remainingMs / 1000));
    skip.textContent = state.over ? 'Dismiss' : 'Skip';
    less.disabled = more.disabled = state.paused || state.over;

    // Alert once, on the tick where a running rest reaches zero. A rest that was
    // already over when the screen opened stays quiet.
    if (wasCounting && state.over && !state.paused) alertRestOver();
    wasCounting = !state.over;
  }

  const interval = setInterval(tick, 250);
  tick();

  return {
    element,
    update(next) {
      current = next;
      tick();
    },
    destroy() {
      clearInterval(interval);
    },
  };
}
