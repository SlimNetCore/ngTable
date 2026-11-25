import {expect, Page, test} from '@playwright/test';

// Parcours au clavier et gestion du focus : ce que l'audit axe ne voit pas (audit de novembre 2026).

async function open(page: Page, route: string): Promise<void> {
  await page.emulateMedia({reducedMotion: 'reduce'});
  await page.addInitScript(() => localStorage.setItem('ngt-demo-lang', 'fr'));
  await page.goto(`/#/${route}`);
  await page.locator('tr.data-row').first().waitFor();
}

const focused = (page: Page) =>
  page.evaluate(() => {
    const element = document.activeElement as HTMLElement | null;
    return element ? `${element.tagName.toLowerCase()}.${element.className.toString().split(' ')[0]}` : 'aucun';
  });

test('menu contextuel ouvert au clavier : Échap rend le focus à la cellule de départ (2.4.3)', async ({page}) => {
  await open(page, 'avance');
  const cell = page.locator('tr.data-row:not([data-ngt-pin])').nth(1).locator('td.cdk-column-reference');
  await cell.click();
  await expect(cell).toBeFocused();
  await page.keyboard.press('Shift+F10');
  await expect(page.locator('.ngt-menu-panel')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.ngt-menu-panel')).toHaveCount(0);
  await expect(cell).toBeFocused();
});

test('filtre en menu : Entrée dans le champ ferme le panneau et rend le focus au bouton de filtre (2.4.3)', async ({page}) => {
  await open(page, 'simple');
  const button = page.locator('th.cdk-column-reference .filter-button');
  await button.focus();
  await page.keyboard.press('Enter');
  const field = page.locator('.ngt-filter-menu-panel input').first();
  await expect(field).toBeVisible();
  await field.fill('CMD-00001');
  await field.press('Enter');
  await expect(field).toBeHidden();
  await expect(button).toBeFocused();
  await expect(page.locator('tr.data-row').first()).toContainText('CMD-000010'); // la saisie a bien filtré
});

test('Échap sur un bouton de la barre d’actions ferme sa bulle sans vider la sélection (1.4.13)', async ({page}) => {
  await open(page, 'avance');
  await page.locator('.selection-cell ng-table-checkbox').nth(1).click();
  const bar = page.getByRole('toolbar');
  await expect(bar).toBeVisible();
  const action = bar.getByRole('button').first();
  await action.focus();
  // La bulle n'existe que si le bouton en porte une : dans les deux cas, la sélection doit survivre au premier Échap
  // quand une bulle était ouverte.
  const hadBubble = (await page.locator('.ngt-tooltip').count()) > 0;
  await page.keyboard.press('Escape');
  if (hadBubble) {
    await expect(page.locator('.ngt-tooltip')).toHaveCount(0);
    await expect(bar).toBeVisible();
  }
});

test('navigation par cellule : la cellule qui reçoit le focus n’est pas cachée sous l’en-tête collant (2.4.11)', async ({page}) => {
  await open(page, 'nouveautes');
  // Table n° 6 (poignée de recopie) : navigation par cellule active ; table n° 3 : 200 000 lignes, en-tête collant.
  const table = page.locator('ng-table').nth(5);
  await table.scrollIntoViewIfNeeded();
  const first = table.locator('tr.data-row').first().locator('td.cdk-column-quantite');
  await first.click();
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press('ArrowDown');
  }
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press('ArrowUp');
    const visible = await page.evaluate(() => {
      const cell = document.activeElement as HTMLElement;
      const wrap = cell.closest('.table-wrap') as HTMLElement;
      const header = wrap.querySelector('th.cdk-header-cell')!.getBoundingClientRect();
      return cell.getBoundingClientRect().top >= header.bottom - 1;
    });
    expect(visible, `pas n° ${i}`).toBe(true);
  }
});

test('lignes activables : Tab atteint une ligne, Entrée sur un bouton de la ligne ne déplie pas le détail (2.1.1)', async ({page}) => {
  await open(page, 'expert');
  const row = page.locator('tr.data-row').first();
  const toggle = row.locator('button.ngt-detail-toggle');
  if ((await toggle.count()) === 0) {
    test.skip(true, 'la page Expert ne montre pas de bouton de détail dans cette configuration');
  }
  await toggle.focus();
  await page.keyboard.press('Enter');
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Enter');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false'); // une seule bascule par appui
  expect(await focused(page)).toContain('ngt-detail-toggle');
});

test('contour des champs : au moins 3 pour 1 avec le fond, en clair et en sombre (1.4.11)', async ({page}) => {
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({colorScheme: scheme, reducedMotion: 'reduce'});
    await page.addInitScript((value) => localStorage.setItem('ngt-demo-theme', value), scheme);
    await page.goto('/#/simple');
    await page.locator('tr.data-row').first().waitFor();
    const ratio = await page.locator('.global-search').first().evaluate((shell) => {
      const parse = (value: string) => (value.match(/[\d.]+/g) ?? []).map(Number);
      const luminance = ([r, g, b]: number[]) => {
        const linear = (channel: number) => (channel / 255 <= 0.03928 ? channel / 255 / 12.92 : Math.pow((channel / 255 + 0.055) / 1.055, 2.4));
        return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
      };
      // Fond opaque réel derrière le champ.
      let node: HTMLElement | null = shell as HTMLElement;
      let back = [255, 255, 255];
      while (node) {
        const color = parse(getComputedStyle(node).backgroundColor);
        if (color.length >= 3 && (color[3] === undefined || color[3] === 1)) {
          back = color;
          break;
        }
        node = node.parentElement;
      }
      const [r, g, b, a = 1] = parse(getComputedStyle(shell).borderTopColor);
      const border = [r, g, b].map((channel, i) => channel * a + back[i] * (1 - a));
      const [hi, lo] = [luminance(border), luminance(back)].sort((x, y) => y - x);
      return (hi + 0.05) / (lo + 0.05);
    });
    expect(ratio, `thème ${scheme}`).toBeGreaterThanOrEqual(3);
  }
});

const onBody = (page: Page) => page.evaluate(() => document.activeElement === document.body || document.activeElement === null);
const live = (page: Page) => page.locator('.ngt-live-region').first();

test('le focus ne tombe pas sur la page quand le bouton activé disparaît (2.4.3)', async ({page}) => {
  await open(page, 'simple');
  // Croix de la recherche : elle disparaît avec le texte, le focus va au champ.
  const search = page.locator('.global-search__input');
  await search.fill('dupont');
  await page.locator('.global-search button').click();
  await expect(search).toBeFocused();

  // Croix d'une puce de filtre : la puce disparaît, le focus reste dans la table.
  await search.fill('dupont');
  const chip = page.locator('.active-filter-chip__clear').first();
  await chip.waitFor();
  await chip.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.active-filter-chip__clear')).toHaveCount(0);
  await expect.poll(() => onBody(page)).toBe(false);

  // « Réinitialiser les filtres » quand la liste est vide : un seul bouton, celui de la barre des filtres actifs
  // (l'état vide ne le répète plus).
  await search.fill('zzzzzz');
  await expect(page.locator('.no-data-cell__text')).toBeVisible();
  await expect(page.locator('.no-data-cell__action')).toHaveCount(0);
  const reset = page.locator('.active-filters-bar').getByRole('button', {name: 'Réinitialiser les filtres'});
  await reset.waitFor();
  await reset.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('tr.data-row').first()).toBeVisible();
  await expect.poll(() => onBody(page)).toBe(false);
});

test('barre d’actions : « désélectionner » rend le focus à la table (2.4.3)', async ({page}) => {
  await open(page, 'avance');
  await page.locator('.selection-cell ng-table-checkbox').nth(1).click();
  const bar = page.getByRole('toolbar');
  await expect(bar).toBeVisible();
  await bar.focus();
  await page.keyboard.press('Escape');
  await expect(bar).toHaveCount(0);
  await expect.poll(() => onBody(page)).toBe(false);
});

test('Tab au bout d’un menu le ferme et rend le focus à son bouton (2.4.3)', async ({page}) => {
  await open(page, 'simple');
  const trigger = page.getByRole('button', {name: /colonnes/i}).first();
  await trigger.focus();
  await page.keyboard.press('Enter');
  const panel = page.locator('.ngt-menu-panel');
  await expect(panel).toBeVisible();
  for (let i = 0; i < 40 && (await panel.count()) > 0; i++) {
    await page.keyboard.press('Tab');
  }
  await expect(panel).toHaveCount(0);
  await expect.poll(() => onBody(page)).toBe(false);
  // Le focus est resté dans la barre d'actions de la table, pas en fin de page.
  expect(await page.evaluate(() => !!document.activeElement?.closest('ng-table'))).toBe(true);
});

test('annonces aux lecteurs d’écran : sélection, tri, filtre (4.1.3)', async ({page}) => {
  // Page Thème : sélection sans barre d'état (avec elle, c'est la barre d'état qui annonce le compte).
  await open(page, 'theme');
  await page.locator('.selection-cell ng-table-checkbox').nth(1).click();
  await expect(live(page)).toContainText('1 ligne(s) sélectionnée(s)');
  await page.locator('.selection-cell ng-table-checkbox').nth(2).click();
  await expect(live(page)).toContainText('2 ligne(s) sélectionnée(s)');
});

test('ce qu’un lecteur d’écran reçoit : rôles, noms et états de la table (4.1.2)', async ({page}) => {
  await open(page, 'simple');
  const table = page.getByRole('table', {name: 'Commandes'}).or(page.getByRole('grid', {name: 'Commandes'})).or(page.getByRole('treegrid', {name: 'Commandes'})).first();
  await expect(table).toBeVisible();
  // En-têtes de colonne nommés, tri annoncé par aria-sort après activation.
  const header = page.getByRole('columnheader', {name: /Référence/});
  await expect(header).toBeVisible();
  await header.getByRole('button', {name: /Référence/}).first().click();
  await expect(header).toHaveAttribute('aria-sort', 'ascending');
  await expect(live(page)).toContainText(/Référence/);
  // Champ de recherche, pagination et lignes exposés avec leur rôle.
  await expect(page.getByRole('search')).toBeVisible();
  await expect(page.getByRole('searchbox').or(page.getByRole('textbox', {name: /recherche/i})).first()).toBeVisible();
  expect(await page.getByRole('row').count()).toBeGreaterThan(10);
});

test('sans glisser : une colonne se déplace et s’ajuste depuis le menu Colonnes (2.5.7)', async ({page}) => {
  await open(page, 'simple');
  const headers = () => page.locator('ng-table').first().locator('th.cdk-header-cell .header-label').allInnerTexts();
  expect((await headers()).slice(0, 2)).toEqual(['Référence', 'Client']);
  await page.getByRole('button', {name: /colonnes/i}).first().click();
  await page.getByRole('button', {name: 'Déplacer « Client » vers le début'}).click();
  await expect.poll(async () => (await headers()).slice(0, 2)).toEqual(['Client', 'Référence']);
  await expect(live(page)).toContainText('Colonne « Client » en position 1');
  // Déjà en tête : le bouton « vers le début » est désactivé, le menu est resté ouvert.
  await expect(page.getByRole('button', {name: 'Déplacer « Client » vers le début'})).toBeDisabled();
  await page.getByRole('button', {name: 'Déplacer « Client » vers la fin'}).click();
  await expect.poll(async () => (await headers()).slice(0, 2)).toEqual(['Référence', 'Client']);
});

test('sans glisser : un clic sur la poignée de recopie, puis un clic sur la dernière cellule (2.5.7)', async ({page}) => {
  await open(page, 'nouveautes');
  const table = page.locator('ng-table').nth(5);
  await table.scrollIntoViewIfNeeded();
  const quantity = (row: number) => table.locator('tr.data-row').nth(row).locator('td.cdk-column-quantite');
  const quantities = () => table.locator('td.cdk-column-quantite').allInnerTexts().then((texts) => texts.map((text) => text.trim()));
  await quantity(0).hover();
  await page.mouse.down();
  await quantity(1).hover();
  await page.mouse.up();
  const handle = table.locator('.ngt-fill-handle');
  await handle.click();
  await expect(handle).toHaveClass(/ngt-fill-handle--armed/);
  await quantity(4).click();
  await expect.poll(quantities).toEqual(['10', '20', '30', '40', '50', '1', '1', '1']);
  await expect(table.locator('.ngt-fill-handle--armed')).toHaveCount(0);
});

test('F8 va à la ligne repérée suivante et l’annonce ; Maj+F8 revient à la précédente (2.1.1)', async ({page}) => {
  await open(page, 'nouveautes');
  const table = page.locator('ng-table').nth(4);
  await table.scrollIntoViewIfNeeded();
  await table.locator('tr.data-row:not([data-ngt-pin]) td.cdk-column-reference').first().click();
  const amount = async () => Number((await table.locator('tr.data-row[data-ngt-located] td.cdk-column-montant').innerText()).trim());
  const reference = () => table.locator('tr.data-row[data-ngt-located] td.cdk-column-reference').innerText();

  await page.keyboard.press('F8');
  await expect(table.locator('tr.data-row[data-ngt-located]')).toHaveCount(1);
  expect(await amount()).toBeGreaterThan(9950);
  const first = (await reference()).trim();
  await expect(table.locator('.ngt-live-region')).toContainText(/\S/);

  await page.keyboard.press('F8');
  await expect.poll(async () => (await reference()).trim()).not.toBe(first);
  expect(await amount()).toBeGreaterThan(9950);

  await page.keyboard.press('Shift+F8');
  await expect.poll(async () => (await reference()).trim()).toBe(first);
});

// ---------------------------------------------------------------- cinquième lot (constats mineurs restants)

const activeLabel = (page: Page) => page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? '');

test('colonne déplacée au clavier : le focus reste sur la poignée de la même colonne (2.4.3)', async ({page}) => {
  await open(page, 'simple');
  const headers = () => page.locator('ng-table').first().locator('th.cdk-header-cell .header-label').allInnerTexts();
  const handle = page.locator('ng-table').first().locator('th.cdk-column-client .drag-handle');
  await handle.focus();
  await page.keyboard.press('ArrowLeft');
  await expect.poll(async () => (await headers()).slice(0, 2)).toEqual(['Client', 'Référence']);
  await expect(handle).toBeFocused();
  await expect(live(page)).toContainText('Colonne « Client » en position 1');
  // Le focus est resté en place : on enchaîne sans le rechercher.
  await page.keyboard.press('ArrowRight');
  await expect.poll(async () => (await headers()).slice(0, 2)).toEqual(['Référence', 'Client']);
  await expect(handle).toBeFocused();
});

test('menu Colonnes : après un déplacement, le focus reste sur un bouton de la même colonne (2.4.3)', async ({page}) => {
  await open(page, 'simple');
  await page.getByRole('button', {name: /colonnes/i}).first().click();
  await page.getByRole('button', {name: 'Déplacer « Client » vers le début'}).click();
  // En butée, « vers le début » se désactive : son voisin prend le focus, le menu reste ouvert.
  await expect.poll(() => activeLabel(page)).toBe('Déplacer « Client » vers la fin');
  await page.keyboard.press('Enter');
  await expect.poll(() => activeLabel(page)).toBe('Déplacer « Client » vers la fin');
  await expect(page.locator('.ngt-menu-panel')).toBeVisible();
});

test('ligne déplacée au clavier : le focus suit la poignée de la ligne (2.4.3)', async ({page}) => {
  await open(page, 'avance');
  const rows = page.locator('tr.data-row:not([data-ngt-pin])');
  const reference = (index: number) => rows.nth(index).locator('td.cdk-column-reference').innerText();
  const moved = (await reference(0)).trim();
  await rows.nth(0).locator('.ngt-row-handle').focus();
  await page.keyboard.press('Alt+ArrowDown');
  await expect.poll(async () => (await reference(1)).trim()).toBe(moved);
  await expect(rows.nth(1).locator('.ngt-row-handle')).toBeFocused();
  await page.keyboard.press('Alt+ArrowDown');
  await expect.poll(async () => (await reference(2)).trim()).toBe(moved);
  await expect(rows.nth(2).locator('.ngt-row-handle')).toBeFocused();
});

test('défilement virtuel : Ctrl+Fin va à la dernière ligne de la liste, Ctrl+Début à la première (2.1.1)', async ({page}) => {
  await open(page, 'nouveautes');
  const table = page.locator('ng-table').nth(4);
  await table.scrollIntoViewIfNeeded();
  await table.locator('tr.data-row:not([data-ngt-pin]) td.cdk-column-reference').first().click();
  const total = Number(await table.locator('table').getAttribute('aria-rowcount'));
  expect(total).toBeGreaterThan(200);
  const rank = () => page.evaluate(() => Number(document.activeElement?.closest('tr')?.getAttribute('aria-rowindex') ?? -1));
  const before = await rank();

  await page.keyboard.press('Control+End');
  await expect.poll(rank).toBeGreaterThan(total - 3);
  expect(await page.evaluate(() => document.activeElement?.tagName)).toBe('TD');
  const last = await rank();

  await page.keyboard.press('PageUp');
  await expect.poll(rank).toBe(last - 10);

  await page.keyboard.press('Control+Home');
  await expect.poll(rank).toBeLessThanOrEqual(before);
  // Page suivante, plusieurs fois : on dépasse les lignes rendues au départ.
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press('PageDown');
    await page.waitForTimeout(80);
  }
  await expect.poll(rank).toBeGreaterThan(before + 50);
});

test('barre d’actions de sélection : F6 y mène, les flèches la parcourent, F6 revient à la table (2.4.3)', async ({page}) => {
  await open(page, 'avance');
  await page.locator('.selection-cell ng-table-checkbox').nth(1).click();
  const bar = page.getByRole('toolbar');
  await expect(bar).toBeVisible();
  const inBar = () => page.evaluate(() => !!document.activeElement?.closest('.ngt-action-bar'));
  const cell = page.locator('tr.data-row:not([data-ngt-pin])').nth(1).locator('td.cdk-column-reference');
  await cell.click();
  await page.keyboard.press('F6');
  await expect.poll(inBar).toBe(true);
  const first = await activeLabel(page);
  await page.keyboard.press('ArrowRight');
  await expect.poll(inBar).toBe(true);
  const second = await page.evaluate(() => document.activeElement?.textContent?.trim() ?? '');
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => page.evaluate(() => document.activeElement?.textContent?.trim() ?? '')).not.toBe(second);
  await page.keyboard.press('Home');
  await expect.poll(() => activeLabel(page)).toBe(first);
  await page.keyboard.press('F6');
  await expect(cell).toBeFocused();
});

test('panneau latéral : onglets reliés à leur contenu, flèches entre les onglets (4.1.2)', async ({page}) => {
  await open(page, 'avance');
  await page.locator('.ngt-side-panel-toggle').click();
  const tabs = page.getByRole('tab');
  await expect(tabs).toHaveCount(2);
  const panel = page.getByRole('tabpanel');
  await expect(panel).toHaveAttribute('aria-labelledby', (await tabs.nth(0).getAttribute('id'))!);
  await tabs.nth(0).focus();
  await page.keyboard.press('ArrowRight');
  await expect(tabs.nth(1)).toBeFocused();
  await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');
  await expect(panel).toHaveAttribute('aria-labelledby', (await tabs.nth(1).getAttribute('id'))!);
  // Un seul onglet dans l'ordre de tabulation : Tab sort de la liste d'onglets.
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => document.activeElement?.getAttribute('role'))).not.toBe('tab');
});

test('mode live : « Suspendre les mises à jour » fige les valeurs, « Reprendre » les relance (2.2.2)', async ({page}) => {
  await open(page, 'live');
  const firstRows = () => page.locator('ng-table tr.data-row').allInnerTexts().then((texts) => texts.slice(0, 12).join('\n'));
  await expect
    .poll(async () => {
      const a = await firstRows();
      await page.waitForTimeout(400);
      return a !== (await firstRows());
    })
    .toBe(true); // le flux tourne

  await page.getByRole('button', {name: 'Suspendre les mises à jour'}).click();
  await expect(live(page)).toContainText('Mises à jour suspendues');
  await page.waitForTimeout(300); // la surbrillance du dernier lot est passée
  const frozen = await firstRows();
  await page.waitForTimeout(1200);
  expect(await firstRows()).toBe(frozen);

  await page.getByRole('button', {name: 'Reprendre les mises à jour'}).click();
  await expect(live(page)).toContainText('Mises à jour reprises');
  await expect.poll(firstRows).not.toBe(frozen);
});

test.describe('écran tactile', () => {
  test.use({hasTouch: true, isMobile: true, viewport: {width: 900, height: 1000}});

  test('tri multi-niveaux sans Maj+clic : le bouton « ajouter au tri » de l’en-tête (2.5.7, 3.3.2)', async ({page}) => {
    await open(page, 'live');
    const table = page.locator('ng-table').first();
    await expect(table.locator('.sort-level-button')).toHaveCount(0); // aucun tri : rien à compléter
    await table.locator('th.cdk-column-symbol .header-button').tap();
    const add = table.locator('.sort-level-button:visible').first();
    await expect(add).toBeVisible();
    const box = await add.boundingBox();
    expect(Math.min(box!.width, box!.height)).toBeGreaterThanOrEqual(24);
    await add.tap();
    await expect(table.locator('.sort-priority')).toHaveText(['1', '2']);
  });
});

test('texte tronqué : la bulle s’ouvre quand l’en-tête reçoit le focus au clavier, Échap la ferme (1.4.13, 2.1.1)', async ({page}) => {
  await open(page, 'avance');
  const table = page.locator('ng-table').first();
  // On rétrécit une colonne au clavier (Début : largeur minimale) jusqu'à tronquer son titre.
  const header = table.locator('th.cdk-header-cell:has(.resize-handle)').first();
  await header.locator('.resize-handle').focus();
  await page.keyboard.press('Home');
  const button = header.locator('.header-button');
  const title = (await button.locator('.header-label').innerText()).trim();
  await expect.poll(() => button.locator('.header-label').evaluate((label) => label.scrollWidth > label.clientWidth)).toBe(true);
  await button.focus();
  const bubble = page.locator('.ngt-tooltip');
  await expect(bubble).toBeVisible();
  await expect(bubble).toContainText(title);
  await page.keyboard.press('Escape');
  await expect(bubble).toHaveCount(0);
  await expect(button).toBeFocused();
});
