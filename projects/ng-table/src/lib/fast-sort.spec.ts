import {describe, expect, it} from 'vitest';
import {buildSortOrder, radixSortByKeys, sortRowsFast} from './fast-sort';
import {sortRows} from './row-pipeline';
import type {SortLevel} from './row-pipeline';
import type {NgTableColumn} from './ng-table.component';

interface Row {
  id: number;
  v: unknown;
  w: unknown;
}

const collator = new Intl.Collator(undefined, {numeric: true, sensitivity: 'base'});
const column = (id: 'v' | 'w'): NgTableColumn<Row> => ({id, header: id, valueAccessor: (r) => r[id]});
const level = (id: 'v' | 'w', factor = 1): SortLevel<Row> => ({column: column(id), factor});
const ids = (rows: Row[]) => rows.map((r) => r.id).join(',');

const random = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);

describe('fast-sort', () => {
  describe('radixSortByKeys', () => {
    it('trie des nombres de tout signe et de toute taille, de façon stable', () => {
      // (-0 est ramené à 0 avant le tri par `sortKeyColumn`.)
      const keys = Float64Array.from([3, -1, 0, 1e300, -1e300, 2.5, -2.5, 3, 1e-300, -1e-300, Infinity, 7]);
      const order = radixSortByKeys(Uint32Array.from(keys.keys()), keys);
      const sortedKeys = [...order].map((i) => keys[i]);
      expect(sortedKeys).toEqual([...keys].sort((a, b) => a - b));
      // Stabilité : les deux 3 gardent leur ordre d'origine.
      expect([...order].filter((i) => keys[i] === 3)).toEqual([0, 7]);
    });

    it('même résultat qu’Array.sort sur 50 000 nombres tirés au hasard', () => {
      const next = random(1);
      const keys = Float64Array.from({length: 50_000}, () => (next() - 0.5) * Math.pow(10, Math.floor(next() * 12)));
      const order = radixSortByKeys(Uint32Array.from(keys.keys()), keys);
      const expected = [...keys.keys()].sort((a, b) => keys[a] - keys[b] || a - b);
      expect([...order]).toEqual(expected);
    });
  });

  describe('sortRowsFast comme sortRows', () => {
    const rows = (values: [unknown, unknown?][]): Row[] => values.map(([v, w], id) => ({id, v, w}));
    const same = (data: Row[], levels: SortLevel<Row>[]) => {
      const fast = sortRowsFast(data, levels, collator);
      expect(fast, 'chemin rapide attendu').not.toBeNull();
      expect(ids(fast!)).toBe(ids(sortRows(data, levels, collator)));
    };

    it('nombres, vides en dernier dans les deux sens, égalités dans l’ordre d’origine', () => {
      const data = rows([[5], [null], [1], [5], [undefined], [-3], [0], [-0]]);
      same(data, [level('v')]);
      same(data, [level('v', -1)]);
    });

    it('booléens et dates', () => {
      same(rows([[true], [false], [true], [null], [false]]), [level('v')]);
      same(rows([[new Date(2026, 3, 1)], [new Date(2025, 0, 1)], [null], [new Date(2026, 3, 1)]]), [level('v', -1)]);
    });

    it('textes : casse ignorée, chiffres par valeur, accents', () => {
      const data = rows([['b'], ['A'], ['a'], ['CMD-10'], ['cmd-9'], ['é'], ['e'], [''], [null], ['cmd-09'], ['x y'], ['x-y']]);
      same(data, [level('v')]);
      same(data, [level('v', -1)]);
    });

    it('plusieurs niveaux', () => {
      const data = rows([['a', 3], ['b', 1], ['a', 1], ['b', 2], ['a', null], [null, 5], ['A', 3]]);
      same(data, [level('v'), level('w', -1)]);
      same(data, [level('v', -1), level('w')]);
    });

    it('aléatoire : mêmes résultats que sortRows sur 3 000 lignes de texte, nombres et vides', () => {
      const next = random(9);
      const words = ['alpha', 'Alpha', 'beta', 'CMD-1', 'CMD-02', 'cmd-10', 'x', '', 'é', 'Z9', 'z10'];
      const data = Array.from({length: 3000}, (_, id): Row => ({
        id,
        v: next() < 0.1 ? null : words[Math.floor(next() * words.length)],
        w: next() < 0.1 ? null : Math.floor(next() * 20) - 5,
      }));
      same(data, [level('v')]);
      same(data, [level('w', -1), level('v')]);
    });

    it('beaucoup de valeurs distinctes (clés de tri) : mêmes résultats que sortRows, doublons et casse compris', () => {
      const next = random(21);
      const pool = 'abcXYZ019-_ .#';
      const make = () => Array.from({length: 1 + Math.floor(next() * 10)}, () => pool[Math.floor(next() * pool.length)]).join('');
      const data = Array.from({length: 6000}, (_, id): Row => ({
        id,
        v: next() < 0.05 ? null : make(),
        w: next() < 0.2 ? 'CMD-' + String(Math.floor(next() * 500)).padStart(Math.floor(next() * 6) + 1, '0') : make().toUpperCase(),
      }));
      same(data, [level('v')]);
      same(data, [level('w', -1)]);
      same(data, [level('w'), level('v', -1)]);
    });

    it('un texte non ASCII dans une colonne à forte cardinalité : repli sur le collateur, même résultat', () => {
      const data = Array.from({length: 3000}, (_, id): Row => ({id, v: id % 500 === 0 ? `é${id}` : `ref-${(id * 7919) % 3000}`, w: null}));
      same(data, [level('v')]);
    });

    it('types mêlés ou NaN : pas de chemin rapide, le tri générique prend le relais', () => {
      expect(buildSortOrder(rows([[1], ['a']]), [level('v')], collator)).toBeNull();
      expect(buildSortOrder(rows([[1], [NaN]]), [level('v')], collator)).toBeNull();
      expect(buildSortOrder(rows([[new Date(NaN)], [new Date(2026, 0, 1)]]), [level('v')], collator)).toBeNull();
    });

    it('sans niveau ou avec 0 / 1 ligne, ordre d’origine', () => {
      expect([...buildSortOrder(rows([[3], [1]]), [], collator)!]).toEqual([0, 1]);
      expect(sortRowsFast([], [level('v')], collator)).toEqual([]);
    });
  });
});
