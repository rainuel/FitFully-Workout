// Gets text files off and onto the phone. This file is the ONLY place that
// imports @capacitor/filesystem and @capacitor/share.
//
//  - shareTextFile: on Android, writes the file to the app's cache folder and
//    opens the Android share sheet (Files, Drive, email, Bluetooth, ...), so the
//    user chooses where the copy goes. In a desktop browser it downloads the file.
//  - pickTextFile: opens the system file picker and reads the chosen file as text.
//
// Nothing here uses the network.

import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

function isCancel(err) {
  return /cancel/i.test(String(err?.message ?? err));
}

function downloadInBrowser({ filename, text, mimeType }) {
  const url = URL.createObjectURL(new Blob([text], { type: `${mimeType};charset=utf-8` }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * Saves or shares a text file. Returns { ok: true } or { ok: false, cancelled: true }
 * if the user closed the share sheet. Other failures throw.
 */
export async function shareTextFile({ filename, text, mimeType, title }) {
  if (!Capacitor.isNativePlatform()) {
    downloadInBrowser({ filename, text, mimeType });
    return { ok: true };
  }

  const written = await Filesystem.writeFile({
    path: filename,
    data: text,
    directory: Directory.Cache,
    encoding: Encoding.UTF8,
  });

  try {
    await Share.share({ title, dialogTitle: title, files: [written.uri] });
    return { ok: true };
  } catch (err) {
    if (isCancel(err)) return { ok: false, cancelled: true };
    throw err;
  }
}

/**
 * Opens the file picker. Resolves { name, text } for the chosen file, or null
 * if the user backed out. Rejects with an Error whose message is safe to show
 * if the file is bigger than `maxBytes`.
 */
export function pickTextFile({ accept, maxBytes }) {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.hidden = true;

    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      input.remove();
      if (!file) return resolve(null);
      if (file.size > maxBytes) return reject(new Error('That file is too large to be a Fit Fully backup.'));
      try {
        resolve({ name: file.name, text: await file.text() });
      } catch (err) {
        reject(err);
      }
    });
    input.addEventListener('cancel', () => {
      input.remove();
      resolve(null);
    });

    document.body.append(input);
    input.click();
  });
}
