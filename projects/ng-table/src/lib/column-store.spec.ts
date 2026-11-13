import {describe, expect, it} from 'vitest';
import {ColumnStore} from './column-store';
import {radixSortByDigits, sortDigits} from './fast-sort';
import {IncrementalPipeline, PipelineConfig, RowStore} from './live-rows';
import {sortRows} from './row-pipeline';
import type {SortLevel} from './row-pipeline';
import type {NgTableColumn} from './ng-table.component';

interface Row {
  id: number;
  n: number | null;
  s: string | null;
  d: Date | null;
  b: boolean | null;
  mixed: unknown;
}

const collator = new Intl.Collator(undefined, {numeric: true, sensitivity: 'base'});
const column = (id: keyof Row): NgTableColumn<Row> => ({id, header: id, valueAccessor: (r) => r[id]});
const COLUMNS = {n: column('n'), s: column('s'), d: column('d'), b: column('b'), mixed: column('mixed')};
const keyOf = (r: Row) => r.id;

const random = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);

function makeRows(count: number, seed: number): Row[] {
  const next = random(seed);
  const maybe = <V>(value: V): V | null => (next() < 0.1 ? null : value);
  return Array.from({length: count}, (_, id) => ({
    id,
    // Peu de valeurs distinctes : beaucoup d'égalités, donc le départage par l'ordre d'origine est éprouvé.
    n: maybe(Math.floor(next() * 40) - 20),
    s: maybe(['Alpha', 'alpha', 'Bêta', 'beta 10', 'beta 9', 'Gamma', 'élan', 'Zed'][Math.floor(next() * 8)]),
    d: maybe(new Date(2026, Math.floor(next() * 6), 1)),
    b: maybe(next() < 0.5),
    mixed: next() < 0.5 ? Math.floor(next() * 5) : `t${Math.floor(next() * 5)}`,
  }));
}

describe('column-store', () => {
  describe('radixSortByDigits', () => {
    it('sens décroissant sur les chiffres du sens croissant : vides en dernier, égalités dans l’ordre reçu', () => {
      const keys = Float64Array.from([3, Infinity, -1, 0, 3, 1e300, -1e300, Infinity, 2.5, 0]);
      const order = radixSortByDigits(Uint32Array.from(keys.keys()), sortDigits(keys), true);
      expect([...order]).toEqual([5, 0, 4, 8, 3, 9, 2, 6, 1, 7]);
    });

    it('ne trie que les indices reçus', () => {
      const keys = Float64Array.from([5, 1, 4, 2, 3]);
      const digits = sortDigits(keys);
      expect([...radixSortByDigits(Uint32Array.from([0, 2, 4]), digits, false)]).toEqual([4, 2, 0]);
      expect([...radixSortByDigits(Uint32Array.from([0, 2, 4]), digits, true)]).toEqual([0, 2, 4]);
      expect([...radixSortByDigits(Uint32Array.from([]), digits, true)]).toEqual([]);
    });

    it('même résultat qu’Array.sort dans les deux sens sur 20 000 nombres tirés au hasard', () => {
      const next = random(7);
      const keys = Float64Array.from({length: 20_000}, () =>
        next() < 0.05 ? Infinity : Math.round((next() - 0.5) * Math.pow(10, Math.floor(next() * 8))) + 0,
      );
      const digits = sortDigits(keys);
      const empty = (i: number) => keys[i] === Infinity;
      for (const descending of [false, true]) {
        const sign = descending ? -1 : 1;
        const expected = [...keys.keys()].sort((a, b) => Number(empty(a)) - Number(empty(b)) || (empty(a) ? 0 : sign * (keys[a] - keys[b])) || a - b);
        expect([...radixSortByDigits(Uint32Array.from(keys.keys()), digits, descending)]).toEqual(expected);
      }
    });
  });

  describe('ColumnStore', () => {
    it('ne lit les valeurs qu’une fois par jeu de lignes', () => {
      let reads = 0;
      const counted: NgTableColumn<Row> = {id: 'n', header: 'n', valueAccessor: (r) => (reads++, r.n)};
      const rows = makeRows(100, 1);
      const store = new ColumnStore<Row>();
      const first = store.sortDigits(rows, counted, collator);
      expect(reads).toBe(100);
      expect(store.sortDigits(rows, counted, collator)).toBe(first);
      expect(reads).toBe(100);
      expect(store.stats).toEqual({builds: 1, hits: 1});

      // Nouveau tableau de lignes : le cache est vidé.
      store.sortDigits([...rows], counted, collator);
      expect(reads).toBe(200);
    });

    it('retient qu’une colonne ne se range pas en nombres', () => {
      const rows = makeRows(50, 2);
      const store = new ColumnStore<Row>();
      expect(store.sortDigits(rows, COLUMNS.mixed, collator)).toBeNull();
      expect(store.has(rows, COLUMNS.mixed, collator)).toBe(true);
      expect(store.sortDigits(rows, COLUMNS.mixed, collator)).toBeNull();
      expect(store.stats.builds).toBe(1);
    });

    it('écarte la colonne la moins récemment utilisée au-delà de 8', () => {
      const rows = makeRows(10, 3);
      const store = new ColumnStore<Row>();
      const columns = Array.from({length: 9}, () => column('n'));
      for (const each of columns.slice(0, 8)) {
        store.sortDigits(rows, each, collator);
      }
      store.sortDigits(rows, columns[0], collator); // relue : devient la plus récente
      store.sortDigits(rows, columns[8], collator);
      expect(store.has(rows, columns[0], collator)).toBe(true);
      expect(store.has(rows, columns[1], collator)).toBe(false);
    });
  });

  describe('pipeline avec colonnes en cache', () => {
    const run = (rows: Row[], configs: {levels: SortLevel<Row>[]; matches: (r: Row) => boolean}[]) => {
      const store = new RowStore(keyOf);
      store.replaceAll(rows);
      const pipeline = new IncrementalPipeline<Row>();
      const columnStore = new ColumnStore<Row>();
      for (const [index, {levels, matches}] of configs.entries()) {
        const config: PipelineConfig<Row> = {matches, levels, collator, columnStore, deps: [index]};
        const expected = sortRows(rows.filter(matches), levels, collator).map(keyOf);
        expect(pipeline.compute(store, config).map(keyOf), `configuration ${index}`).toEqual(expected);
      }
      return columnStore;
    };

    it('même résultat que le tri de référence sur 150 configurations aléatoires', () => {
      const next = random(11);
      const rows = makeRows(2000, 5);
      const ids = Object.keys(COLUMNS) as (keyof typeof COLUMNS)[];
      const configs = Array.from({length: 150}, () => {
        const levels: SortLevel<Row>[] = Array.from({length: 1 + Math.floor(next() * 3)}, () => ({
          column: COLUMNS[ids[Math.floor(next() * ids.length)]],
          factor: next() < 0.5 ? -1 : 1,
        }));
        // De « tout » à « presque rien » : les deux chemins (colonnes en cache, lignes retenues seules) sont pris.
        const modulo = [1, 1, 2, 3, 50, 1000][Math.floor(next() * 6)];
        const offset = Math.floor(next() * modulo);
        return {levels, matches: (r: Row) => r.id % modulo === offset};
      });
      const columnStore = run(rows, configs);
      expect(columnStore.stats.hits).toBeGreaterThan(50);
      expect(columnStore.stats.builds).toBeLessThanOrEqual(5);
    }, 60_000);

    it('inverser le sens ne relit pas les valeurs', () => {
      let reads = 0;
      const counted: NgTableColumn<Row> = {id: 's', header: 's', valueAccessor: (r) => (reads++, r.s)};
      const rows = makeRows(500, 9);
      const store = new RowStore(keyOf);
      store.replaceAll(rows);
      const pipeline = new IncrementalPipeline<Row>();
      const columnStore = new ColumnStore<Row>();
      const base = {matches: () => true, collator, columnStore};
      pipeline.compute(store, {...base, levels: [{column: counted, factor: 1}], deps: ['asc']});
      expect(reads).toBe(500);
      const afterFirst = reads;
      const descending = pipeline.compute(store, {...base, levels: [{column: counted, factor: -1}], deps: ['desc']});
      expect(reads).toBe(afterFirst);
      expect(descending.map(keyOf)).toEqual(sortRows(rows, [{column: counted, factor: -1}], collator).map(keyOf));
    });

    it('ne construit pas une colonne entière pour quelques lignes retenues', () => {
      const rows = makeRows(1000, 4);
      const columnStore = run(rows, [{levels: [{column: COLUMNS.n, factor: 1}], matches: (r) => r.id < 20}]);
      expect(columnStore.stats.builds).toBe(0);
    });

    it('une transaction donne un nouveau jeu de lignes : la colonne est relue', () => {
      const rows = makeRows(200, 6);
      const store = new RowStore(keyOf);
      store.replaceAll(rows);
      const pipeline = new IncrementalPipeline<Row>();
      const columnStore = new ColumnStore<Row>();
      const levels = [{column: COLUMNS.n, factor: 1}];
      pipeline.compute(store, {matches: () => true, levels, collator, columnStore, deps: [1]});
      store.applyTransaction({update: [{...rows[0], n: 999}]});
      pipeline.compute(store, {matches: () => true, levels, collator, columnStore, deps: [1]}); // fusion
      const result = pipeline.compute(store, {matches: () => true, levels, collator, columnStore, deps: [2]}); // recalcul
      expect(result[result.filter((r) => r.n !== null).length - 1].id).toBe(0);
      expect(columnStore.stats.builds).toBe(2);
    });
  });
});
