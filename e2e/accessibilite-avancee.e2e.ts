import AxeBuilder from '@axe-core/playwright';
import {expect, Page, test} from '@playwright/test';

async function open(page: Page, route: string): Promise<void> {
  await page.emulateMedia({reducedMotion: 'reduce'});
  await page.addInitScript(() => localStorage.setItem('ngt-demo-lang', 'fr'));
  await page.goto(`/#/${route}`);
  await page.locator('tr[cdk-row]:not(.spacer-row)').first().waitFor();
}

test.describe('défilement virtuel : aria-rowcount et aria-rowindex', () => {
  test('le total est annoncé et les index suivent le défilement', async ({page}) => {
    await open(page, 'live');
    const table = page.locator('ng-table table').first();
    const count = Number(await table.getAttribute('aria-rowcount'));
    // 100 000 instruments par défaut dans la démo : le lecteur d'écran doit annoncer le total, pas les ~20 lignes rendues.
    expect(count).toBeGreaterThan(1000);

    const indexes = () => page.locator('tr.data-row[aria-rowindex]').evaluateAll((rows) => rows.map((row) => Number(row.getAttribute('aria-rowindex'))));
    const first = await indexes();
    expect(first.length).toBeGreaterThan(5);
    expect(first[0]).toBe(2); // la ligne 1 est l'en-tête
    first.forEach((value, i) => expect(value).toBe(first[0] + i)); // consécutifs

    await table.evaluate((element) => {
      let parent = element.parentElement;
      while (parent && getComputedStyle(parent).overflowY === 'visible') {
        parent = parent.parentElement;
      }
      parent!.scrollTop = 40_000;
    });
    await expect.poll(async () => (await indexes())[0]).toBeGreaterThan(100);
    const scrolled = await indexes();
    scrolled.forEach((value, i) => expect(value).toBe(scrolled[0] + i));
    expect(scrolled.at(-1)!).toBeLessThanOrEqual(count);
  });

  test('sans virtualisation, aucun aria-rowcount', async ({page}) => {
    await open(page, 'simple');
    await expect(page.locator('ng-table table').first()).not.toHaveAttribute('aria-rowcount', /.*/);
  });
});

test.describe('mode contraste élevé (forced-colors)', () => {
  test.beforeEach(async ({page}) => {
    await page.emulateMedia({forcedColors: 'active', reducedMotion: 'reduce'});
  });

  test('la barre d’actions a un cadre et des boutons contourés', async ({page}) => {
    await open(page, 'avance');
    await page.emulateMedia({forcedColors: 'active'});
    await page.locator('.selection-cell ng-table-checkbox').nth(0).click();
    const bar = page.getByRole('toolbar');
    await expect(bar).toBeVisible();
    const styles = await bar.evaluate((element) => {
      const action = element.querySelector('.ngt-action-bar__action')!;
      return {bar: getComputedStyle(element).borderTopWidth, action: getComputedStyle(action).borderTopWidth};
    });
    expect(parseFloat(styles.bar)).toBeGreaterThanOrEqual(2);
    expect(parseFloat(styles.action)).toBeGreaterThanOrEqual(1);
    await page.screenshot({path: 'test-results/contraste-eleve-barre.png'});
  });

  test('le focus clavier reste un contour', async ({page}) => {
    await open(page, 'simple');
    await page.locator('.header-button').first().focus();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Shift+Tab');
    const outline = await page.locator('.header-button').first().evaluate((element) => {
      const style = getComputedStyle(element);
      return {width: parseFloat(style.outlineWidth), style: style.outlineStyle};
    });
    expect(outline.style).not.toBe('none');
    expect(outline.width).toBeGreaterThan(0);
  });

  // Limite : Playwright n'émule que la media query `forced-colors`, pas le recoloriage de Windows (couleurs système
  // imposées par le navigateur). Ces tests vérifient que nos règles `@media (forced-colors: active)` s'appliquent ; le rendu
  // réel se contrôle à la main avec un thème de contraste Windows (Paramètres > Accessibilité > Thèmes de contraste).
});

test('cibles tactiles : au moins 24 × 24 px (WCAG 2.5.8)', async ({page}) => {
  await open(page, 'avance');
  const {violations} = await new AxeBuilder({page}).withRules(['target-size']).analyze();
  expect(violations.map((violation) => `${violation.id} ×${violation.nodes.length}: ${violation.nodes.slice(0, 3).map((node) => node.target.join(' ')).join(' | ')}`)).toEqual([]);
});
