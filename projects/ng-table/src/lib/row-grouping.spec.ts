import {describe, expect, it} from 'vitest';
import type {NgTableColumn} from './ng-table.component';
import {buildConsecutiveGroups, buildGroups, computeAggregate, groupedUnits, NgTableGroupRow, withGroupHeaders} from './row-grouping';

interface Row {
  id: number;
  statut: string | null;
  montant: number | string;
}

const rows: Row[] = [
  {id: 1, statut: 'VALIDEE', montant: 300},
  {id: 2, statut: 'BROUILLON', montant: 100},
  {id: 3, statut: null, montant: 50},
  {id: 4, statut: 'VALIDEE', montant: '200'},
];
const statut: NgTableColumn<Row> = {id: 'statut', header: 'Statut', valueAccessor: (r) => r.statut};
const montant = (aggregate: NgTableColumn<Row>['aggregate']): NgTableColumn<Row> => ({
  id: 'montant',
  header: 'Montant',
  valueAccessor: (r) => r.montant,
  aggregate,
});
const collator = new Intl.Collator('fr', {numeric: true});

describe('row-grouping', () => {
  it('groupe par valeur, groupes triés, groupe vide en dernier, lignes dans leur ordre', () => {
    const groups = buildGroups(rows, statut, false, collator);
    expect(groups.map((g) => g.key)).toEqual(['BROUILLON', 'VALIDEE', '']);
    expect(groups[1].rows.map((r) => r.id)).toEqual([1, 4]);

    expect(buildGroups(rows, statut, true, collator).map((g) => g.key)).toEqual(['VALIDEE', 'BROUILLON', '']);
  });

  it('mode remote : groupes par lignes consécutives, dans l’ordre reçu', () => {
    const page: Row[] = [rows[0], rows[3], rows[1], rows[2]]; // VALIDEE, VALIDEE, BROUILLON, vide
    expect(buildConsecutiveGroups(page, statut).map((g) => `${g.key}:${g.rows.length}`)).toEqual(['VALIDEE:2', 'BROUILLON:1', ':1']);
  });

  it('un groupe replié compte pour une seule unité de pagination', () => {
    const groups = buildGroups(rows, statut, false, collator);
    const units = groupedUnits(groups, new Set(['VALIDEE']));
    expect(units.map((u) => (u.kind === 'row' ? u.row.id : `replié:${u.group.key}`))).toEqual([2, 'replié:VALIDEE', 3]);
  });

  it('intercale un en-tête avant chaque groupe présent sur la page, même commencé avant', () => {
    const groups = buildGroups(rows, statut, false, collator);
    const units = groupedUnits(groups, new Set());
    // Page commençant au milieu du groupe VALIDEE : [4 (VALIDEE), 3 (vide)]
    const items = withGroupHeaders(units.slice(2, 4));
    expect(items.map((item) => (item instanceof NgTableGroupRow ? `# ${item.group.key}` : item.id))).toEqual([
      '# VALIDEE',
      4,
      '# ',
      3,
    ]);
  });

  it('calcule les agrégats sur les valeurs numériques (texte numérique accepté)', () => {
    expect(computeAggregate(montant('sum'), rows)).toBe(650);
    expect(computeAggregate(montant('avg'), rows)).toBe(162.5);
    expect(computeAggregate(montant('min'), rows)).toBe(50);
    expect(computeAggregate(montant('max'), rows)).toBe(300);
    expect(computeAggregate(montant('count'), rows)).toBe(4);
    expect(computeAggregate(montant((list) => `${list.length} cmd`), rows)).toBe('4 cmd');
    expect(computeAggregate(montant(undefined), rows)).toBeNull();
    expect(computeAggregate(montant('sum'), [])).toBeNull();
  });
});
