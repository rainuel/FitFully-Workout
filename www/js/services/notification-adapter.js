// Connects the reminder service to Android through @capacitor/local-notifications.
// This file is the ONLY place that imports that plugin.
//
// Reminders are local: scheduled on the phone, delivered by Android, no network.

import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { REMINDER_CHANNEL, reminderIds } from './notification-rules.js';

function normalizePermission(display) {
  if (display === 'granted') return 'granted';
  if (display === 'denied') return 'denied';
  return 'prompt';
}

async function ensureChannel() {
  try {
    await LocalNotifications.createChannel(REMINDER_CHANNEL);
  } catch (err) {
    // Creating an existing channel is harmless; anything else falls back to the default channel.
    console.warn('Could not create the reminder channel', err);
  }
}

async function cancelReminders() {
  await LocalNotifications.cancel({ notifications: reminderIds().map((id) => ({ id })) });
}

export function createNativeNotifier() {
  const isSupported = Capacitor.isNativePlatform();

  return {
    isSupported,

    async getPermission() {
      return normalizePermission((await LocalNotifications.checkPermissions()).display);
    },

    async requestPermission() {
      return normalizePermission((await LocalNotifications.requestPermissions()).display);
    },

    cancelReminders,

    async replaceReminders(items) {
      await ensureChannel();
      await cancelReminders();
      if (items.length === 0) return;
      await LocalNotifications.schedule({
        notifications: items.map((item) => ({
          id: item.id,
          title: item.title,
          body: item.body,
          channelId: REMINDER_CHANNEL.id,
          // Repeats every week on this weekday (Capacitor: Sunday = 1 ... Saturday = 7).
          schedule: { on: { weekday: item.capacitorWeekday, hour: item.hour, minute: item.minute }, allowWhileIdle: true },
        })),
      });
    },

    async sendTest({ id, title, body }) {
      await ensureChannel();
      await LocalNotifications.schedule({
        notifications: [
          {
            id,
            title,
            body,
            channelId: REMINDER_CHANNEL.id,
            schedule: { at: new Date(Date.now() + 3000), allowWhileIdle: true },
          },
        ],
      });
    },
  };
}
