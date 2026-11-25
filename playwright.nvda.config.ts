import {withGuidepup} from '@guidepup/playwright';

// Essais avec un vrai lecteur d'écran (NVDA, piloté par Guidepup). Hors intégration continue : il faut Windows, la
// copie de NVDA installée par `npx @guidepup/setup install nvda`, et la fenêtre du navigateur au premier plan.
// Lancer : `npm run build:demo` puis `npm run e2e:nvda`.
export default withGuidepup({
  testDir: 'e2e-nvda',
  testMatch: '**/*.nvda.ts',
  timeout: 3 * 60 * 1000,
  retries: 0,
  reporter: 'list',
  use: {baseURL: 'http://localhost:4500'},
  projects: [{name: 'chromium', use: {browserName: 'chromium'}}],
  webServer: {
    command: 'node scripts/serve-docs.mjs 4500 dist/demo/browser',
    url: 'http://localhost:4500',
    reuseExistingServer: true,
  },
});
