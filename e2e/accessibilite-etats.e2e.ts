import AxeBuilder from '@axe-core/playwright';
import {expect, Page, test} from '@playwright/test';

// États interactifs : barre d'actions, menus ouverts, lecture de droite à gauche, écran étroit, clavier.
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function open(page: Page, route: string, language = 'fr'): Promise<void> {
  await page.emulateMedia({reducedMotion: 'reduce'});
  await page.addInitScript((lang) => localStorage.setItem('ngt-demo-lang', lang), language);
  await page.goto(`/#/${route}`);
  await page.locator('tr[cdk-row]:not(.spacer-row)').first().waitFor();
}

async function expectNoViolations(page: Page, selector?: string): Promise<void> {
  const builder = new AxeBuilder({page}).withTags(TAGS);
  const {violations} = await (selector ? builder.include(selector) : builder).analyze();
  const summary = violations.map((violation) => `${violation.id} (${violation.impact}) ×${violation.nodes.length} — ${violation.help}\n    ${violation.nodes.slice(0, 3).map((node) => node.target.join(' ')).join('\n    ')}`);
  expect(summary, summary.join('\n')).toEqual([]);
}

test('barre d’actions de sélection', async ({page}) => {
  await open(page, 'avance');
  await page.locator('.selection-cell ng-table-checkbox').nth(0).click();
  await page.locator('.selection-cell ng-table-checkbox').nth(1).click();
  const bar = page.getByRole('toolbar');
  await expect(bar).toBeVisible();
  await expectNoViolations(page);
  // Échap efface la sélection et la barre disparaît.
  await bar.focus();
  await page.keyboard.press('Escape');
  await expect(bar).toBeHidden();
});

test('barre d’actions sur écran étroit', async ({page}) => {
  await page.setViewportSize({width: 390, height: 800});
  await open(page, 'avance');
  await page.locator('.selection-cell ng-table-checkbox').nth(0).click();
  const bar = page.getByRole('toolbar');
  await expect(bar).toBeVisible();
  // La barre ne défile pas horizontalement et reste dans la fenêtre.
  const box = await bar.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  expect(await bar.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  // Les actions à icône restent nommées pour un lecteur d'écran.
  const unnamed = await bar.getByRole('button').evaluateAll((buttons) => buttons.filter((button) => !(button.getAttribute('aria-label') || button.textContent || '').trim()).length);
  expect(unnamed).toBe(0);
  await expectNoViolations(page);
});

test('menu des colonnes ouvert', async ({page}) => {
  await open(page, 'simple');
  await page.getByRole('button', {name: /colonnes/i}).first().click();
  await expect(page.getByRole('menu').or(page.getByRole('dialog')).first()).toBeVisible();
  await expectNoViolations(page);
  await page.keyboard.press('Escape');
});

test('lecture de droite à gauche (arabe)', async ({page}) => {
  await open(page, 'avance', 'ar');
  expect(await page.evaluate(() => document.documentElement.dir)).toBe('rtl');
  await expectNoViolations(page);
});

test('écran étroit', async ({page}) => {
  await page.setViewportSize({width: 390, height: 800});
  await open(page, 'simple');
  await expectNoViolations(page);
});

test('clavier : l’en-tête triable se trie à Entrée et annonce le sens', async ({page}) => {
  await open(page, 'simple');
  const header = page.locator('th[aria-sort]').first();
  await header.locator('.header-button').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('th[aria-sort="ascending"], th[aria-sort="descending"]')).toHaveCount(1);
});
