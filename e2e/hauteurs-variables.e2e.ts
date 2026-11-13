import {expect, Page, test} from '@playwright/test';

// Défilement virtuel avec des lignes de hauteurs différentes (page Avancé, lignes détail).
// Ces tests demandent un vrai navigateur : jsdom ne calcule aucune hauteur.

async function open(page: Page): Promise<void> {
  await page.emulateMedia({reducedMotion: 'reduce'});
  await page.addInitScript(() => localStorage.setItem('ngt-demo-lang', 'fr'));
  await page.goto('/#/avance');
  await page.locator('tr.data-row').first().waitFor();
  await page.getByRole('radio', {name: 'Défilement virtuel'}).or(page.getByRole('button', {name: 'Défilement virtuel'})).first().click();
  await expect(page.locator('tr.spacer-row')).toHaveCount(2);
}

const dataRows = (page: Page) => page.locator('tr.data-row:not([data-ngt-pin])');

/** Mesures de la zone de défilement : hauteur totale, et rang (aria-rowindex) de la première ligne visible sous l'en-tête. */
async function measure(page: Page) {
  return page.evaluate(() => {
    const wrap = document.querySelector<HTMLElement>('.table-wrap')!;
    const header = [...wrap.querySelectorAll('tr.cdk-header-row')].reduce((sum, row) => sum + row.getBoundingClientRect().height, 0);
    const top = wrap.getBoundingClientRect().top + header;
    const rows = [...wrap.querySelectorAll<HTMLElement>('tr.data-row:not([data-ngt-pin])')];
    const first = rows.find((row) => row.getBoundingClientRect().bottom > top + 1)!;
    return {
      scrollHeight: wrap.scrollHeight,
      header,
      rowHeight: rows[rows.length - 1].getBoundingClientRect().height,
      firstIndex: Number(first.getAttribute('aria-rowindex')),
      firstOffset: Math.round(first.getBoundingClientRect().top - top),
    };
  });
}

const scrollTo = async (page: Page, top: number) => {
  await page.evaluate((value) => {
    document.querySelector<HTMLElement>('.table-wrap')!.scrollTop = value;
  }, top);
  // Deux images : la tranche rendue, puis la mesure des lignes.
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
};

test('un détail déplié garde sa hauteur dans la barre de défilement, même une fois hors de la zone rendue', async ({page}) => {
  await open(page);
  const before = await measure(page);
  // Référence, sans détail déplié : la ligne en haut de la zone après un défilement de 100 lignes.
  const target = 100;
  await scrollTo(page, target * before.rowHeight);
  const reference = await measure(page);
  await scrollTo(page, 0);

  // Un seul détail : la page de démo ouvre les détails en accordéon.
  await dataRows(page).nth(1).locator('button.ngt-detail-toggle').click();
  await expect(page.locator('tr.detail-row-container:not(.detail-row-collapsed)')).toHaveCount(1);
  const expanded = await measure(page);
  const details = expanded.scrollHeight - before.scrollHeight;
  expect(details, 'le détail allonge la liste').toBeGreaterThan(40);

  // Loin plus bas : la ligne dépliée n'est plus rendue, mais sa hauteur compte toujours.
  await scrollTo(page, target * before.rowHeight + details);
  await expect(page.locator('tr.detail-row-container:not(.detail-row-collapsed)')).toHaveCount(0);
  const far = await measure(page);
  expect(far.scrollHeight, 'hauteur totale inchangée').toBe(expanded.scrollHeight);
  // Défiler de la hauteur du détail en plus amène exactement la même ligne, au même endroit (au pixel près :
  // la hauteur du détail n'est pas un nombre entier de pixels).
  const offsetOfReferenceRow = await page.evaluate((index) => {
    const wrap = document.querySelector<HTMLElement>('.table-wrap')!;
    const header = [...wrap.querySelectorAll('tr.cdk-header-row')].reduce((sum, row) => sum + row.getBoundingClientRect().height, 0);
    const row = wrap.querySelector<HTMLElement>(`tr.data-row[aria-rowindex="${index}"]`);
    return row ? row.getBoundingClientRect().top - wrap.getBoundingClientRect().top - header : null;
  }, reference.firstIndex);
  expect(offsetOfReferenceRow, 'la ligne de référence est rendue').not.toBeNull();
  expect(Math.abs(offsetOfReferenceRow! - reference.firstOffset)).toBeLessThanOrEqual(1);

  // Retour en haut : le détail est toujours déplié, à sa place.
  await scrollTo(page, 0);
  await expect(page.locator('tr.detail-row-container:not(.detail-row-collapsed)')).toHaveCount(1);
  expect((await measure(page)).scrollHeight).toBe(expanded.scrollHeight);
});

test('la dernière ligne reste atteignable avec un détail déplié', async ({page}) => {
  await open(page);
  await dataRows(page).nth(2).locator('button.ngt-detail-toggle').click();
  await scrollTo(page, 10_000_000);
  await scrollTo(page, 10_000_000);
  const total = await page.locator('table[aria-rowcount]').first().getAttribute('aria-rowcount');
  const last = await dataRows(page).last().getAttribute('aria-rowindex');
  // aria-rowcount compte les en-têtes et la ligne de totaux éventuelle : la dernière ligne de données est à 0 ou 1 du total.
  expect(Number(total) - Number(last)).toBeLessThanOrEqual(1);
  const gap = await page.evaluate(() => {
    const wrap = document.querySelector<HTMLElement>('.table-wrap')!;
    return Math.round(wrap.scrollHeight - wrap.scrollTop - wrap.clientHeight);
  });
  expect(gap, 'en butée basse').toBeLessThanOrEqual(1);
});
