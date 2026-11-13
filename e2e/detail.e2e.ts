import AxeBuilder from '@axe-core/playwright';
import {expect, Page, test} from '@playwright/test';

// Master / detail : le bouton déplier / replier est natif dès qu'un détail est fourni (page Avancé de la démo).
async function open(page: Page): Promise<void> {
  await page.emulateMedia({reducedMotion: 'reduce'});
  await page.addInitScript(() => localStorage.setItem('ngt-demo-lang', 'fr'));
  await page.goto('/#/avance');
  await page.locator('tr.data-row').first().waitFor();
}

const dataRows = (page: Page) => page.locator('tr.data-row:not([data-ngt-pin])');

test('un chevron par ligne déplie puis replie le détail', async ({page}) => {
  await open(page);
  const row = dataRows(page).nth(1);
  const toggle = row.locator('button.ngt-detail-toggle');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(toggle).toHaveAccessibleName('Afficher le détail');

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(toggle).toHaveAccessibleName('Masquer le détail');
  await expect(row).toHaveClass(/row-expanded/);
  const detail = page.locator('tr.detail-row-container:not(.detail-row-collapsed)');
  await expect(detail).toHaveCount(1);
  await expect(detail).toBeVisible();

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('tr.detail-row-container:not(.detail-row-collapsed)')).toHaveCount(0);
});

test('au clavier : Entrée puis Espace sur le chevron, une seule bascule à chaque fois', async ({page}) => {
  await open(page);
  const toggle = dataRows(page).nth(2).locator('button.ngt-detail-toggle');
  await toggle.focus();
  await page.keyboard.press('Enter');
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Space');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
});

test('le bouton fait 24 px au moins et la colonne ne décale pas les autres en-têtes', async ({page}) => {
  await open(page);
  const box = (await dataRows(page).first().locator('button.ngt-detail-toggle').boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(24);
  expect(box.height).toBeGreaterThanOrEqual(24);
  // La cellule d'en-tête de la colonne du bouton est alignée sur ses cellules de données.
  const header = (await page.locator('th.detail-toggle-cell').boundingBox())!;
  const cell = (await dataRows(page).first().locator('td.detail-toggle-cell').boundingBox())!;
  expect(Math.abs(header.x - cell.x)).toBeLessThan(1);
  expect(Math.abs(header.width - cell.width)).toBeLessThan(1);
});

test('audit axe avec un détail déplié', async ({page}) => {
  await open(page);
  await dataRows(page).nth(1).locator('button.ngt-detail-toggle').click();
  const {violations} = await new AxeBuilder({page}).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(violations.map((violation) => `${violation.id} ×${violation.nodes.length}: ${violation.nodes.slice(0, 3).map((node) => node.target.join(' ')).join(' | ')}`)).toEqual([]);
  await page.locator('ng-table').first().screenshot({path: 'test-results/detail-deplie.png'});
});

test('en arabe (droite à gauche), le chevron existe et se déplie', async ({page}) => {
  await page.addInitScript(() => localStorage.setItem('ngt-demo-lang', 'ar'));
  await page.goto('/#/avance');
  const toggle = dataRows(page).nth(1).locator('button.ngt-detail-toggle');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
});
