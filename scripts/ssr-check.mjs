/**
 * Rendu côté serveur (SSR) : rend la table avec `@angular/platform-server` dans Node, SANS aucun navigateur simulé
 * (pas de `window`, pas de `document` global, pas de `ResizeObserver`, pas de `Worker`), à partir du paquet construit
 * (`dist/ng-table`), comme le ferait le serveur d'une application.
 *
 * Les tests unitaires tournent sous jsdom, où `window` existe : ils ne peuvent pas attraper un accès oublié à un
 * objet du navigateur. Ce script, si.
 *
 * Usage : `npm run build` puis `node scripts/ssr-check.mjs` (ou `npm run ssr:check`).
 */
import '@angular/compiler';
import {Component, provideZonelessChangeDetection} from '@angular/core';
import {bootstrapApplication} from '@angular/platform-browser';
import {provideServerRendering, renderApplication} from '@angular/platform-server';
import {existsSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const bundle = join(root, 'dist', 'ng-table', 'fesm2022', 'sbourahla-ng-table.mjs');
if (!existsSync(bundle)) {
  console.error('ssr-check : dist/ng-table est absent. Lancez `npm run build` d’abord.');
  process.exit(1);
}
if (typeof window !== 'undefined' || typeof document !== 'undefined') {
  console.error('ssr-check : un `window` ou un `document` global existe, le contrôle ne prouverait rien.');
  process.exit(1);
}
const {NgTableComponent, NgTableFilterBuilderComponent, NgTablePivotComponent} = await import(pathToFileURL(bundle).href);

const ROWS = Array.from({length: 30}, (_, i) => ({id: `${i + 1}`, client: `Client ${i + 1}`, montant: (i + 1) * 100, statut: i % 2 ? 'Validée' : 'Brouillon'}));
const COLUMNS = [
  {id: 'client', header: 'Client', valueAccessor: (r) => r.client, sortable: true, filter: {type: 'text'}, cell: {type: 'avatar'}},
  {id: 'montant', header: 'Montant', valueAccessor: (r) => r.montant, sortable: true, aggregate: 'sum', cell: {type: 'dataBar'}},
  {id: 'statut', header: 'Statut', valueAccessor: (r) => r.statut, cell: {type: 'badge', tone: {Validée: 'success'}}},
];

class Host {
  rows = ROWS;
  columns = COLUMNS;
  marker = (row) => (row.montant > 2500 ? 'danger' : null);
  filter = {operator: 'and', children: [{columnId: 'montant', value: '>500'}]};
  pivot = {
    rows: [{id: 'statut', header: 'Statut', accessor: (r) => r.statut}],
    values: [{id: 'montant', header: 'Montant', accessor: (r) => r.montant}],
  };
}

const CASES = [
  {
    name: 'table paginée, totaux, recherche',
    template: `<ng-table [columns]="columns" [rows]="rows" [paginator]="true" [pageSize]="10" [showTotals]="true" [globalSearchEnabled]="true"/>`,
    expect: ['Client 1', 'Client 10', 'ngt-badge', 'data-row'],
    reject: ['Client 11'],
  },
  {
    name: 'options liées au navigateur (défilement virtuel, groupes collants, repères, plage, animation, worker demandé)',
    template: `<ng-table [columns]="columns" [rows]="rows" [virtualScroll]="true" [groupBy]="'statut'" [stickyGroupHeaders]="true"
      [scrollMarkers]="true" [rowMarker]="marker" [rangeSelection]="true" [fillHandle]="true" [animateRows]="true" [highlightSearch]="true"
      [workerCompute]="true" [workerThreshold]="1" [rowSelectionEnabled]="true" [cellNavigation]="true" [advancedFilter]="filter"/>`,
    expect: ['group-row', 'ngt-scroll-marker', 'Client'],
    reject: [],
  },
  {
    name: 'constructeur de filtres avancés',
    template: `<ng-table-filter-builder [columns]="columns" [filter]="filter"/>`,
    expect: ['ngt-fb__condition', '&gt;500'],
    reject: [],
  },
  {
    name: 'pivot (worker demandé)',
    template: `<ng-table-pivot [rows]="rows" [config]="pivot" [workerCompute]="true" [workerThreshold]="1"/>`,
    expect: ['Brouillon', 'Validée'],
    reject: [],
  },
];

let failures = 0;
for (const test of CASES) {
  const HostComponent = Component({
    selector: 'app-ssr-host',
    imports: [NgTableComponent, NgTableFilterBuilderComponent, NgTablePivotComponent],
    template: test.template,
  })(class extends Host {});
  try {
    const html = await renderApplication(
      (context) => bootstrapApplication(HostComponent, {providers: [provideServerRendering(), provideZonelessChangeDetection()]}, context),
      {document: '<!doctype html><html lang="fr"><head></head><body><app-ssr-host></app-ssr-host></body></html>', url: '/'},
    );
    const missing = test.expect.filter((text) => !html.includes(text));
    const unexpected = test.reject.filter((text) => html.includes(text));
    if (missing.length > 0 || unexpected.length > 0) {
      failures++;
      console.error(`ÉCHEC  ${test.name} : absent du HTML ${JSON.stringify(missing)}, présent à tort ${JSON.stringify(unexpected)}`);
    } else {
      console.log(`ok     ${test.name} (${Math.round(html.length / 1024)} ko de HTML)`);
    }
  } catch (error) {
    failures++;
    console.error(`ÉCHEC  ${test.name} : ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`);
  }
}
if (failures > 0) {
  console.error(`ssr-check : ${failures} cas en échec.`);
  process.exit(1);
}
console.log('ssr-check : la table se rend côté serveur, sans navigateur.');
