import {provideZonelessChangeDetection} from '@angular/core';
import {ComponentFixture, TestBed} from '@angular/core/testing';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {NgTableColumn, NgTableComponent, NgTableGroupSummary, NgTableRemoteQuery} from './ng-table.component';

/**
 * Performance en mode serveur (`dataMode='remote'`) sur 1 000 000 de lignes.
 *
 * Le « serveur » est simulé : chaque ligne se calcule depuis son index, rien n'est
 * stocké. Ce qu'on mesure est donc uniquement le coût de la table. Attendu : il ne
 * dépend que de la page affichée, jamais du nombre total de lignes.
 */

interface Row {
  id: number;
  reference: string;
  statut: string;
  montant: number;
}

const STATUTS = ['BROUILLON', 'VALIDEE', 'EXPEDIEE', 'ANNULEE'];
const MILLION = 1_000_000;
const PAGE_SIZE = 50;

const rowAt = (i: number): Row => ({
  id: i,
  reference: `CMD-${String(i + 1).padStart(7, '0')}`,
  statut: STATUTS[Math.floor(i / (MILLION / STATUTS.length))], // 4 blocs de 250 000 : déjà triés par statut
  montant: (i * 7919) % 100_000,
});

/** Page `index` d'un jeu de `total` lignes (ce que renverrait l'API). */
const serverPage = (index: number, total: number): Row[] => {
  const start = index * PAGE_SIZE;
  return Array.from({length: Math.max(0, Math.min(PAGE_SIZE, total - start))}, (_, k) => rowAt(start + k));
};

const columns: NgTableColumn<Row>[] = [
  {id: 'reference', header: 'Référence', valueAccessor: (r) => r.reference, sortable: true},
  {id: 'statut', header: 'Statut', valueAccessor: (r) => r.statut, sortable: true},
  {id: 'montant', header: 'Montant', valueAccessor: (r) => r.montant, sortable: true, aggregate: 'sum'},
];

async function createRemoteTable(total: number, extra: Record<string, unknown> = {}) {
  const fixture = TestBed.createComponent(NgTableComponent<Row>);
  const inputs: Record<string, unknown> = {
    columns,
    rows: serverPage(0, total),
    dataMode: 'remote',
    paginator: true,
    pageSize: PAGE_SIZE,
    totalCount: total,
    ...extra,
  };
  for (const [name, value] of Object.entries(inputs)) {
    fixture.componentRef.setInput(name, value);
  }
  await fixture.whenStable();
  return fixture;
}

/** Simule la réponse du serveur à une demande de page, et mesure le rendu de la table. */
async function showPage(fixture: ComponentFixture<NgTableComponent<Row>>, index: number, total: number): Promise<number> {
  const started = performance.now();
  fixture.componentRef.setInput('pageIndex', index);
  fixture.componentRef.setInput('rows', serverPage(index, total));
  await fixture.whenStable();
  return performance.now() - started;
}

/** Affiche une mesure dans la sortie des tests (le builder Angular masque `console`). */
function report(message: string): void {
  const stdout = (globalThis as {process?: {stdout?: {write(text: string): void}}}).process?.stdout;
  stdout?.write(`[perf] ${message}
`);
}

const renderedRows = (fixture: ComponentFixture<NgTableComponent<Row>>) =>
  (fixture.nativeElement as HTMLElement).querySelectorAll('tr.data-row');

/** Temps médian de rendu sur plusieurs pages (la médiane écarte les à-coups du ramasse-miettes). */
async function medianPageRender(fixture: ComponentFixture<NgTableComponent<Row>>, total: number, pages: number[]): Promise<number> {
  const times: number[] = [];
  for (const page of pages) {
    times.push(await showPage(fixture, page, total));
  }
  times.sort((a, b) => a - b);
  return times[Math.floor(times.length / 2)];
}

describe('NgTableComponent — performance en mode serveur (1 000 000 de lignes)', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({providers: [provideZonelessChangeDetection()]});
  });

  afterEach(() => TestBed.resetTestingModule());

  it('ne rend que la page reçue, quel que soit le total', async () => {
    const fixture = await createRemoteTable(MILLION);

    expect(renderedRows(fixture)).toHaveLength(PAGE_SIZE);
    expect(fixture.componentInstance['paginatorLength']()).toBe(MILLION);
  });

  it('atteint la dernière page (20 000) avec les bonnes lignes', async () => {
    const fixture = await createRemoteTable(MILLION);
    const queries: NgTableRemoteQuery[] = [];
    fixture.componentInstance.remoteQueryChange.subscribe((query) => queries.push(query));

    const lastPage = MILLION / PAGE_SIZE - 1;
    fixture.componentInstance['onPage']({pageIndex: lastPage, pageSize: PAGE_SIZE, length: MILLION, previousPageIndex: 0});
    expect(queries.at(-1)?.page).toEqual({index: lastPage, size: PAGE_SIZE});

    await showPage(fixture, lastPage, MILLION);
    const rows = renderedRows(fixture);
    expect(rows).toHaveLength(PAGE_SIZE);
    expect(rows[PAGE_SIZE - 1].textContent).toContain('CMD-1000000');
  });

  it('le temps de rendu d’une page ne dépend pas du nombre total de lignes', async () => {
    const pages = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
    const small = await createRemoteTable(1_000);
    const big = await createRemoteTable(MILLION);
    // Échauffement (compilation JIT des chemins de rendu), puis mesures.
    await medianPageRender(small, 1_000, [1, 2, 3]);
    await medianPageRender(big, MILLION, [1, 2, 3]);

    const smallMs = await medianPageRender(small, 1_000, pages);
    const bigMs = await medianPageRender(big, MILLION, pages.map((page) => page * 1_000));

    report(`rendu d'une page de ${PAGE_SIZE} lignes : ${smallMs.toFixed(1)} ms (1 000 lignes au total), ${bigMs.toFixed(1)} ms (1 000 000)`);
    // Même travail dans les deux cas : on tolère le bruit de mesure, pas un facteur lié au volume.
    expect(bigMs).toBeLessThan(smallMs * 3 + 25);
    expect(bigMs).toBeLessThan(500);
  });

  it('regroupement serveur : 4 groupes de 250 000 lignes, comptes et totaux du serveur, repli', async () => {
    const summaries: NgTableGroupSummary[] = STATUTS.map((key) => ({key, count: MILLION / STATUTS.length, aggregates: {montant: 12_345_678}}));
    const fixture = await createRemoteTable(MILLION, {groupBy: 'reference', groupSummaries: null});
    fixture.componentRef.setInput('groupBy', 'statut');
    fixture.componentRef.setInput('groupSummaries', summaries);
    await fixture.whenStable();

    const headers = () => [...(fixture.nativeElement as HTMLElement).querySelectorAll('tr.group-row')] as HTMLTableRowElement[];
    expect(headers()).toHaveLength(1); // la première page n'est que dans le groupe BROUILLON
    expect(headers()[0].textContent).toContain('250000 ligne(s)');

    // Replier BROUILLON : le serveur exclut ses 250 000 lignes, la page 1 commence donc par VALIDEE.
    const started = performance.now();
    fixture.componentInstance.collapseAllGroups();
    fixture.componentRef.setInput('rows', []); // tout est replié : aucune ligne
    await fixture.whenStable();
    const collapseMs = performance.now() - started;

    expect(headers().map((row) => row.getAttribute('aria-expanded'))).toEqual(['false', 'false', 'false', 'false']);
    expect(renderedRows(fixture)).toHaveLength(0);
    report(`repli de 4 groupes de 250 000 lignes : ${collapseMs.toFixed(1)} ms`);
    expect(collapseMs).toBeLessThan(500);
  });
});
