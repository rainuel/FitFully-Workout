import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RESTORE_MAX_AGE_MS,
  decideBackAction,
  isKeyboardOpen,
  restorableRoute,
  routeToRestore,
} from '../www/js/services/navigation-rules.js';

test('back button: a dialog is closed before anything else', () => {
  assert.equal(decideBackAction({ dialogOpen: true, hasBackLink: true, path: '/program/edit/3' }), 'close-dialog');
});

test('back button: a sub-screen follows its own back link (so unsaved-change prompts run)', () => {
  assert.equal(decideBackAction({ dialogOpen: false, hasBackLink: true, path: '/program/edit/3' }), 'back-link');
});

test('back button: other tabs return to Home, Home goes to the background', () => {
  assert.equal(decideBackAction({ dialogOpen: false, hasBackLink: false, path: '/progress' }), 'go-home');
  assert.equal(decideBackAction({ dialogOpen: false, hasBackLink: false, path: '/home' }), 'minimize');
});

test('restorableRoute keeps browsable screens as they are', () => {
  for (const p of ['/home', '/workout', '/workout/exercise/12', '/progress/history', '/progress/workout/4', '/progress/exercise/9', '/program/day/3', '/program/library', '/profile']) {
    assert.equal(restorableRoute(p), p);
  }
});

test('restorableRoute sends editing screens to their parent list (drafts do not survive a restart)', () => {
  assert.equal(restorableRoute('/program/edit/8'), '/program');
  assert.equal(restorableRoute('/program/day/2/add'), '/program/day/2');
  assert.equal(restorableRoute('/program/day/2/new'), '/program/day/2');
  assert.equal(restorableRoute('/program/library/new'), '/program/library');
  assert.equal(restorableRoute('/program/library/5'), '/program/library');
});

test('restorableRoute rejects unknown or malformed paths', () => {
  assert.equal(restorableRoute('/nope'), null);
  assert.equal(restorableRoute(null), null);
  assert.equal(restorableRoute('/program/day/9'), null);
});

test('routeToRestore honours the age window and bad data', () => {
  const now = 1_000_000_000;
  assert.equal(routeToRestore({ path: '/workout', at: now - 60_000 }, now), '/workout');
  assert.equal(routeToRestore({ path: '/workout', at: now - RESTORE_MAX_AGE_MS - 1 }, now), null);
  assert.equal(routeToRestore({ path: '/workout', at: now + 5000 }, now), null);
  assert.equal(routeToRestore({ path: '/workout' }, now), null);
  assert.equal(routeToRestore(null, now), null);
  assert.equal(routeToRestore('x', now), null);
});

test('isKeyboardOpen needs a large height drop', () => {
  assert.equal(isKeyboardOpen(800, 780), false);
  assert.equal(isKeyboardOpen(800, 480), true);
});
