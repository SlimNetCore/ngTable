import {describe, expect, it} from 'vitest';
import {compileColumnFilter, compileFilters} from './filter-compile';
import {matchesColumnFilter, matchesAllFilters} from './row-pipeline';
import type {NgTableColumn} from './ng-table.component';

interface Row {
  v: unknown;
}

/** Générateur pseudo-aléatoire déterministe : un échec se rejoue à l'identique. */
const random = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};

const VALUES: unknown[] = [
  null, undefined, '', 'abc', 'Validée', 'validée', 'BROUILLON', '12', '12,5', ' 7 ', 'x1', 0, -0, 5, 12, 12.5, -3, 1e6, NaN, Infinity,
  true, false, '2026-03-05', '2026-03-05T10:00:00Z', new Date(2026, 2, 5), new Date(NaN), '5 mars 2026', 'CMD-0042',
];

const FILTERS = [
  'abc', 'ABC', 'val', 'Validée', 'Validée,BROUILLON', 'a, b ,Validée', '12', '=12', '!=12', '>5', '>=5', '<5', '<=5', ' > 5 ', '>x', '>',
  '10..50', '..50', '10..', '..', '12,5', '1e6', 'true', 'false', '1', '0', '2026-03-05', '2026-03-01..2026-03-31', '..2026-03-05',
  '2026-03-05..', 'pas une date', '2026-13-45', 'CMD', '-3',
];

const COLUMNS: NgTableColumn<Row>[] = [
  {id: 't', header: 't', valueAccessor: (r) => r.v},
  {id: 'tc', header: 'tc', valueAccessor: (r) => r.v, filter: {type: 'text'}},
  {id: 'ts', header: 'ts', valueAccessor: (r) => r.v, filter: {type: 'text', operator: 'startsWith'}},
  {id: 'te', header: 'te', valueAccessor: (r) => r.v, filter: {type: 'text', operator: 'endsWith'}},
  {id: 'tq', header: 'tq', valueAccessor: (r) => r.v, filter: {type: 'text', operator: 'equals'}},
  {id: 'n', header: 'n', valueAccessor: (r) => r.v, filter: {type: 'number'}},
  {id: 'nr', header: 'nr', valueAccessor: (r) => r.v, filter: {type: 'numberRange'}},
  {id: 'd', header: 'd', valueAccessor: (r) => r.v, filter: {type: 'date'}},
  {id: 'r', header: 'r', valueAccessor: (r) => r.v, filter: {type: 'range'}},
  {id: 'e', header: 'e', valueAccessor: (r) => r.v, filter: {type: 'enum'}},
  {id: 'b', header: 'b', valueAccessor: (r) => r.v, filter: {type: 'boolean'}},
  {id: 'p', header: 'p', valueAccessor: (r) => r.v, filterPredicate: (row, value) => `${row.v}`.length === value.length},
];

describe('filtres compilés', () => {
  it('donnent le même résultat que matchesColumnFilter, pour toutes les colonnes, saisies et valeurs', () => {
    let compared = 0;
    for (const column of COLUMNS) {
      for (const filterValue of FILTERS) {
        const compiled = compileColumnFilter(column, filterValue);
        for (const v of VALUES) {
          const row = {v};
          const expected = matchesColumnFilter(row, column, filterValue);
          if (compiled(row) !== expected) {
            throw new Error(`colonne ${column.id}, filtre « ${filterValue} », valeur ${String(v)} : ${expected} attendu`);
          }
          compared++;
        }
      }
    }
    expect(compared).toBeGreaterThan(8000);
  });

  it('même résultat sur des valeurs et saisies tirées au hasard', () => {
    const next = random(42);
    const pick = <V>(list: readonly V[]): V => list[Math.floor(next() * list.length)];
    const alphabet = ['1', '2', '5', '.', ',', '>', '<', '=', '!', ' ', 'a', 'B', '-', '.', '.'];
    const noise = () => Array.from({length: 1 + Math.floor(next() * 6)}, () => pick(alphabet)).join('');
    for (let i = 0; i < 4000; i++) {
      const column = pick(COLUMNS);
      const filterValue = noise().trim() || '1';
      const v = next() < 0.5 ? noise() : Math.floor(next() * 100) - 20 + (next() < 0.3 ? 0.5 : 0);
      const row = {v};
      expect(compileColumnFilter(column, filterValue)(row), `${column.id} « ${filterValue} » ${String(v)}`).toBe(matchesColumnFilter(row, column, filterValue));
    }
  });

  it('compileFilters ignore les saisies vides et combine les autres', () => {
    expect(compileFilters(COLUMNS, {})).toBeNull();
    expect(compileFilters(COLUMNS, {n: '   '})).toBeNull();
    const filters = {n: '>5', tc: '1'};
    const predicate = compileFilters(COLUMNS, filters)!;
    for (const v of VALUES) {
      expect(predicate({v})).toBe(matchesAllFilters({v}, COLUMNS, filters));
    }
  });
});
