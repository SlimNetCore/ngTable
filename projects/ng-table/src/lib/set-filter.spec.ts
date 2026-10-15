import {describe, expect, it} from 'vitest';
import type {NgTableColumn} from './ng-table.component';
import {compileColumnFilter, compileFilters} from './filter-compile';
import {matchesColumnFilter} from './row-pipeline';
import {compileSetMatcher, distinctSetValues, parseSetFilter, serializeSetFilter, setFilterKey} from './set-filter';

interface Row {
  zone: string | null;
  when: Date | null;
}

const collator = new Intl.Collator('fr', {numeric: true});
const column: NgTableColumn<Row> = {id: 'zone', header: 'Zone', valueAccessor: (row) => row.zone, filter: {type: 'set'}};
const rows: Row[] = [
  {zone: 'Nord', when: new Date('2026-01-02')},
  {zone: 'Sud, Est', when: null},
  {zone: null, when: new Date('2026-01-02')},
  {zone: '', when: null},
  {zone: 'Nord', when: new Date('2026-03-04')},
];

describe('filtre par ensemble de valeurs', () => {
  it('clés : texte, vide pour null / undefined / chaîne vide, jour ISO pour une date', () => {
    expect(setFilterKey('x')).toBe('x');
    expect(setFilterKey(12)).toBe('12');
    expect(setFilterKey(null)).toBe('');
    expect(setFilterKey(undefined)).toBe('');
    expect(setFilterKey(new Date('2026-05-06T12:00:00Z'))).toBe('2026-05-06');
    expect(setFilterKey(new Date('nope'))).toBe('');
  });

  it('la valeur est un tableau JSON : une virgule dans une valeur est permise ; le reste est ignoré', () => {
    expect(parseSetFilter(serializeSetFilter(['Sud, Est', 'Nord']))).toEqual(['Sud, Est', 'Nord']);
    expect(parseSetFilter('')).toBeNull();
    expect(parseSetFilter('Nord,Sud')).toBeNull();
    expect(parseSetFilter('{"a":1}')).toBeNull();
    expect(parseSetFilter('[]')).toEqual([]);
  });

  it('garde les lignes dont la clé est cochée, cellules vides comprises', () => {
    const only = (...keys: string[]) => rows.filter(compileColumnFilter(column, serializeSetFilter(keys)));
    expect(only('Nord')).toHaveLength(2);
    expect(only('Sud, Est')).toEqual([rows[1]]);
    expect(only('')).toEqual([rows[2], rows[3]]);
    expect(only('Nord', '')).toHaveLength(4);
    expect(only()).toEqual([]);
  });

  it('même résultat par le chemin compilé et par matchesColumnFilter, pour chaque combinaison', () => {
    const keys = ['Nord', 'Sud, Est', ''];
    for (let mask = 0; mask < 8; mask++) {
      const value = serializeSetFilter(keys.filter((_, index) => mask & (1 << index)));
      const compiled = rows.filter(compileColumnFilter(column, value));
      const direct = rows.filter((row) => matchesColumnFilter(row, column, value));
      expect(compiled, value).toEqual(direct);
    }
  });

  it('s’applique aux dates par leur jour', () => {
    const dates: NgTableColumn<Row> = {id: 'when', header: 'Date', valueAccessor: (row) => row.when, filter: {type: 'set'}};
    const predicate = compileFilters([dates], {when: serializeSetFilter(['2026-01-02'])})!;
    expect(rows.filter(predicate)).toEqual([rows[0], rows[2]]);
  });

  it('un filtre qui n’est pas un ensemble ne filtre rien (l’appelant retombe sur le texte)', () => {
    expect(compileSetMatcher('Nord')).toBeNull();
  });

  it('valeurs distinctes : effectifs, tri naturel, vides en dernier, libellé des vides', () => {
    const {values, truncated} = distinctSetValues(rows, (row) => row.zone, collator, '(Vides)');
    expect(truncated).toBe(false);
    expect(values).toEqual([
      {key: 'Nord', label: 'Nord', count: 2},
      {key: 'Sud, Est', label: 'Sud, Est', count: 1},
      {key: '', label: '(Vides)', count: 2},
    ]);
  });

  it('valeurs distinctes : la liste est tronquée au-delà de la limite, sans compter les valeurs déjà vues', () => {
    const many = Array.from({length: 50}, (_, index) => ({zone: `z${index % 10 === 0 ? 0 : index}`, when: null}));
    const {values, truncated} = distinctSetValues(many, (row) => row.zone, collator, '', 10);
    expect(values).toHaveLength(10);
    expect(truncated).toBe(true);
    expect(values.find((value) => value.key === 'z0')?.count).toBe(5);
  });
});
