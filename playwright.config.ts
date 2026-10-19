import {defineConfig} from '@playwright/test';

// Tests de bout en bout dans un vrai navigateur, contre la démo compilée (`npm run build:demo`).
// Lancer : `npm run e2e` (compile la démo puis exécute les tests).
export default defineConfig({
  testDir: 'e2e',
  testMatch: '**/*.e2e.ts',
  timeout: 60_000,
  fullyParallel: true,
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? [['github'], ['html', {open: 'never'}]] : 'list',
  use: {baseURL: 'http://localhost:4500', trace: 'retain-on-failure'},
  projects: [{name: 'chromium', use: {browserName: 'chromium'}}],
  webServer: {
    command: 'node scripts/serve-docs.mjs 4500 dist/demo/browser',
    url: 'http://localhost:4500',
    reuseExistingServer: !process.env['CI'],
  },
});
