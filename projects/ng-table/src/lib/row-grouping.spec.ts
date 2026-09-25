import {describe, expect, it} from 'vitest';
import type {NgTableColumn} from './ng-table.component';
import {
  buildConsecutiveGroups,
  buildGroups,
  computeAggregate,
  groupedUnits,
  NgTableGroupRow,
  remoteGroupedPage,
  withGroupHeaders,
} from './row-grouping';

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

  describe('remoteGroupedPage (groupes repliés en mode serveur)', () => {
    // Groupes du serveur, dans l'ordre : A (3 lignes), B (2), C (4) ; B replié.
    const summaries = [{key: 'A', count: 3}, {key: 'B', count: 2}, {key: 'C', count: 4}];
    const r = (id: number, statut: string): Row => ({id, statut, montant: 1});
    const render = (items: (Row | NgTableGroupRow<Row>)[]) =>
      items.map((item) => (item instanceof NgTableGroupRow ? `${item.collapsed ? '▸' : '▾'}${item.group.key}` : item.id));

    it('place le groupe replié entre les lignes, là où il se trouve dans la liste complète', () => {
      // Sans pagination : A1 A2 A3 | B replié | C1..C4
      const rows = [r(1, 'A'), r(2, 'A'), r(3, 'A'), r(6, 'C'), r(7, 'C'), r(8, 'C'), r(9, 'C')];
      const items = remoteGroupedPage(rows, statut, summaries, new Set(['B']), 0, Infinity);
      expect(render(items)).toEqual(['▾A', 1, 2, 3, '▸B', '▾C', 6, 7, 8, 9]);
    });

    it('avec pagination, sur la page qui contient sa position (pas sur la précédente)', () => {
      // Pages de 3 lignes (B n'occupe aucune ligne) : page 1 = A1 A2 A3, page 2 = B replié, C1 C2 C3.
      const page1 = remoteGroupedPage([r(1, 'A'), r(2, 'A'), r(3, 'A')], statut, summaries, new Set(['B']), 0, 3);
      const page2 = remoteGroupedPage([r(6, 'C'), r(7, 'C'), r(8, 'C')], statut, summaries, new Set(['B']), 3, 6);
      expect(render(page1)).toEqual(['▾A', 1, 2, 3]);
      expect(render(page2)).toEqual(['▸B', '▾C', 6, 7, 8]);
    });

    it('un groupe replié en fin de liste s’affiche sur la dernière page ; tout replié tient sur la première', () => {
      const endCollapsed = remoteGroupedPage([r(9, 'C')], statut, [{key: 'C', count: 1}, {key: 'D', count: 5}], new Set(['D']), 0, 10);
      expect(render(endCollapsed)).toEqual(['▾C', 9, '▸D']);

      const allCollapsed = remoteGroupedPage([], statut, summaries, new Set(['A', 'B', 'C']), 0, 10);
      expect(render(allCollapsed)).toEqual(['▸A', '▸B', '▸C']);
    });
  });
});
