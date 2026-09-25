import {describe, expect, it} from 'vitest';
import type {NgTableColumn} from './ng-table.component';
import {compareSortValues, matchesAllFilters, matchesColumnFilter, searchText, sortRows} from './row-pipeline';

interface Row {
  nom: string;
  montant: number | null;
  date: Date | string;
  statut: string;
}

const col = (id: keyof Row, extra: Partial<NgTableColumn<Row>> = {}): NgTableColumn<Row> => ({
  id,
  header: id,
  valueAccessor: (row) => row[id],
  ...extra,
});

const collator = new Intl.Collator('fr', {numeric: true, sensitivity: 'base'});

describe('row-pipeline', () => {
  describe('compareSortValues', () => {
    it('met les valeurs vides en dernier et compare le texte « naturellement »', () => {
      expect(compareSortValues(null, 'a', collator)).toBeGreaterThan(0);
      expect(compareSortValues('a', null, collator)).toBeLessThan(0);
      expect(compareSortValues('Ligne 2', 'Ligne 10', collator)).toBeLessThan(0);
      expect(compareSortValues('élodie', 'Emile', collator)).toBeLessThan(0);
    });

    it('compare dates et nombres par valeur', () => {
      expect(compareSortValues(new Date('2026-01-02'), '2026-01-01', collator)).toBeGreaterThan(0);
      expect(compareSortValues(9, 10, collator)).toBeLessThan(0);
    });
  });

  describe('sortRows', () => {
    const rows: Row[] = [
      {nom: 'B', montant: 10, date: '2026-01-01', statut: 'X'},
      {nom: 'A', montant: 10, date: '2026-01-02', statut: 'Y'},
      {nom: 'C', montant: null, date: '2026-01-03', statut: 'X'},
      {nom: 'D', montant: 5, date: '2026-01-04', statut: 'Y'},
    ];

    it('trie sur plusieurs niveaux, dans l’ordre des niveaux', () => {
      const sorted = sortRows(rows, [{column: col('statut'), factor: 1}, {column: col('montant'), factor: -1}], collator);
      expect(sorted.map((r) => r.nom)).toEqual(['B', 'C', 'A', 'D']);
    });

    it('garde les cellules vides en dernier, y compris en tri décroissant', () => {
      const sorted = sortRows(rows, [{column: col('montant'), factor: -1}], collator);
      expect(sorted.map((r) => r.nom)).toEqual(['B', 'A', 'D', 'C']);
    });

    it('est stable : à égalité, l’ordre d’origine est conservé', () => {
      const sorted = sortRows(rows, [{column: col('montant'), factor: 1}], collator);
      expect(sorted.map((r) => r.nom)).toEqual(['D', 'B', 'A', 'C']);
    });

    it('sans niveau, renvoie le tableau tel quel', () => {
      expect(sortRows(rows, [], collator)).toBe(rows);
    });
  });

  describe('filtres', () => {
    const row: Row = {nom: 'Dupont', montant: 1240.5, date: '2026-03-15', statut: 'VALIDEE'};

    it('interprète chaque type de filtre', () => {
      expect(matchesColumnFilter(row, col('statut', {filter: {type: 'enum'}}), 'BROUILLON,VALIDEE')).toBe(true);
      expect(matchesColumnFilter(row, col('montant', {filter: {type: 'number'}}), '>1000')).toBe(true);
      expect(matchesColumnFilter(row, col('montant', {filter: {type: 'numberRange'}}), '..1000')).toBe(false);
      expect(matchesColumnFilter(row, col('date', {filter: {type: 'range'}}), '2026-03-01..2026-03-31')).toBe(true);
      expect(matchesColumnFilter(row, col('nom', {filter: {type: 'text', operator: 'startsWith'}}), 'pont')).toBe(false);
    });

    it('filterPredicate remplace le filtrage par défaut ; une cellule vide ne passe pas', () => {
      expect(matchesColumnFilter(row, col('nom', {filterPredicate: () => true}), 'zzz')).toBe(true);
      expect(matchesColumnFilter({...row, montant: null}, col('montant'), '5')).toBe(false);
    });

    it('matchesAllFilters ignore les filtres vides', () => {
      const columns = [col('nom'), col('statut', {filter: {type: 'enum'}})];
      expect(matchesAllFilters(row, columns, {nom: '  ', statut: 'VALIDEE'})).toBe(true);
      expect(matchesAllFilters(row, columns, {nom: 'martin', statut: ''})).toBe(false);
    });
  });

  it('searchText : textes normalisés, libellé de searchable, dates au format ISO', () => {
    const row: Row = {nom: 'Élodie', montant: 5, date: new Date(2026, 2, 15), statut: 'VALIDEE'};
    const columns = [col('nom'), col('statut', {searchable: () => 'Validée'}), col('date')];
    expect(searchText(row, columns)).toBe('elodie\nvalidee\n2026-03-15');
  });
});
