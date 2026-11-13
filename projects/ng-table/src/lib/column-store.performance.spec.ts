import {describe, expect, it} from 'vitest';
import {ColumnStore} from './column-store';
import {compileFilters, compileIndexFilters, filtersNarrow} from './filter-compile';
import {IncrementalPipeline, RowStore} from './live-rows';
import type {SortLevel} from './row-pipeline';
import type {NgTableColumn} from './ng-table.component';

/**
 * Ce que rapporte le cache de colonnes : le même enchaînement d'actions (trier, inverser, filtrer en
 * restant trié, retrier, filtrer une colonne aux valeurs répétées, prolonger une saisie) avec et sans `columnStore`,
 * dictionnaires et filtre plus strict compris. Les temps s'affichent avec `[perf]`.
 */
interface Row {
  id: number;
  ref: string;
  client: string;
  montant: number;
}

/** 200 000 lignes par défaut ; `PERF_ROWS=1000000` pour un million. */
const N = Number((globalThis as {process?: {env?: Record<string, string | undefined>}}).process?.env?.['PERF_ROWS']) || 200_000;
const ROWS: Row[] = Array.from({length: N}, (_, i) => ({
  id: i,
  ref: `CMD-${String((i * 7919) % N).padStart(7, '0')}`,
  client: `Client ${String((i * 31) % 500).padStart(3, '0')}`,
  montant: ((i * 7919) % 100_000) / 10,
}));
const COLUMNS: NgTableColumn<Row>[] = [
  {id: 'ref', header: 'ref', valueAccessor: (r) => r.ref, filter: {type: 'text'}},
  {id: 'client', header: 'client', valueAccessor: (r) => r.client, filter: {type: 'text'}},
  {id: 'montant', header: 'montant', valueAccessor: (r) => r.montant, filter: {type: 'number'}},
];
const by = (id: string) => COLUMNS.find((c) => c.id === id)!;
const collator = new Intl.Collator(undefined, {numeric: true, sensitivity: 'base'});

const STEPS: {label: string; filters?: Record<string, string>; sorts: {id: string; desc?: boolean}[]}[] = [
  {label: 'tri texte (ref), première fois', sorts: [{id: 'ref'}]},
  {label: 'inversion du sens', sorts: [{id: 'ref', desc: true}]},
  {label: 'filtre « >2000 » en restant trié', filters: {montant: '>2000'}, sorts: [{id: 'ref', desc: true}]},
  {label: 'filtre retiré', sorts: [{id: 'ref', desc: true}]},
  {label: 'tri numérique (montant), première fois', sorts: [{id: 'montant'}]},
  {label: 'tri numérique inversé', sorts: [{id: 'montant', desc: true}]},
  {label: 'retour au tri texte', sorts: [{id: 'ref'}]},
  {label: 'deux niveaux (client puis montant)', sorts: [{id: 'client'}, {id: 'montant', desc: true}]},
  {label: 'deux niveaux, second inversé', sorts: [{id: 'client'}, {id: 'montant'}]},
  {label: 'filtre texte sur 500 valeurs répétées (client), première fois', filters: {client: 'client 1'}, sorts: []},
  {label: 'autre saisie sur la même colonne', filters: {client: 'client 2'}, sorts: []},
  {label: 'saisie prolongée (« client 2 » → « client 23 »)', filters: {client: 'client 23'}, sorts: []},
  {label: 'tri texte + filtre « cmd-00 »', filters: {ref: 'cmd-00'}, sorts: [{id: 'ref'}]},
  {label: 'saisie prolongée sous le tri (« cmd-00 » → « cmd-001 »)', filters: {ref: 'cmd-001'}, sorts: [{id: 'ref'}]},
];
const SORTS = new Map<string, unknown>();
/** Même objet pour un même tri d'une étape à l'autre, comme le signal `sorts` du composant. */
const sortsToken = (sorts: {id: string; desc?: boolean}[]): unknown => {
  const key = JSON.stringify(sorts);
  if (!SORTS.has(key)) {
    SORTS.set(key, sorts);
  }
  return SORTS.get(key);
};

function play(columnStore: ColumnStore<Row> | undefined): {times: number[]; ids: number[][]} {
  const store = new RowStore<Row>((r) => r.id);
  store.replaceAll(ROWS);
  const pipeline = new IncrementalPipeline<Row>();
  const times: number[] = [];
  const ids: number[][] = [];
  for (const step of STEPS) {
    const filters = step.filters ?? {};
    const levels: SortLevel<Row>[] = step.sorts.map((s) => ({column: by(s.id), factor: s.desc ? -1 : 1}));
    const start = performance.now();
    const result = pipeline.compute(store, {
      matches: compileFilters(COLUMNS, filters) ?? (() => true),
      levels,
      collator,
      columnStore,
      matchesAt: columnStore
        ? (all) => compileIndexFilters(all, COLUMNS, filters, (column) => columnStore.dictionary(all, column)) ?? (() => true)
        : undefined,
      narrowing: columnStore
        ? {
            base: [store, sortsToken(step.sorts)],
            state: filters,
            narrows: (previous: Record<string, string>) => filtersNarrow(COLUMNS, previous, filters),
          }
        : undefined,
      deps: [step],
    });
    times.push(performance.now() - start);
    ids.push([result.length, result[0].id, result[result.length >> 1].id, result[result.length - 1].id]);
  }
  if (columnStore) {
    expect(pipeline.stats.narrows, 'filtre plus strict appliqué au résultat précédent').toBe(1);
  }
  return {times, ids};
}

describe(`cache de colonnes sur ${N.toLocaleString('fr-FR')} lignes`, () => {
  it('même résultat, et les tris suivants ne relisent plus les valeurs', () => {
    play(undefined); // mise en température du moteur JavaScript
    // Médiane de 5 passages : un passage isolé varie beaucoup (ramasse-miettes).
    const median = (runs: {times: number[]; ids: number[][]}[]) => ({
      ids: runs[0].ids,
      times: STEPS.map((_, i) => runs.map((run) => run.times[i]).sort((x, y) => x - y)[runs.length >> 1]),
    });
    const without = median(Array.from({length: 5}, () => play(undefined)));
    const withStore = median(Array.from({length: 5}, () => play(new ColumnStore<Row>())));
    const write = (text: string) => (globalThis as {process?: {stdout?: {write(text: string): void}}}).process?.stdout?.write(`[perf] ${text}\n`);
    STEPS.forEach((step, i) => write(`${step.label} : ${without.times[i].toFixed(0)} ms sans cache, ${withStore.times[i].toFixed(0)} ms avec`));
    expect(withStore.ids).toEqual(without.ids);
  }, 300_000);
});
