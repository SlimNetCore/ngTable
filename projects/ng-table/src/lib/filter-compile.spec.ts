import {describe, expect, it} from 'vitest';
import {ColumnStore} from './column-store';
import {compileColumnFilter, compileFilters, compileIndexFilters, filtersNarrow, searchNarrows} from './filter-compile';
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

describe('filtres par indices et dictionnaires', () => {
  it('retient les mêmes lignes que les filtres ligne par ligne, sur 400 combinaisons aléatoires', () => {
    const next = random(21);
    const pick = <V>(list: readonly V[]): V => list[Math.floor(next() * list.length)];
    // Assez de lignes pour que les colonnes passent en dictionnaire (valeurs répétées).
    const rows: Row[] = Array.from({length: 2500}, () => ({v: pick(VALUES)}));
    const store = new ColumnStore<Row>();
    for (let round = 0; round < 400; round++) {
      const filters: Record<string, string> = {};
      for (let k = 0; k < 1 + Math.floor(next() * 2); k++) {
        filters[pick(COLUMNS).id] = pick(FILTERS);
      }
      const byRow = compileFilters(COLUMNS, filters);
      const byIndex = compileIndexFilters(rows, COLUMNS, filters, (column) => store.dictionary(rows, column));
      const expected = rows.map((row) => !byRow || byRow(row));
      const actual = rows.map((_, index) => !byIndex || byIndex(index));
      expect(actual, JSON.stringify(filters)).toEqual(expected);
    }
    expect(store.stats.dictionaries).toBeGreaterThan(5);
  });

  it('sans filtre actif : rien à tester', () => {
    expect(compileIndexFilters([{v: 1}], COLUMNS, {t: '  '}, () => null)).toBeNull();
  });

  it('une colonne à trop de valeurs distinctes reste filtrée ligne par ligne', () => {
    const rows: Row[] = Array.from({length: 6000}, (_, i) => ({v: `REF-${i}`}));
    const store = new ColumnStore<Row>();
    const at = compileIndexFilters(rows, COLUMNS, {t: 'ref-59'}, (column) => store.dictionary(rows, column))!;
    expect(rows.filter((_, i) => at(i))).toHaveLength(111);
    expect(store.stats.dictionaries).toBe(0);
  });
});

describe('filtre plus strict que le précédent', () => {
  it('reconnaît un filtre ajouté et une saisie de texte prolongée', () => {
    expect(filtersNarrow(COLUMNS, {}, {n: '>5'})).toBe(true);
    expect(filtersNarrow(COLUMNS, {t: 'du'}, {t: 'dup'})).toBe(true);
    expect(filtersNarrow(COLUMNS, {t: 'du'}, {t: 'DUP', n: '>5'})).toBe(true);
    expect(filtersNarrow(COLUMNS, {ts: 'du'}, {ts: 'dup'})).toBe(true);
    expect(filtersNarrow(COLUMNS, {te: 'up'}, {te: 'dup'})).toBe(true);
  });

  it('refuse au moindre doute', () => {
    expect(filtersNarrow(COLUMNS, {t: 'dup'}, {t: 'du'}), 'saisie raccourcie').toBe(false);
    expect(filtersNarrow(COLUMNS, {t: 'dup'}, {}), 'filtre retiré').toBe(false);
    expect(filtersNarrow(COLUMNS, {t: 'dup'}, {t: 'dop'}), 'autre texte').toBe(false);
    expect(filtersNarrow(COLUMNS, {ts: 'up'}, {ts: 'dup'}), 'commence par').toBe(false);
    expect(filtersNarrow(COLUMNS, {tq: 'du'}, {tq: 'dup'}), 'égal à').toBe(false);
    expect(filtersNarrow(COLUMNS, {t: '1'}, {t: '12'}), 'lisible comme un nombre').toBe(false);
    expect(filtersNarrow(COLUMNS, {t: 'tru'}, {t: 'true'}), 'lisible comme un booléen').toBe(false);
    expect(filtersNarrow(COLUMNS, {n: '>5'}, {n: '>50'}), 'colonne numérique').toBe(false);
    expect(filtersNarrow(COLUMNS, {p: 'ab'}, {p: 'abc'}), 'prédicat personnalisé').toBe(false);
    expect(filtersNarrow(COLUMNS, {inconnue: 'a'}, {inconnue: 'ab'}), 'colonne absente').toBe(false);
  });

  it('quand il dit « plus strict », aucune ligne nouvelle n’est retenue (3 000 couples aléatoires)', () => {
    const next = random(33);
    const pick = <V>(list: readonly V[]): V => list[Math.floor(next() * list.length)];
    const rows: Row[] = VALUES.map((v) => ({v}));
    const extend = (text: string) => (next() < 0.5 ? text + pick(['a', 'é', '2', ' ', 'e', '.', ',5', 'x']) : pick(['a', 'V', '1', 't']) + text);
    let recognised = 0;
    for (let round = 0; round < 3000; round++) {
      const column = pick(COLUMNS);
      const other = pick(COLUMNS);
      const before: Record<string, string> = next() < 0.3 ? {} : {[column.id]: pick([...FILTERS, 'tru', 'fals', 'b', 'v', 'cmd-'])};
      const after: Record<string, string> = {...before};
      if (before[column.id] !== undefined && next() < 0.7) {
        after[column.id] = extend(before[column.id]);
      }
      if (next() < 0.4) {
        after[other.id] = pick(FILTERS);
      }
      if (!filtersNarrow(COLUMNS, before, after)) {
        continue;
      }
      recognised++;
      const was = compileFilters(COLUMNS, before);
      const now = compileFilters(COLUMNS, after);
      for (const row of rows) {
        if (now && now(row)) {
          expect(!was || was(row), `${JSON.stringify(before)} → ${JSON.stringify(after)} : ${String(row.v)}`).toBe(true);
        }
      }
    }
    expect(recognised).toBeGreaterThan(300);
  });

  it('recherche globale : chaque ancien mot doit être contenu dans un nouveau', () => {
    expect(searchNarrows([], ['dup'])).toBe(true);
    expect(searchNarrows(['dup'], ['dupont'])).toBe(true);
    expect(searchNarrows(['dup'], ['dupont', 'valid'])).toBe(true);
    expect(searchNarrows(['dup', 'val'], ['dupont'])).toBe(false);
    expect(searchNarrows(['dup'], [])).toBe(false);
    expect(searchNarrows(['dupont'], ['dup'])).toBe(false);
  });
});
