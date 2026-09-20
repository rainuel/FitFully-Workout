# Fit Fully

**Fit Fully** is an offline-first workout tracker for Android built with vanilla HTML, CSS, and JavaScript.

It is designed to help you follow a structured workout program, track your exercises and progress, monitor personal records, and keep your fitness data stored locally on your device.

> Be faithful to the routine. Be faithful to the goal. Become.

## Features

* Workout program scheduling
* Exercise and set tracking
* Workout history
* Personal records
* Weight progression tracking
* Bodyweight tracking
* BMI calculation
* Workout streaks
* Achievements
* Local workout reminders
* JSON backup and restore
* CSV workout history export
* Offline-first local storage
* Android app support
* Browser development mode

## Tech Stack

* HTML
* CSS
* Vanilla JavaScript
* Vite
* Capacitor
* SQLite
* `@capacitor-community/sqlite`
* `sql.js` for browser development

No frontend framework is used.

## Requirements

* Node.js 22.13 or newer
* npm
* Java/JDK compatible with the Android build
* Android SDK for building the Android application

Android Studio is **not required** if you already have the Android SDK, JDK, and Android command-line tools installed.

## Installation

Clone the repository:

```bash
git clone https://github.com/rainuel/FitFully-Workout.git
cd FitFully-Workout
```

Install dependencies:

```bash
npm install
```

## Run in the Browser

Start the Vite development server:

```bash
npm run dev
```

Open the address shown in the terminal, usually:

```text
http://localhost:5173
```

The browser version uses `sql.js` with IndexedDB persistence.

Some native Android functionality, such as local notifications and the Android share sheet, is only available in the Android application.

## Build the Web App

```bash
npm run build
```

The generated web files are placed in:

```text
dist/
```

The `dist/` directory is generated automatically and should not be committed to Git.

## Sync Android

After making changes to the web application:

```bash
npm run build
npx cap sync android
```

Or use:

```bash
npm run sync
```

## Build an Android APK

From the project root:

```bash
npm install
npm run build
npx cap sync android
cd android
```

On Windows:

```powershell
.\gradlew assembleDebug
```

The debug APK will be generated at:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

### Clean Android Build

If you run into Android build issues:

```powershell
cd android
.\gradlew clean
.\gradlew assembleDebug
```

## Testing

Run the automated tests with:

```bash
npm test
```

## Project Structure

```text
FitFully-Workout/
├── android/                # Capacitor Android project
├── tests/                  # Automated tests
├── www/                    # Application source
├── capacitor.config.json   # Capacitor configuration
├── package.json
├── package-lock.json
├── vite.config.js
└── README.md
```

## Local Data

Fit Fully is designed as an offline-first application.

On Android, workout data is stored locally using SQLite.

In browser development mode, the app uses `sql.js` and persists the database using IndexedDB.

Browser data and Android data are separate.

## Backup and Restore

Fit Fully supports exporting application data as a JSON backup.

Workout history can also be exported as CSV for use with applications such as Microsoft Excel or Google Sheets.

## Privacy

Fit Fully does not require an account or remote backend for normal operation.

Workout and profile data are stored locally on the user's device unless the user explicitly exports or shares that data.

## Development Scripts

### Start Development Server

```bash
npm run dev
```

Starts the Vite development server.

### Build

```bash
npm run build
```

Creates a production web build.

### Test

```bash
npm test
```

Runs the automated tests.

### Sync Android

```bash
npm run sync
```

Builds the web application and synchronizes it with the Android project.

### Run Android

```bash
npm run android
```

Builds, synchronizes, and runs the Android project through Capacitor.

## Current Version

**1.0.0**

## License

No license has been specified yet.
