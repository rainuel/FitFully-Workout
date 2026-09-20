// Android lifecycle glue: back button, reopening where you left off, keyboard
// handling, and a last-resort error handler. Rules live in navigation-rules.js.

import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { decideBackAction, isKeyboardOpen, routeToRestore } from './navigation-rules.js';

const SAVED_ROUTE_KEY = 'fitfully.lastRoute';

function currentPath() {
  return decodeURI(window.location.hash.replace(/^#/, '')) || '/home';
}

// ---- Back button ----------------------------------------------------------------

export async function installBackButton() {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await App.addListener('backButton', () => {
      const dialog = [...document.querySelectorAll('dialog[open]')].pop();
      const backLink = document.querySelector('.outlet .back-link');
      const action = decideBackAction({ dialogOpen: Boolean(dialog), hasBackLink: Boolean(backLink), path: currentPath() });
      if (action === 'close-dialog') dialog.close('cancel');
      else if (action === 'back-link') backLink.click();
      else if (action === 'go-home') window.location.hash = '#/home';
      else App.minimizeApp();
    });
  } catch (err) {
    console.error('Back button handler failed to install', err);
  }
}

// ---- Reopen where you left off --------------------------------------------------

function saveRoute() {
  try {
    localStorage.setItem(SAVED_ROUTE_KEY, JSON.stringify({ path: currentPath(), at: Date.now() }));
  } catch {
    // storage unavailable: the app simply opens on Home next time
  }
}

/** The screen to open on a cold start, or null. Call before the router starts. */
export function readRouteToRestore() {
  try {
    const saved = JSON.parse(localStorage.getItem(SAVED_ROUTE_KEY) ?? 'null');
    return routeToRestore(saved, Date.now());
  } catch {
    return null;
  }
}

export function installRoutePersistence() {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') saveRoute();
  });
  window.addEventListener('pagehide', saveRoute);
}

// ---- Keyboard -------------------------------------------------------------------

/**
 * While the keyboard is up, hide the bottom navigation so the field being
 * edited has room, and keep the focused field in view.
 */
export function installKeyboardHandling() {
  const root = document.documentElement;
  let baseline = window.innerHeight;
  let width = window.innerWidth;

  window.addEventListener('resize', () => {
    if (window.innerWidth !== width) {
      // rotation: measure again
      width = window.innerWidth;
      baseline = window.innerHeight;
    } else {
      baseline = Math.max(baseline, window.innerHeight);
    }
    root.classList.toggle('kb-open', isKeyboardOpen(baseline, window.innerHeight));
  });

  document.addEventListener('focusin', (event) => {
    const el = event.target;
    if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement)) return;
    if (el.readOnly) return;
    setTimeout(() => el.scrollIntoView({ block: 'center' }), 300); // after the keyboard has animated in
  });
}

// ---- Errors ---------------------------------------------------------------------

/** Anything that slips past a screen's own handling becomes a short message, never a blank app. */
export function installErrorHandlers(notify) {
  let lastShown = 0;
  const report = (err) => {
    const text = String(err?.message ?? err ?? '');
    if (text.includes('ResizeObserver')) return; // harmless browser noise
    console.error('Unhandled error', err);
    const now = Date.now();
    if (now - lastShown < 4000) return;
    lastShown = now;
    notify('Something went wrong. Your saved data is safe. Try again.');
  };
  window.addEventListener('error', (event) => report(event.error ?? event.message));
  window.addEventListener('unhandledrejection', (event) => report(event.reason));
}
