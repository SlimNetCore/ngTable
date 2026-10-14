import {describe, expect, it} from 'vitest';
import type {NgTableColumn} from './ng-table.component';
import {IncrementalPipeline, PipelineConfig, RowStore} from './live-rows';
import {sortRows} from './row-pipeline';

interface Quote {
  id: number;
  symbol: string;
  price: number | null;
}

const keyOf = (q: Quote) => q.id;
const collator = new Intl.Collator('fr', {numeric: true});
const price: NgTableColumn<Quote> = {id: 'price', header: 'Prix', valueAccessor: (q) => q.price};
const symbol: NgTableColumn<Quote> = {id: 'symbol', header: 'Symbole', valueAccessor: (q) => q.symbol};

function config(overrides: Partial<PipelineConfig<Quote>> = {}): PipelineConfig<Quote> {
  return {matches: () => true, levels: [{column: price, factor: -1}], collator, deps: [], ...overrides};
}

/** Résultat de référence : filtrer puis trier tout, comme le pipeline non incrémental. */
function reference(rows: readonly Quote[], cfg: PipelineConfig<Quote>): number[] {
  return sortRows(rows.filter(cfg.matches), cfg.levels, collator).map(keyOf);
}

/** Générateur pseudo-aléatoire déterministe (tests reproductibles). */
function random(seed: number): () => number {
  return () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
}

describe('live-rows', () => {
  describe('RowStore', () => {
    it('replaceAll : ne signale que les lignes dont l’objet a changé', () => {
      const store = new RowStore(keyOf);
      const a = {id: 1, symbol: 'A', price: 10};
      const b = {id: 2, symbol: 'B', price: 20};
      store.replaceAll([a, b]);
      store.drain();

      const b2 = {...b, price: 21};
      const updates = store.replaceAll([a, b2]);

      expect(updates).toEqual([{key: 2, previous: b, current: b2}]);
      expect(store.drain()).toEqual({reset: false, keys: new Set([2])});
      expect(store.rows()).toEqual([a, b2]);
    });

    it('replaceAll : un ordre différent ou une insertion au milieu demande un recalcul complet', () => {
      const store = new RowStore(keyOf);
      const [a, b, c] = [1, 2, 3].map((id) => ({id, symbol: `${id}`, price: id}));
      store.replaceAll([a, b]);
      store.drain();

      store.replaceAll([b, a]);
      expect(store.drain().reset).toBe(true);

      store.replaceAll([b, c, a]);
      expect(store.drain().reset).toBe(true);
      expect(store.rows()).toEqual([b, c, a]);
    });

    it('applyTransaction : ajoute à la fin, met à jour sur place, retire par clé', () => {
      const store = new RowStore(keyOf);
      const [a, b] = [1, 2].map((id) => ({id, symbol: `${id}`, price: id}));
      store.replaceAll([a, b]);

      const a2 = {...a, price: 99};
      const c = {id: 3, symbol: '3', price: 3};
      const {result, updates} = store.applyTransaction({update: [a2, {id: 42, symbol: '?', price: 0}], add: [c], remove: [{id: 2} as Quote]});

      expect(result).toEqual({add: [c], update: [a2], remove: [b]}); // la clé 42 inconnue est ignorée
      expect(updates).toEqual([{key: 1, previous: a, current: a2}]);
      expect(store.rows()).toEqual([a2, c]);
    });
  });

  describe('IncrementalPipeline', () => {
    it('fusionne une mise à jour au lieu de tout recalculer', () => {
      const store = new RowStore(keyOf);
      const pipeline = new IncrementalPipeline(keyOf);
      const rows = [1, 2, 3, 4].map((id) => ({id, symbol: `${id}`, price: id * 10}));
      store.replaceAll(rows);
      const cfg = config();
      expect(pipeline.compute(store, cfg).map(keyOf)).toEqual([4, 3, 2, 1]);

      store.applyTransaction({update: [{...rows[0], price: 35}]});
      expect(pipeline.compute(store, cfg).map(keyOf)).toEqual([4, 1, 3, 2]);
      expect(pipeline.stats).toEqual({rebuilds: 1, merges: 1});
    });

    it('recalcule tout quand la configuration change', () => {
      const store = new RowStore(keyOf);
      const pipeline = new IncrementalPipeline(keyOf);
      store.replaceAll([{id: 1, symbol: 'B', price: 1}, {id: 2, symbol: 'A', price: 2}]);
      pipeline.compute(store, config({deps: ['prix']}));

      const bySymbol = config({levels: [{column: symbol, factor: 1}], deps: ['symbole']});
      expect(pipeline.compute(store, bySymbol).map(keyOf)).toEqual([2, 1]);
      expect(pipeline.stats.rebuilds).toBe(2);
    });

    it('donne exactement le même résultat qu’un recalcul complet, sur 500 lots aléatoires', () => {
      const next = random(42);
      const store = new RowStore(keyOf);
      const pipeline = new IncrementalPipeline(keyOf);
      // Filtre et tri sur le prix, avec des égalités et des prix vides pour éprouver le départage.
      const cfg = config({matches: (q) => q.price === null || q.price % 7 !== 0});
      let rows: Quote[] = Array.from({length: 300}, (_, id) => ({id, symbol: `S${id}`, price: Math.floor(next() * 50)}));
      let nextId = rows.length;
      store.replaceAll(rows);
      pipeline.compute(store, cfg);

      for (let batch = 0; batch < 500; batch++) {
        const update: Quote[] = [];
        const remove: Quote[] = [];
        const add: Quote[] = [];
        for (let k = 0; k < 1 + Math.floor(next() * 8); k++) {
          const target = rows[Math.floor(next() * rows.length)];
          const roll = next();
          if (roll < 0.7) {
            update.push({...target, price: next() < 0.1 ? null : Math.floor(next() * 50)});
          } else if (roll < 0.85) {
            remove.push(target);
          } else {
            add.push({id: nextId++, symbol: `S${nextId}`, price: Math.floor(next() * 50)});
          }
        }
        // Moitié en transactions, moitié en tableau complet (données immuables).
        if (batch % 2 === 0) {
          store.applyTransaction({update, remove, add});
        } else {
          const byId = new Map(rows.map((row) => [row.id, row]));
          update.forEach((row) => byId.has(row.id) && byId.set(row.id, row));
          remove.forEach((row) => byId.delete(row.id));
          add.forEach((row) => byId.set(row.id, row));
          store.replaceAll([...byId.values()]);
        }
        rows = store.rows();
        expect(pipeline.compute(store, cfg).map(keyOf)).toEqual(reference(rows, cfg));
      }
      expect(pipeline.stats.merges).toBeGreaterThan(400);
    });
  });
});
