import { h, pluralize } from '../utils/dom.js';
import { formatDateTime, formatFullDate } from '../utils/dates.js';
import {
  MAX_BACKUP_BYTES,
  createBackup,
  createWorkoutCsv,
  inspectBackup,
  loadBackupStatus,
  recordBackupExport,
  restoreBackup,
} from '../services/backup-service.js';
import { pickTextFile, shareTextFile } from '../services/file-adapter.js';
import { confirmDialog } from './modal.js';
import { showToast } from './toast.js';

const PICKER_ACCEPT = '.json,application/json,text/plain,application/octet-stream';

function restoreQuestion(summary, exportedAt) {
  const parts = [pluralize(summary.workouts, 'workout')];
  if (summary.bodyweightEntries > 0) parts.push(pluralize(summary.bodyweightEntries, 'bodyweight entry', 'bodyweight entries'));
  const when = exportedAt ? ` saved ${formatDateTime(exportedAt)}` : '';
  const range = summary.firstWorkout && summary.lastWorkout ? ` (${formatFullDate(summary.firstWorkout)} to ${formatFullDate(summary.lastWorkout)})` : '';
  return `This backup${when} has ${parts.join(' and ')}${range}. Restoring replaces everything now in Fit Fully on this phone, including any workout in progress. This can’t be undone.`;
}

/** Profile panel: export a JSON backup or workout CSV, and restore from a JSON backup. */
export async function backupPanel(db) {
  const status = h('p', { class: 'status-line', role: 'status', 'aria-live': 'polite' });
  const lastLine = h('p', { class: 'muted small' });
  let busy = false;

  const buttons = [];
  function setBusy(value) {
    busy = value;
    buttons.forEach((b) => (b.disabled = value));
  }

  // Runs one action at a time, with the buttons disabled while it works.
  async function locked(action) {
    if (busy) return;
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  }

  function makeButton(className, label, onClick) {
    const button = h('button', { class: `btn ${className} btn--block`, type: 'button' }, label);
    button.addEventListener('click', onClick);
    buttons.push(button);
    return button;
  }

  async function showLastBackup() {
    const { lastBackupAt } = await loadBackupStatus(db);
    lastLine.textContent = lastBackupAt ? `Last backup exported ${formatDateTime(lastBackupAt)}.` : 'You haven’t exported a backup yet.';
  }

  async function exportBackup() {
    status.textContent = '';
    try {
      const backup = await createBackup(db);
      const shared = await shareTextFile({ filename: backup.filename, text: backup.text, mimeType: 'application/json', title: 'Fit Fully backup' });
      if (!shared.ok) return;
      await recordBackupExport(db);
      status.textContent = `Backup ready: ${backup.filename} (${pluralize(backup.summary.workouts, 'workout')}). Keep it somewhere safe, like Drive or your computer.`;
      await showLastBackup();
    } catch (err) {
      console.error('Backup export failed', err);
      status.textContent = 'Couldn’t create the backup. Nothing was changed. Try again.';
    }
  }

  async function exportCsv() {
    status.textContent = '';
    try {
      const csv = await createWorkoutCsv(db);
      if (csv.rowCount === 0) {
        status.textContent = 'No finished workouts to export yet.';
        return;
      }
      const shared = await shareTextFile({ filename: csv.filename, text: csv.text, mimeType: 'text/csv', title: 'Fit Fully workout history' });
      if (shared.ok) status.textContent = `Workout history ready: ${csv.filename} (${pluralize(csv.rowCount, 'set')}).`;
    } catch (err) {
      console.error('CSV export failed', err);
      status.textContent = 'Couldn’t create the CSV file. Try again.';
    }
  }

  async function restore() {
    if (busy) return;
    status.textContent = '';
    // The picker is not locked: some older WebViews never report a cancelled pick.
    let file;
    try {
      file = await pickTextFile({ accept: PICKER_ACCEPT, maxBytes: MAX_BACKUP_BYTES });
    } catch (err) {
      status.textContent = err?.message ?? 'Couldn’t read that file.';
      return;
    }
    if (!file) return;

    await locked(async () => {
      const checked = inspectBackup(file.text);
      if (!checked.ok) {
        status.textContent = checked.errors[0];
        return;
      }

      const confirmed = await confirmDialog({
        title: 'Replace your data with this backup?',
        body: restoreQuestion(checked.backup.summary, checked.backup.exportedAt),
        confirmLabel: 'Replace my data',
        danger: true,
      });
      if (!confirmed) return;

      const result = await restoreBackup(db, checked.backup);
      if (!result.ok) {
        status.textContent = result.errors[0];
        return;
      }
      showToast('Backup restored');
      window.location.hash = '#/home';
    });
  }

  await showLastBackup();

  return h(
    'section',
    { class: 'panel panel--form', 'aria-labelledby': 'backup-heading' },
    h('h2', { class: 'section-title', id: 'backup-heading' }, 'Backup & restore'),
    h('p', { class: 'muted small' }, 'Your workouts live only on this phone. A backup file lets you keep a safe copy or move to a new phone. You choose where the file goes; nothing is uploaded.'),
    lastLine,
    makeButton('btn--primary', 'Export backup (JSON)', () => locked(exportBackup)),
    makeButton('btn--secondary', 'Export workout history (CSV)', () => locked(exportCsv)),
    makeButton('btn--secondary', 'Restore from backup', restore),
    h('p', { class: 'field__hint' }, 'The CSV opens in Excel or Google Sheets. Only the JSON backup can be restored.'),
    status,
  );
}
