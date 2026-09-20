// Injected by Vite from package.json (see vite.config.js). Falls back to 'dev'
// where the build step hasn't run, such as unit tests.
export const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';
