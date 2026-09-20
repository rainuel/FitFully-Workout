import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

// Vite is used only as a bundler so Capacitor plugins (npm packages) can be
// imported as ES modules. No framework, no runtime code is added.
export default defineConfig({
  root: 'www',
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  base: './', // relative asset URLs: required inside the Capacitor WebView
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
  },
});
