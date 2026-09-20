# Fit Fully

An offline Android workout tracker. Be faithful to the routine. Be faithful to the goal. Become.

Plain HTML, CSS, and JavaScript, bundled with Vite, wrapped by Capacitor, with a local SQLite database. No framework, no account, no backend, no network requests. Android uses Capacitor SQLite; desktop-browser development uses sql.js persisted to IndexedDB.

**Build status: Phase 8 of 8 (Polish). Feature complete.** Android back button, reopening where you left off, keyboard handling, error handling, accessibility, empty states, and release-build setup are in.

## What you need

| Tool | Version |
|---|---|
| Node.js | 22.13 or newer (Capacitor 8's CLI needs 22+; `npm test` needs 22.13+) |
| Android Studio | 2025.2.1 or newer (Capacitor 8 requirement). Its bundled JDK is what Gradle uses. |
| Android SDK | Platform API 36 (SDK Manager → SDK Platforms). Minimum supported device: Android 7.0 (API 24). |
| A device or emulator | Phone with USB debugging on, or an AVD created in Android Studio |

Pinned versions: Capacitor 8.5.2, `@capacitor-community/sqlite` 8.1.1, Vite 8.3.0. Phase 7 adds `@capacitor/local-notifications`, `@capacitor/filesystem`, and `@capacitor/share`. Phase 8 adds `@capacitor/app` (back button). All `^8.0.0`.

## First-time setup

```bash
npm install
npm run build
npx cap add android      # creates the android/ project (run once)
npx cap sync android
npx cap run android      # choose your device or emulator
```

Every time after that, one command rebuilds, syncs, and runs:

```bash
npm run android
```

To work in Android Studio instead (Run button, Logcat, emulator manager):

```bash
npm run studio
```

Commit the generated `android/` folder to git. Its own `.gitignore` already excludes build output.

**Phase 7 upgrade (existing `android/` folder):** run `npm install`, then `npm run android`. The sync step picks up the three new plugins. Then open `android/app/src/main/AndroidManifest.xml` and make sure these lines are inside `<manifest>` (harmless if a plugin already declares them):

```xml
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
<uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />
```

`POST_NOTIFICATIONS` is the Android 13+ permission the app asks for when you turn reminders on. `RECEIVE_BOOT_COMPLETED` lets reminders survive a phone restart.

**Phase 8 upgrade (existing `android/` folder):** run `npm install` (installs `@capacitor/app`), then `npm run android`. The `android/` files changed by hand in Phase 8 are `AndroidManifest.xml` (`windowSoftInputMode`), `app/build.gradle` (release signing, version 1.0.0), and `.gitignore` (keystore files). If you regenerate `android/`, re-apply them.

## Build an APK

```bash
npm install
npm run build
npx cap sync android
cd android
```

**Debug APK** (installable straight away, signed with the debug key):

```bash
./gradlew assembleDebug        # Windows: gradlew assembleDebug
```

Output: `android/app/build/outputs/apk/debug/app-debug.apk`

**Release APK** (signed with your own key):

1. Create a key once (keep the file and passwords safe; you need the same key for every update):
   ```bash
   keytool -genkey -v -keystore fitfully-release.jks -alias fitfully -keyalg RSA -keysize 2048 -validity 10000
   ```
   Put `fitfully-release.jks` inside `android/`.
2. Create `android/keystore.properties` (git-ignored):
   ```properties
   storeFile=fitfully-release.jks
   storePassword=YOUR_STORE_PASSWORD
   keyAlias=fitfully
   keyPassword=YOUR_KEY_PASSWORD
   ```
3. Build:
   ```bash
   ./gradlew assembleRelease    # Windows: gradlew assembleRelease
   ```
   Output: `android/app/build/outputs/apk/release/app-release.apk`. Without `keystore.properties` the output is `app-release-unsigned.apk`, which Android will not install.

Install on a connected phone: `adb install -r android/app/build/outputs/apk/release/app-release.apk`

**Version numbers:** raise `version` in `package.json` (shown on Profile → About) and `versionName` / `versionCode` in `android/app/build.gradle` together. `versionCode` must go up by 1 for every update you install over an older build.

## Run in a desktop browser

For UI and app-flow development, you do not need an emulator:

```bash
npm install
npm run dev
```

Open the Vite URL (normally `http://localhost:5173/`). The browser build uses the same SQLite schema, migrations, seed data, and screens as Android, but runs SQLite through sql.js and persists the database file in IndexedDB.

The Android build still uses `@capacitor-community/sqlite` and native SQLite. Browser data and Android data are separate. In a desktop browser, reminders are unavailable (the panel says so), and the export buttons download files instead of opening the Android share sheet.

## Verify Phase 1 on the device

1. **Launches.** The app opens on Home with no error screen.
2. **Navigation.** Tap Home, Workout, Progress, Program, Profile. Each opens its own screen and the active tab is highlighted.
3. **SQLite opens.** Profile → Foundation check shows `Database schema v1`.
4. **Default week is seeded.** Program lists Monday Push, Tuesday Pull, Wednesday Legs, Thursday Rest, Friday Upper, Saturday Lower, Sunday Rest. Home shows today's day, and Thursday and Sunday show "Rest day".
5. **Data survives closing.** Note **App launches** on Profile. Swipe the app away from recent apps (or Settings → Apps → Fit Fully → Force stop) and open it again. Launches goes up by exactly 1. First launch, exercise count, and program days stay the same.
6. **Foreign keys.** Profile shows `Foreign keys On`. This confirms cascade and set-null rules are active on your device, which later phases rely on.

## Verify Phase 5 on the device

1. **Home.** Below today's card there is a streak card ("No streak yet" before your first workout) and a **This week** strip. Each day has a mark: filled check = done, ring = not done, dashed ring = still to come, dash = rest. A line under the strip reads like "4 / 5 scheduled workouts".
2. **Finish a workout** (Workout tab). The done card shows "You showed up today. Another workout in the books.", your streak, and a link to that workout in history. The first time, a toast says **Achievement unlocked: First Workout**.
3. **Progress → Recent workouts.** The workout is listed. Tap it: every logged set is there, warm-ups in blue and apart from working sets. If you finished early, the exercises you skipped read "Not done" and a gentle note says it still counted.
4. **Progress → Exercises & records.** Tap an exercise: current program weight, heaviest set, estimated 1-rep max, best reps at each weight, a weight-over-time chart, and the sets from each workout. The chart appears from the second workout.
5. **Personal record.** Log a heavier top weight than ever before for an exercise: that exercise shows **New PR** in that workout's history.
6. **History never changes with the program.** Commit a new working weight or edit the plan, then reopen an old workout: its sets and target weight are exactly as they were.
7. **Streak rules.** A rest day never breaks the streak. Skip a scheduled workout: the next morning that day shows a ring, the streak restarts, and the streak card says "Life happens" instead of blaming you. Tuesday stays Pull.
8. **Achievements.** Progress → Achievements lists all eight, with "3 / 10"-style progress on the ones still locked.
9. **History screen.** Progress → Recent workouts → **View all** lists every workout by month; **Show more** loads older ones.

## Verify Phase 6 on the device

1. **Profile layout.** Profile shows Bodyweight, Height, BMI, Units & progression, then the Foundation check.
2. **Log bodyweight.** Set a weight and tap **Log bodyweight**. A toast confirms, and Latest, Since first entry, and Entries appear. The chart shows from the second entry. Change the date to an earlier day to backfill. Future dates are refused.
3. **One entry per day.** Log twice for the same date: the entry is replaced, not duplicated.
4. **Delete.** Tap the × on an entry, confirm, and it disappears and the chart updates. With more than 10 entries, **Show all** lists the rest.
5. **Height and BMI.** Save a height (cm, or switch to ft / in). BMI appears with a plain-language note and the screening disclaimer. Below the standard range shows a gentle weight-gain suggestion; above shows a gentle fat-loss suggestion. Without a height or a bodyweight it asks for the missing one.
6. **Weight unit.** Switch lbs / kg. Bodyweight entries, the chart, and BMI all show in the new unit. The increment resets to 5 lbs or 2.5 kg. Exercises already in your program and past workouts keep their own unit.
7. **Progress → Bodyweight.** The same stats and chart appear on Progress, with a **Log weight** link to Profile.
8. **Nothing else changes.** Program weights and workout history are identical before and after logging bodyweight or changing height.
9. **Survives closing.** Force stop the app and reopen: height, unit, and bodyweight entries are all still there.
10. **Progress links.** Progress → Recent workouts → a workout, an exercise, and **View all** all open (their routes were missing in the previous build and are now registered).

## Verify Phase 7 on the device

1. **Reminders panel.** Profile → Reminders shows a **Workout reminders** switch, a time field, and **Send a test notification**.
2. **Permission.** Turn the switch on. On Android 13+ the system asks to allow notifications; allow it. The panel then reads like "You'll be reminded Mon, Tue, Wed, Fri, Sat at 7:00 AM. Rest days stay quiet."
3. **Test notification.** Tap **Send a test notification**. Within a few seconds a Fit Fully notification appears.
4. **Refused permission.** Deny the prompt: the switch stays off and a toast explains where to allow it. If you block notifications later in Android settings while reminders are on, the panel shows "reminders are paused" with an **Allow notifications** button.
5. **Time.** Change the time to a couple of minutes from now, on a training day, and close the app. At that time: "It's Monday. Push day 💪" (your day's name).
6. **Follows the program.** Program → a day → make it a rest day (or rename it). Reminders for that day stop, or use the new name, without touching Profile. Thursday and Sunday have none by default.
7. **Survives restart.** Restart the phone. Reminders still arrive.
8. **Export backup.** Profile → Backup & restore → **Export backup (JSON)**. The Android share sheet opens with `fitfully-backup-YYYY-MM-DD.json`. Save it to Drive or Files, or send it to yourself. "Last backup exported" updates.
9. **Export CSV.** **Export workout history (CSV)** shares `fitfully-workouts-YYYY-MM-DD.csv` (one line per completed set, warm-ups labelled). It opens in Excel or Google Sheets. With no finished workouts it says so.
10. **Restore.** Use **Restore from backup** and choose the JSON file. A confirmation shows how many workouts and bodyweight entries it holds. **Replace my data** swaps everything on the phone for the backup and returns to Home. Try it on a second phone or after clearing the app's data to check the move-to-a-new-phone case.
11. **Bad files are refused.** Choose a CSV, a photo, or any other file: an inline message says it isn't a Fit Fully backup and nothing changes.
12. **History is intact.** After a restore, Progress shows the same workouts, records, streak, and bodyweight chart as before. Reminders are rescheduled; on a new phone you may need to allow notifications again.

## Verify Phase 8 on the device

1. **Back button.** On Program → a day → an exercise, press Android back: you go up one level each time. From Progress, Program, Profile, or Workout, back goes to Home. From Home, back sends the app to the background (it does not quit).
2. **Back closes dialogs.** Tap Finish workout, then press back: the dialog closes and nothing is finished.
3. **Back with unsaved edits.** Change a value on an exercise's edit screen, press back: "Discard changes?" appears. Back again closes it; the edits stay.
4. **Reopen where you left off.** Open an exercise mid-workout, swipe the app away, reopen within 3 hours: you land on that exercise with your sets intact. After 3 hours, or after leaving on an edit form, it opens on Home or the parent list.
5. **Keyboard.** Tap a weight or rep field: the bottom navigation hides, the field scrolls into view and its value is selected. Close the keyboard: the navigation returns.
6. **Screen reader.** With TalkBack on, each screen change announces the new screen title. Every stepper, tick, and remove button has a spoken label.
7. **Empty states.** On a fresh install, Progress, History, and an exercise's history each show a short explanation and a link to the Workout tab.
8. **Errors.** A screen that fails to load shows the reason and a **Try again** button. Any unexpected error shows a short toast instead of freezing the app.
9. **Profile.** The Foundation check is gone. About shows the version.
10. **Battery.** Start a rest timer, lock the phone, unlock: the timer shows the correct remaining time.

## Tests

```bash
npm test
```

Runs 206 tests on your computer with no phone needed: migrations, seed, foreign-key and cascade behaviour, program editing, workout logging, progression, and (Phase 5) streaks, the schedule log, personal records, exercise history, chart axes, achievements, (Phase 6) BMI, height and bodyweight rules, unit changes, and the bodyweight records, and (Phase 7) reminder scheduling rules, permission handling, backup round-trips, restore validation and rollback, and CSV export, and (Phase 8) back-button, screen-restore, and keyboard rules. They use Node's built-in SQLite through the same database adapter the app uses.

## Debugging on a device

- **See JavaScript errors and console output:** with the phone connected, open `chrome://inspect` in desktop Chrome and inspect the Fit Fully WebView.
- **If the app shows "couldn't open its database":** the grey box under the message has the underlying error. Send it along.
- **Gradle error `x files found with path 'build-data.properties'`:** in `android/app/build.gradle`, inside the `android { }` block, add:
  ```gradle
  packagingOptions {
      exclude 'build-data.properties'
  }
  ```

The browser build is intended for development and UI testing. Android continues to use the native SQLite plugin.

## Project layout

```text
www/
  index.html
  css/            app.css (tokens, shell)  components.css  screens.css
  js/
    app.js                 boot: open DB, migrate, seed, mount shell
    router.js              hash router
    db/
      adapter.js           one DB API + serialised queue + transactions
      database.js          the only file that imports the SQLite plugin
      migrations.js        versioned schema (v1 = full schema)
      seed.js              default week, settings, exercise library
      exercise-library.js  44 built-in exercises
    models/                SQL only (settings, program, workout, progression, history, consistency, profile, backup)
    services/              business logic; *-rules.js files are pure (streak, history, achievement, profile, notification, backup)
                           notification-adapter.js and file-adapter.js are the only files that import the Phase 7 plugins
    screens/               home, workout, progress (+ history, workout-detail, exercise-history), program, profile
    components/            bottom-nav, plate, week-strip, streak-card, line-chart, session-list, reminders-panel, backup-panel, icons, ...
    utils/                 dates.js (local dates, ISO weekdays), dom.js, app-info.js (version)
    services/lifecycle-service.js   back button, reopen-last-screen, keyboard, global error handler (navigation-rules.js has the pure logic)
tests/                     node --test suites + Node SQLite helper
capacitor.config.json
vite.config.js
```

## Rules the code follows

- Program tables are the **plan**. Workout tables are **what happened** and never depend on the plan.
- Dates are local `YYYY-MM-DD` strings. Weekdays are ISO (1 = Monday ... 7 = Sunday).
- All SQL is parameterized. Schema changes are new migrations; shipped migrations are never edited.
- A new table or column must also be added to `BACKUP_TABLES` in `backup-rules.js`; a test fails until it is.
- Restore replaces data in one transaction, all or nothing. Reminders are rescheduled from settings and the program, never stored twice.
- Inside `db.transaction(async (tx) => ...)`, use only `tx`, never `db`.
#   F i t F u l l y - W o r k o u t  
 