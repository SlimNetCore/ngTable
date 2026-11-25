import {nvdaTest as test} from '@guidepup/playwright';
import {expect} from '@playwright/test';
import {mkdirSync, writeFileSync} from 'node:fs';

// Ce que NVDA prononce réellement sur cinq parcours. Les phrases sont enregistrées dans `e2e-nvda/journal/` pour
// relecture ; les vérifications portent sur l'information essentielle, pas sur la formulation exacte de NVDA.

const journal = (name: string, phrases: string[]) => {
  mkdirSync('e2e-nvda/journal', {recursive: true});
  writeFileSync(`e2e-nvda/journal/${name}.txt`, phrases.join('\n') + '\n');
};

test.use({nvdaStartOptions: {capture: true}});

async function open(page: import('@playwright/test').Page, route: string) {
  await page.addInitScript(() => localStorage.setItem('ngt-demo-lang', 'fr'));
  await page.goto(`/#/${route}`, {waitUntil: 'load'});
  await page.locator('tr.data-row').first().waitFor();
}

test('trier une colonne : le bouton est nommé, le tri est annoncé', async ({page, nvda}) => {
  await open(page, 'simple');
  await nvda.navigateToWebContent();
  await page.locator('th.cdk-column-reference .header-button').focus();
  await nvda.perform(nvda.keyboardCommands.reportCurrentFocus);
  const onButton = await nvda.lastSpokenPhrase();
  await nvda.press('Enter');
  await page.waitForTimeout(1500);
  const log = await nvda.spokenPhraseLog();
  journal('tri', log);
  expect(onButton).toContain('Référence');
  expect(log.join(' | ')).toMatch(/Référence/);
  expect(log.join(' | '), 'le tri est annoncé par la région live').toMatch(/croissant|ascending|tri/i);
});

test('filtrer par la recherche : le nombre de lignes est annoncé', async ({page, nvda}) => {
  await open(page, 'simple');
  await nvda.navigateToWebContent();
  await page.locator('.global-search__input').focus();
  await nvda.perform(nvda.keyboardCommands.reportCurrentFocus);
  const onField = await nvda.lastSpokenPhrase();
  await nvda.type('dupont');
  await page.waitForTimeout(2000);
  const log = await nvda.spokenPhraseLog();
  journal('recherche', log);
  expect(onField).toMatch(/Recherche|edit|search/i);
  expect(log.join(' | '), 'le nombre de lignes restantes est annoncé').toMatch(/\d+ ligne/);
});

test('sélectionner une ligne : la case est nommée, le compte est annoncé', async ({page, nvda}) => {
  await open(page, 'avance');
  await nvda.navigateToWebContent();
  await page.locator('tr.data-row:not([data-ngt-pin]) .selection-cell input').first().focus();
  await nvda.perform(nvda.keyboardCommands.reportCurrentFocus);
  const onBox = await nvda.lastSpokenPhrase();
  await nvda.press('Space');
  await page.waitForTimeout(1500);
  const log = await nvda.spokenPhraseLog();
  journal('selection', log);
  expect(onBox).toMatch(/Sélectionner|check ?box/i);
  // Le compte est dit une seule fois (par la barre d'état de cette page), pas deux.
  expect(log.join(' | ')).toMatch(/1 sélectionnée/);
  expect(log.join(' | ')).not.toMatch(/1 ligne\(s\) sélectionnée\(s\)/);
});

test('parcourir la grille aux flèches : en-tête de colonne et valeur sont lus', async ({page, nvda}) => {
  await open(page, 'avance');
  await nvda.navigateToWebContent();
  await page.locator('tr.data-row:not([data-ngt-pin])').nth(1).locator('td.cdk-column-reference').focus();
  await nvda.press('ArrowRight');
  await nvda.press('ArrowDown');
  await nvda.press('ArrowDown');
  await page.waitForTimeout(800);
  const log = await nvda.spokenPhraseLog();
  journal('grille', log);
  expect(log.join(' | '), 'une valeur de cellule est lue').toMatch(/CMD-|SA|SARL|Fils|Commerce|Industries|Logistique/);
  // L'en-tête lu avec la cellule est le titre de la colonne, pas les libellés de ses boutons.
  expect(log.join(' | ')).toContain('Client');
  expect(log.join(' | ')).not.toMatch(/Réordonner|Filtrer par/);
});

test('déplier un détail : l’état déplié / replié est annoncé', async ({page, nvda}) => {
  await open(page, 'avance');
  await nvda.navigateToWebContent();
  await page.locator('tr.data-row:not([data-ngt-pin]) button.ngt-detail-toggle').nth(1).focus();
  await nvda.perform(nvda.keyboardCommands.reportCurrentFocus);
  const onToggle = await nvda.lastSpokenPhrase();
  await nvda.press('Enter');
  await page.waitForTimeout(1200);
  await nvda.perform(nvda.keyboardCommands.reportCurrentFocus);
  const after = await nvda.lastSpokenPhrase();
  journal('detail', await nvda.spokenPhraseLog());
  expect(onToggle).toMatch(/détail/i);
  expect(onToggle).toMatch(/collapsed|réduit/i);
  expect(after).toMatch(/expanded|développé/i);
});

test('barre d’actions de sélection : F6 y mène, la barre d’outils et son bouton sont annoncés', async ({page, nvda}) => {
  await open(page, 'avance');
  await nvda.navigateToWebContent();
  await page.locator('tr.data-row:not([data-ngt-pin]) .selection-cell input').first().focus();
  await nvda.press('Space');
  await page.waitForTimeout(1500);
  await nvda.press('F6');
  await page.waitForTimeout(1500);
  const log = await nvda.spokenPhraseLog();
  journal('barre-actions', log);
  expect(await page.evaluate(() => !!document.activeElement?.closest('.ngt-action-bar')), 'le focus est dans la barre').toBe(true);
  expect(log.join(' | '), 'le raccourci est donné à la première sélection').toMatch(/F ?6/); // NVDA épelle « F 6 »
  expect(log.join(' | '), 'la barre d’outils est annoncée').toMatch(/barre d.outils|toolbar/i);
});

test('panneau latéral : les onglets sont annoncés comme des onglets, avec leur état', async ({page, nvda}) => {
  await open(page, 'avance');
  await nvda.navigateToWebContent();
  await page.locator('.ngt-side-panel-toggle').click();
  await page.getByRole('tab').first().focus();
  await nvda.perform(nvda.keyboardCommands.reportCurrentFocus);
  const onTab = await nvda.lastSpokenPhrase();
  await nvda.press('ArrowRight');
  await page.waitForTimeout(1500);
  const log = await nvda.spokenPhraseLog();
  journal('onglets', log);
  expect(onTab).toMatch(/onglet|tab/i);
  expect(log.join(' | ')).toMatch(/Filtres/);
});

test('mode live : la suspension des mises à jour est annoncée', async ({page, nvda}) => {
  await open(page, 'live');
  await nvda.navigateToWebContent();
  await page.locator('.ngt-live-pause').focus();
  await nvda.perform(nvda.keyboardCommands.reportCurrentFocus);
  const onButton = await nvda.lastSpokenPhrase();
  await nvda.press('Enter');
  await page.waitForTimeout(1500);
  const log = await nvda.spokenPhraseLog();
  journal('live-pause', log);
  expect(onButton).toMatch(/Suspendre/);
  expect(log.join(' | ')).toMatch(/suspendues/i);
});
