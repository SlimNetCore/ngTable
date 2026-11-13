import {describe, expect, it} from 'vitest';
import {compileAdvancedFilter, countActiveConditions, describeAdvancedFilter, NgTableFilterGroup, NgTableFilterNode} from './advanced-filter';
import {compileColumnFilter} from './filter-compile';
import type {NgTableColumn} from './ng-table.component';

interface Row {
  id: number;
  statut: string;
  montant: number;
  client: string;
}

const COLUMNS: NgTableColumn<Row>[] = [
  {id: 'statut', header: 'Statut', valueAccessor: (r) => r.statut, filter: {type: 'enum'}},
  {id: 'montant', header: 'Montant', valueAccessor: (r) => r.montant, filter: {type: 'number'}},
  {id: 'client', header: 'Client', valueAccessor: (r) => r.client, filter: {type: 'text'}},
];

const ROWS: Row[] = [
  {id: 1, statut: 'Validée', montant: 8000, client: 'Dupont SA'},
  {id: 2, statut: 'Validée', montant: 200, client: 'Martin SARL'},
  {id: 3, statut: 'Expédiée', montant: 9000, client: 'Dupont SA'},
  {id: 4, statut: 'Annulée', montant: 7000, client: 'Leroy'},
  {id: 5, statut: 'Brouillon', montant: 50, client: 'Dupont SA'},
];

const ids = (filter: NgTableFilterNode | null) => {
  const predicate = compileAdvancedFilter(filter, COLUMNS);
  return ROWS.filter((row) => !predicate || predicate(row)).map((row) => row.id);
};
const WORDS = {and: 'ET', or: 'OU', not: 'SAUF'};

describe('advanced-filter', () => {
  it('ET : toutes les conditions ; OU : au moins une', () => {
    expect(ids({operator: 'and', children: [{columnId: 'statut', value: 'Validée'}, {columnId: 'montant', value: '>5000'}]})).toEqual([1]);
    expect(ids({operator: 'or', children: [{columnId: 'statut', value: 'Annulée'}, {columnId: 'montant', value: '<100'}]})).toEqual([4, 5]);
  });

  it('groupes imbriqués : (Validée OU Expédiée) ET montant > 5000', () => {
    const filter: NgTableFilterGroup = {
      operator: 'and',
      children: [
        {operator: 'or', children: [{columnId: 'statut', value: 'Validée'}, {columnId: 'statut', value: 'Expédiée'}]},
        {columnId: 'montant', value: '>5000'},
      ],
    };
    expect(ids(filter)).toEqual([1, 3]);
    expect(describeAdvancedFilter(filter, COLUMNS, WORDS)).toBe('(Statut : Validée OU Statut : Expédiée) ET Montant : >5000');
    expect(countActiveConditions(filter, COLUMNS)).toBe(3);
  });

  it('« sauf » inverse une condition', () => {
    const filter: NgTableFilterGroup = {operator: 'and', children: [{columnId: 'client', value: 'dupont', not: true}, {columnId: 'montant', value: '>100'}]};
    expect(ids(filter)).toEqual([2, 4]);
    expect(describeAdvancedFilter(filter, COLUMNS, WORDS)).toBe('SAUF Client : dupont ET Montant : >100');
  });

  it('une condition lit sa saisie exactement comme le filtre de la colonne', () => {
    for (const [columnId, value] of [['statut', 'Validée,Annulée'], ['montant', '100..8000'], ['client', 'sa']] as const) {
      const column = COLUMNS.find((c) => c.id === columnId)!;
      const expected = ROWS.filter(compileColumnFilter(column, value)).map((row) => row.id);
      expect(ids({columnId, value}), `${columnId} : ${value}`).toEqual(expected);
    }
  });

  it('ce qui ne contraint rien est ignoré : pas de filtre, groupe vide, saisie vide, colonne inconnue', () => {
    const all = ROWS.map((row) => row.id);
    expect(compileAdvancedFilter(null, COLUMNS)).toBeNull();
    expect(ids({operator: 'and', children: []})).toEqual(all);
    expect(ids({operator: 'or', children: [{columnId: 'statut', value: '  '}, {columnId: 'inconnue', value: 'x'}]})).toEqual(all);
    // Un groupe vide dans un OU ne rend pas tout vrai : il est écarté, la condition restante s'applique.
    expect(ids({operator: 'or', children: [{operator: 'and', children: []}, {columnId: 'statut', value: 'Annulée'}]})).toEqual([4]);
    expect(describeAdvancedFilter({operator: 'and', children: [{columnId: 'statut', value: ''}]}, COLUMNS, WORDS)).toBe('');
    expect(countActiveConditions({operator: 'and', children: [{columnId: 'statut', value: ''}, {columnId: 'x', value: 'a'}]}, COLUMNS)).toBe(0);
  });

  it('même résultat qu’une évaluation naïve de l’arbre, sur 500 filtres aléatoires', () => {
    let seed = 17;
    const next = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
    const pick = <V>(list: readonly V[]): V => list[Math.floor(next() * list.length)];
    const conditions: [string, string][] = [['statut', 'Validée'], ['statut', 'Annulée,Brouillon'], ['montant', '>5000'], ['montant', '<=200'], ['client', 'dupont'], ['client', 'sarl'], ['montant', '']];
    const build = (depth: number): NgTableFilterNode => {
      if (depth === 0 || next() < 0.5) {
        const [columnId, value] = pick(conditions);
        return {columnId, value, not: next() < 0.25};
      }
      return {operator: next() < 0.5 ? 'and' : 'or', children: Array.from({length: Math.floor(next() * 4)}, () => build(depth - 1))};
    };
    // Évaluation de référence : `null` = « ne contraint rien ».
    const naive = (node: NgTableFilterNode, row: Row): boolean | null => {
      if ('children' in node) {
        const results = node.children.map((child) => naive(child, row)).filter((result): result is boolean => result !== null);
        return results.length === 0 ? null : node.operator === 'or' ? results.some(Boolean) : results.every(Boolean);
      }
      if (!node.value.trim()) {
        return null;
      }
      const passes = compileColumnFilter(COLUMNS.find((c) => c.id === node.columnId)!, node.value)(row);
      return node.not ? !passes : passes;
    };
    for (let round = 0; round < 500; round++) {
      const filter = build(3);
      const expected = ROWS.filter((row) => naive(filter, row) ?? true).map((row) => row.id);
      expect(ids(filter), JSON.stringify(filter)).toEqual(expected);
    }
  });
});
