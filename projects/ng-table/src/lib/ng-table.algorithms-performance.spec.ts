import {describe, expect, it} from 'vitest';
import {buildChartLayout} from './chart';
import {matchesSearchTerms, searchTerms} from './filter-matching';
import {searchText} from './row-pipeline';
import {computePivot} from './pivot';
import {IncrementalPipeline, RowStore} from './live-rows';
import {buildTreeIndex, layoutTree, withAncestors} from './tree-data';
import type {NgTableColumn} from './ng-table.component';
import {compileFilters} from './filter-compile';
import type {SortLevel} from './row-pipeline';

/**
 * Mesures des algorithmes sur de gros volumes. Les temps s'affichent avec
 * `[perf]` ; les seuils sont larges (machines lentes, CI) et ne servent qu'à repérer une régression grave.
 */
interface Row {
  id: number;
  ref: string;
  client: string;
  statut: string;
  montant: number;
  date: string;
  actif: boolean;
}

/** 200 000 lignes par défaut (rapide en intégration continue) ; `PERF_ROWS=1000000` pour un million. */
const N = Number((globalThis as {process?: {env?: Record<string, string | undefined>}}).process?.env?.['PERF_ROWS']) || 200_000;
const CLIENTS = Array.from({length: 500}, (_, i) => `Client ${String(i).padStart(3, '0')}`);
const STATUTS = ['Brouillon', 'Validée', 'Expédiée', 'Annulée'];

const ROWS: Row[] = Array.from({length: N}, (_, i) => ({
  id: i,
  ref: `CMD-${String((i * 7919) % N).padStart(7, '0')}`,
  client: CLIENTS[(i * 31) % CLIENTS.length],
  statut: STATUTS[i % 4],
  montant: ((i * 7919) % 100_000) / 10,
  date: `2026-${String((i % 12) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`,
  actif: i % 3 === 0,
}));

const col = (id: string, accessor: (r: Row) => unknown, extra: Partial<NgTableColumn<Row>> = {}): NgTableColumn<Row> => ({
  id,
  header: id,
  valueAccessor: accessor,
  ...extra,
});

const COLUMNS: NgTableColumn<Row>[] = [
  col('ref', (r) => r.ref, {filter: {type: 'text'}}),
  col('client', (r) => r.client, {filter: {type: 'text'}}),
  col('statut', (r) => r.statut, {filter: {type: 'enum'}}),
  col('montant', (r) => r.montant, {filter: {type: 'number'}}),
  col('date', (r) => r.date, {filter: {type: 'range'}}),
  col('actif', (r) => r.actif, {filter: {type: 'boolean'}}),
];
const by = (id: string) => COLUMNS.find((c) => c.id === id)!;
const collator = new Intl.Collator(undefined, {numeric: true, sensitivity: 'base'});

const time = <V>(label: string, run: () => V): {ms: number; value: V} => {
  const start = performance.now();
  const value = run();
  const ms = performance.now() - start;
  (globalThis as {process?: {stdout?: {write(text: string): void}}}).process?.stdout?.write(`[perf] ${label} : ${ms.toFixed(0)} ms\n`);
  return {ms, value};
};

const compute = (config: {filters?: Record<string, string>; sorts?: {id: string; desc?: boolean}[]}) => {
  const store = new RowStore<Row>((r) => r.id);
  store.replaceAll(ROWS);
  const pipeline = new IncrementalPipeline<Row>((r) => r.id);
  const filters = config.filters ?? {};
  const levels: SortLevel<Row>[] = (config.sorts ?? []).map((s) => ({column: by(s.id), factor: s.desc ? -1 : 1}));
  return pipeline.compute(store, {
    matches: compileFilters(COLUMNS, filters) ?? (() => true),
    levels,
    collator,
    sums: [],
    deps: [store, filters, levels],
  });
};

describe(`algorithmes sur ${N.toLocaleString('fr-FR')} lignes`, () => {
  it('tri', () => {
    const numeric = time('tri numérique (montant)', () => compute({sorts: [{id: 'montant'}]}));
    expect(numeric.value).toHaveLength(N);
    expect((numeric.value[0] as Row).montant).toBeLessThanOrEqual((numeric.value[N - 1] as Row).montant);
    time('tri numérique décroissant', () => compute({sorts: [{id: 'montant', desc: true}]}));
    const text = time('tri texte à forte cardinalité (ref, 1 M valeurs)', () => compute({sorts: [{id: 'ref'}]}));
    expect(text.ms).toBeLessThan(30_000);
    time('tri texte à faible cardinalité (statut)', () => compute({sorts: [{id: 'statut'}]}));
    time('tri sur deux niveaux (statut puis montant)', () => compute({sorts: [{id: 'statut'}, {id: 'montant', desc: true}]}));
    time('tri sur une date (chaîne ISO)', () => compute({sorts: [{id: 'date'}]}));
  }, 180_000);

  it('filtres', () => {
    const contains = time('filtre texte « contient » (client)', () => compute({filters: {client: 'client 12'}}));
    expect(contains.value.length).toBeGreaterThan(0);
    time('filtre numérique « >5000 »', () => compute({filters: {montant: '>5000'}}));
    time('filtre numérique « 100..2000 »', () => compute({filters: {montant: '100..2000'}}));
    time('filtre liste (statut = Validée,Annulée)', () => compute({filters: {statut: 'Validée,Annulée'}}));
    time('filtre période (date)', () => compute({filters: {date: '2026-03-01..2026-05-31'}}));
    time('filtre booléen', () => compute({filters: {actif: 'true'}}));
    time('trois filtres + tri', () => compute({filters: {client: '1', montant: '>1000', statut: 'Validée'}, sorts: [{id: 'montant'}]}));
  }, 180_000);

  it('recherche globale et graphique', () => {
    const terms = searchTerms('client 12 validée');
    const haystacks = time('recherche globale : texte normalisé de chaque ligne (6 colonnes)', () => ROWS.map((row) => searchText(row, COLUMNS)));
    const found = time('recherche globale : 3 mots sur toutes les lignes', () => haystacks.value.filter((text) => matchesSearchTerms(text, terms)));
    expect(found.value.length).toBeGreaterThan(0);

    const data = {
      categories: ROWS.map((row) => row.ref),
      series: [{name: 'Montant', values: ROWS.map((row) => row.montant)}],
    };
    const layout = time('graphique : courbe de toutes les lignes (pics gardés)', () => buildChartLayout(data, 'line', 320));
    expect(layout.value.lines[0].points.length).toBeLessThanOrEqual(600);
    time('graphique : barres de toutes les lignes', () => buildChartLayout(data, 'bar', 320));
    time('graphique : zoom sur 1 000 points', () => buildChartLayout(data, 'line', 320, {range: {start: 5000, end: 6000}}));
  }, 180_000);

  it('pivot et arbre', () => {
    const pivot = time('pivot 2 champs × 1 colonne × 1 valeur', () =>
      computePivot(ROWS, {
        rows: [
          {id: 'client', header: 'c', accessor: (r) => r.client},
          {id: 'date', header: 'd', accessor: (r) => r.date.slice(0, 7)},
        ],
        columns: {id: 'statut', header: 's', accessor: (r) => r.statut},
        values: [{id: 'montant', header: 'm', accessor: (r) => r.montant, aggregate: 'sum'}],
      }),
    );
    expect(pivot.value.rows.length).toBeGreaterThan(100);
    expect(pivot.ms).toBeLessThan(20_000);

    const nodes = ROWS.slice(0, 200_000);
    const index = time('arbre : index de 200 000 nœuds', () => buildTreeIndex(nodes, (r) => r.id, (r) => (r.id < 10 ? null : Math.floor(r.id / 10) - 1)));
    const visible = time('arbre : mise à plat tout déplié', () => layoutTree(nodes, (r) => r.id, index.value, () => true));
    expect(visible.value).toHaveLength(nodes.length);
    time('arbre : ancêtres de 20 000 correspondances', () => withAncestors(nodes.filter((r) => r.id % 10 === 0).map((r) => r.id), index.value));
  });
});
