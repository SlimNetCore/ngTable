import {expect, Page, test} from '@playwright/test';

// Daltonisme (WCAG 1.4.1) : aucune information ne doit passer par la couleur seule.
// Chromium sait simuler les déficiences de la vision (Emulation.setEmulatedVisionDeficiency) : les captures du test
// « simulations » sont gardées dans test-results/ pour un contrôle à l'œil ; les assertions portent sur le DOM.
async function open(page: Page, route: string, theme: 'light' | 'dark' = 'light'): Promise<void> {
  await page.addInitScript((value) => {
    localStorage.setItem('ngt-demo-lang', 'fr');
    localStorage.setItem('ngt-demo-theme', value);
  }, theme);
  await page.goto(`/#/${route}`);
  await page.locator('tr[cdk-row]:not(.spacer-row)').first().waitFor();
}

test('mises à jour en direct : un repère de forme accompagne la couleur de la surbrillance', async ({page}) => {
  await open(page, 'live');
  // Surbrillance : fond coloré (vert, rouge, bleu) ET repère ▲ ▼ ◆ en image de fond, tant que dure l'animation.
  const glyph = await page.waitForFunction(() => {
    const cell = document.querySelector('td[data-ngt-flash]');
    if (!cell) {
      return null;
    }
    const style = getComputedStyle(cell);
    return {kind: cell.getAttribute('data-ngt-flash'), image: style.backgroundImage, color: style.backgroundColor};
  }, undefined, {timeout: 20_000, polling: 50});
  const value = (await glyph.jsonValue()) as {kind: string; image: string; color: string};
  expect(value.kind).toMatch(/^(up|down|change)-/);
  expect(value.image).toContain('svg+xml');
});

test('mises à jour en direct : le repère garde sa taille quand on survole la ligne', async ({page}) => {
  await open(page, 'live');
  // La règle de survol des lignes ne doit pas réinitialiser taille, position et répétition du repère (régression : grandes flèches répétées).
  const row = page.locator('tr.data-row').nth(3);
  await row.hover({position: {x: 20, y: 10}});
  // On déclenche la surbrillance à la main sur une cellule de la ligne survolée (les vraies mises à jour tombent au hasard).
  const value = await row.evaluate((tr) => {
    const cell = tr.querySelector('td.cdk-cell:not(.selection-cell)') as HTMLElement;
    cell.setAttribute('data-ngt-flash', 'up-0');
    const style = getComputedStyle(cell);
    return {hovered: tr.matches(':hover'), size: style.backgroundSize, repeat: style.backgroundRepeat, image: style.backgroundImage};
  });
  expect(value.hovered).toBe(true);
  expect(value.image).toContain('svg+xml');
  expect(value.size).toBe('11px 11px');
  expect(value.repeat).toBe('no-repeat');
});

test('graphiques : chaque série de la page Analyse a sa marque dans la légende', async ({page}) => {
  await open(page, 'analyse');
  const charts = page.locator('ng-table-chart');
  await expect(charts.first()).toBeVisible();
  const swatches = await page.locator('.ngt-chart__legend-item svg').count();
  expect(swatches).toBeGreaterThan(0);
  // Pas de pastille de couleur seule : chaque légende contient un svg (forme, tireté ou hachures).
  const bare = await page.locator('.ngt-chart__legend-item:not(:has(svg))').count();
  expect(bare).toBe(0);
});

for (const [deficiency, label] of [
  ['protanopia', 'protanopie'],
  ['deuteranopia', 'deutéranopie'],
  ['tritanopia', 'tritanopie'],
  ['achromatopsia', 'achromatopsie'],
] as const) {
  test(`simulation : ${label} (captures de la page Analyse et de la page Live)`, async ({page}) => {
    const session = await page.context().newCDPSession(page);
    await session.send('Emulation.setEmulatedVisionDeficiency', {type: deficiency});
    await open(page, 'analyse');
    await expect(page.locator('ng-table-chart').first()).toBeVisible();
    const charts = page.locator('ng-table-chart');
    for (let i = 0; i < Math.min(2, await charts.count()); i++) {
      await charts.nth(i).screenshot({path: `test-results/${deficiency}-graphique-${i + 1}.png`});
    }
    await open(page, 'live');
    await page.screenshot({path: `test-results/${deficiency}-live.png`});
  });
}
