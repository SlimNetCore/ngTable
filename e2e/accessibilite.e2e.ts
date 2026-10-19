import AxeBuilder from '@axe-core/playwright';
import {expect, Page, test} from '@playwright/test';

// Audit axe (WCAG 2.0 / 2.1 / 2.2 niveaux A et AA) de chaque page de la démo, en clair et en sombre.
// axe détecte une partie seulement des défauts : ces tests évitent les régressions, ils ne remplacent pas un test au lecteur d'écran.
const PAGES = ['simple', 'avance', 'expert', 'analyse', 'live'] as const;
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function open(page: Page, route: string, scheme: 'light' | 'dark'): Promise<void> {
  await page.emulateMedia({colorScheme: scheme, reducedMotion: 'reduce'});
  await page.addInitScript(() => localStorage.setItem('ngt-demo-lang', 'fr'));
  await page.goto(`/#/${route}`);
  await page.locator('ng-table').first().waitFor();
  await page.locator('tr[cdk-row]:not(.spacer-row)').first().waitFor();
}

for (const scheme of ['light', 'dark'] as const) {
  for (const route of PAGES) {
    test(`axe : ${route} (${scheme})`, async ({page}) => {
      await open(page, route, scheme);
      const {violations} = await new AxeBuilder({page}).withTags(TAGS).analyze();
      const summary = violations.map((violation) => `${violation.id} (${violation.impact}) ×${violation.nodes.length} — ${violation.help}\n    ${violation.nodes.slice(0, 3).map((node) => node.target.join(' ')).join('\n    ')}`);
      expect(summary, summary.join('\n')).toEqual([]);
    });
  }
}
