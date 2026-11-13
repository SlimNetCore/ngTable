import {expect, Page, test} from '@playwright/test';

// Page Nouveautés de la démo : ce qui ne se vérifie que dans un vrai navigateur (animations, position collante).

async function open(page: Page, reducedMotion: 'reduce' | 'no-preference' = 'no-preference'): Promise<void> {
  await page.emulateMedia({reducedMotion});
  await page.addInitScript(() => localStorage.setItem('ngt-demo-lang', 'fr'));
  await page.goto('/#/nouveautes');
  await page.locator('tr.data-row').first().waitFor();
}

/** Nombre d'animations en cours sur des lignes de données. */
const runningAnimations = (page: Page) =>
  page.evaluate(
    () =>
      document.getAnimations().filter((animation) => {
        const target = (animation.effect as KeyframeEffect | null)?.target;
        return !!target && target.matches('tr.data-row');
      }).length,
  );

test('[animateRows] : au tri, les lignes glissent vers leur nouvelle place', async ({page}) => {
  await open(page);
  const table = page.locator('ng-table').first();
  expect(await runningAnimations(page)).toBe(0);
  // On compte les animations lancées sur des lignes, plutôt que de guetter une animation de 260 ms en cours :
  // sur une machine chargée, elle peut être finie avant le premier coup d'œil.
  await page.evaluate(() => {
    const original = Element.prototype.animate;
    (window as unknown as {started: number}).started = 0;
    Element.prototype.animate = function (...args: Parameters<Element['animate']>) {
      if (this.matches('tr.data-row')) {
        (window as unknown as {started: number}).started++;
      }
      return original.apply(this, args);
    };
  });
  await table.getByRole('button', {name: /Marge/}).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as {started: number}).started)).toBeGreaterThan(0);
  // L'animation se termine et ne laisse aucune transformation sur les lignes.
  await expect.poll(() => runningAnimations(page), {timeout: 3000}).toBe(0);
  const transforms = await table.locator('tr.data-row').evaluateAll((rows) => rows.map((row) => getComputedStyle(row).transform));
  expect(new Set(transforms)).toEqual(new Set(['none']));
});

test('[animateRows] : aucune animation quand l’utilisateur a demandé moins d’animations', async ({page}) => {
  await open(page, 'reduce');
  await page.locator('ng-table').first().getByRole('button', {name: /Marge/}).click();
  await page.waitForTimeout(100);
  expect(await runningAnimations(page)).toBe(0);
});

test('[stickyGroupHeaders] : l’en-tête du groupe en cours reste collé sous l’en-tête des colonnes', async ({page}) => {
  await open(page, 'reduce');
  const table = page.locator('ng-table').nth(4);
  await table.scrollIntoViewIfNeeded();
  const measure = () =>
    table.evaluate((host) => {
      const wrap = host.querySelector<HTMLElement>('.table-wrap')!;
      // Ce sont les cellules qui sont collantes, pas la ligne : la mesure se fait sur une cellule d'en-tête.
      const header = host.querySelector('th.cdk-header-cell')!.getBoundingClientRect();
      const cell = host.querySelector('tr.group-row td.group-cell--lead')!;
      return {gap: Math.round(cell.getBoundingClientRect().top - header.bottom), text: cell.textContent ?? '', top: wrap.scrollTop};
    });
  await table.evaluate((host) => {
    host.querySelector<HTMLElement>('.table-wrap')!.scrollTop = 6000;
  });
  await expect.poll(async () => (await measure()).top).toBe(6000);
  await expect.poll(async () => Math.abs((await measure()).gap)).toBeLessThanOrEqual(1);
  expect((await measure()).text).toContain('Bernard');
});

test('[scrollMarkers] : des repères rouges, puis un repère de sélection quand on coche une ligne', async ({page}) => {
  await open(page, 'reduce');
  const table = page.locator('ng-table').nth(4);
  await table.scrollIntoViewIfNeeded();
  const kinds = () => table.locator('.ngt-scroll-marker').evaluateAll((marks) => [...new Set(marks.map((mark) => mark.getAttribute('data-kind')))].sort());
  expect(await kinds()).toEqual(['danger']);
  await table.locator('.selection-cell ng-table-checkbox').first().click();
  await expect.poll(kinds).toEqual(['danger', 'selection']);
});

test('[fillHandle] : tirer la poignée prolonge la suite 10, 20 ; Ctrl+Z annule tout', async ({page}) => {
  await open(page, 'reduce');
  const table = page.locator('ng-table').nth(5);
  await table.scrollIntoViewIfNeeded();
  const quantity = (row: number) => table.locator('tr.data-row').nth(row).locator('td.cdk-column-quantite');
  const quantities = () => table.locator('td.cdk-column-quantite').allInnerTexts().then((texts) => texts.map((text) => text.trim()));
  expect(await quantities()).toEqual(['10', '20', '1', '1', '1', '1', '1', '1']);

  // Sélection des deux premières quantités par glissement, puis poignée tirée jusqu'à la cinquième ligne.
  await quantity(0).hover();
  await page.mouse.down();
  await quantity(1).hover();
  await page.mouse.up();
  const handle = table.locator('.ngt-fill-handle');
  await expect(handle).toHaveCount(1);
  await handle.hover();
  await page.mouse.down();
  await quantity(3).hover();
  await quantity(4).hover();
  await expect(table.locator('td[data-ngt-fill]')).toHaveCount(3);
  await page.mouse.up();
  await expect.poll(quantities).toEqual(['10', '20', '30', '40', '50', '1', '1', '1']);

  await quantity(4).click();
  await page.keyboard.press('Control+z');
  await expect.poll(quantities).toEqual(['10', '20', '1', '1', '1', '1', '1', '1']);
});

test('filtre avancé : le constructeur filtre la table, « OU » élargit, « Tout effacer » rend tout', async ({page}) => {
  await open(page, 'reduce');
  const builder = page.locator('ng-table-filter-builder');
  const table = page.locator('ng-table').nth(6);
  await builder.scrollIntoViewIfNeeded();
  const total = () => table.locator('ng-table-paginator').innerText();
  const initial = await total();
  expect(initial).not.toContain('sur 120');

  // Racine en OU : (Validée OU Expédiée) OU montant > 5000 retient plus de lignes.
  await builder.locator('.ngt-fb__operator').first().selectOption('or');
  await expect.poll(total).not.toBe(initial);

  await builder.getByRole('button', {name: 'Tout effacer'}).click();
  await expect.poll(total).toContain('sur 120');
  await expect(builder.locator('.ngt-fb__condition')).toHaveCount(0);
});
