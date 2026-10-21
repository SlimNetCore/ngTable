import AxeBuilder from '@axe-core/playwright';
import {expect, Page, test} from '@playwright/test';

// Apparence « contrasté » : traits et texte noirs (blancs en sombre), icônes pleines, police de la page.
async function open(page: Page, scheme: 'light' | 'dark', look: 'contrast' | 'default'): Promise<void> {
  await page.emulateMedia({colorScheme: scheme, reducedMotion: 'reduce'});
  await page.addInitScript(
    ([lookValue, themeValue]) => {
      localStorage.setItem('ngt-demo-look', lookValue);
      localStorage.setItem('ngt-demo-theme', themeValue);
      localStorage.setItem('ngt-demo-lang', 'fr');
    },
    [look, scheme],
  );
  await page.goto('/#/avance');
  await page.locator('tr[cdk-row]:not(.spacer-row)').first().waitFor();
}

for (const scheme of ['light', 'dark'] as const) {
  test(`contrasté (${scheme}) : traits et texte ${scheme === 'light' ? 'noirs' : 'blancs'}, icônes pleines`, async ({page}) => {
    await open(page, scheme, 'contrast');
    const expected = scheme === 'light' ? 'rgb(0, 0, 0)' : 'rgb(255, 255, 255)';
    const styles = await page.evaluate(() => {
      const cell = document.querySelector('td.cdk-cell')!;
      const header = document.querySelector('th.cdk-header-cell')!;
      return {
        text: getComputedStyle(cell).color,
        line: getComputedStyle(cell).borderBottomColor,
        headerLine: getComputedStyle(header).borderBottomColor,
        filled: document.querySelectorAll('ng-table-icon svg[fill="currentColor"]').length,
        stroked: document.querySelectorAll('ng-table-icon svg[fill="none"]').length,
        cellFont: getComputedStyle(cell).fontFamily,
        pageFont: getComputedStyle(document.body).fontFamily,
      };
    });
    expect(styles.text).toBe(expected);
    expect(styles.line).toBe(expected);
    expect(styles.headerLine).toBe(expected);
    expect(styles.filled).toBeGreaterThan(5);
    expect(styles.stroked).toBe(0);
    expect(styles.cellFont).toBe(styles.pageFont); // police héritée de la page
  });

  test(`contrasté (${scheme}) : audit axe`, async ({page}) => {
    await open(page, scheme, 'contrast');
    const {violations} = await new AxeBuilder({page}).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    expect(violations.map((violation) => `${violation.id} ×${violation.nodes.length}: ${violation.nodes.slice(0, 3).map((node) => node.target.join(' ')).join(' | ')}`)).toEqual([]);
  });
}

test('défaut : icônes au trait', async ({page}) => {
  await open(page, 'light', 'default');
  const counts = await page.evaluate(() => ({
    filled: document.querySelectorAll('ng-table-icon svg[fill="currentColor"]').length,
    stroked: document.querySelectorAll('ng-table-icon svg[fill="none"]').length,
  }));
  expect(counts.stroked).toBeGreaterThan(5);
  expect(counts.filled).toBe(0);
});
