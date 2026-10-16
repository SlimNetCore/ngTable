import {TestBed} from '@angular/core/testing';
import {describe, expect, it} from 'vitest';
import {buildPivotModel, NgTablePivotComponent} from './ng-table-pivot.component';
import {PivotConfig} from './pivot';

interface Sale {
  region: string;
  year: number;
  amount: number;
}

const SALES: Sale[] = [
  {region: 'Nord', year: 2025, amount: 10},
  {region: 'Nord', year: 2026, amount: 30},
  {region: 'Sud', year: 2025, amount: 5.5},
];

const config = (extra: Partial<PivotConfig<Sale>> = {}): PivotConfig<Sale> => ({
  rows: [{id: 'region', header: 'Région', accessor: (s) => s.region}],
  columns: {id: 'year', header: 'Année', accessor: (s) => s.year},
  values: [{id: 'amount', header: 'Montant', accessor: (s) => s.amount}],
  ...extra,
});

describe('buildPivotModel', () => {
  it('une colonne par valeur de la colonne pivot, groupées sous son en-tête, plus un total', () => {
    const model = buildPivotModel(SALES, config());
    expect(model.columns.map((c) => c.header)).toEqual(['Région', '2025', '2026', 'Total']);
    expect(model.columns[1].headerGroup).toEqual(['Année']);
    expect(model.columns[0].pinned).toBe('left');
    expect(model.rows.map((r) => model.columns.map((c) => c.valueAccessor(r)).join('|'))).toEqual(['Nord|10|30|40', 'Sud|5.5||5.5']);
    expect(model.pinnedBottom).toHaveLength(1);
    expect(model.columns.map((c) => c.valueAccessor(model.pinnedBottom[0])).join('|')).toBe('Total|15.5|30|45.5');
  });

  it('plusieurs valeurs : un groupe par valeur de la colonne pivot', () => {
    const model = buildPivotModel(SALES, config({values: [{id: 'amount', header: 'Montant', accessor: (s) => s.amount}, {id: 'n', header: 'Nb', accessor: (s) => s.year, aggregate: 'count'}]}));
    const first = model.columns[1];
    expect(first.header).toBe('Montant');
    expect(first.headerGroup).toEqual(['Année', '2025']);
    expect(model.columns.at(-1)?.headerGroup).toEqual(['Total']);
  });

  it('sans colonne pivot : une colonne par valeur, pas de total de ligne', () => {
    const model = buildPivotModel(SALES, config({columns: null}));
    expect(model.columns.map((c) => c.header)).toEqual(['Région', 'Montant']);
    expect(model.rows.map((r) => model.columns[1].valueAccessor(r))).toEqual([40, 5.5]);
  });

  it('plusieurs champs en colonnes : les valeurs externes coiffent les internes', () => {
    const model = buildPivotModel(SALES, config({columns: [{id: 'year', header: 'Année', accessor: (s) => s.year}, {id: 'region', header: 'Région', accessor: (s) => s.region}]}));
    const headers = model.columns.map((c) => `${(c.headerGroup as string[] | undefined)?.join('>') ?? ''}|${c.header}`);
    expect(headers).toEqual(['|Région', '2025|Nord', '2025|Sud', '2026|Nord', 'Total|Total']);
  });

  it('rowTotals: false retire la colonne de total ; grandTotal: false retire la ligne', () => {
    const model = buildPivotModel(SALES, config({rowTotals: false, grandTotal: false}));
    expect(model.columns.map((c) => c.header)).toEqual(['Région', '2025', '2026']);
    expect(model.pinnedBottom).toEqual([]);
  });
});

describe('NgTablePivotComponent', () => {
  it('affiche le pivot dans une ng-table et le recalcule quand les données changent', async () => {
    const fixture = TestBed.createComponent(NgTablePivotComponent<Sale>);
    fixture.componentRef.setInput('rows', SALES);
    fixture.componentRef.setInput('config', config());
    await fixture.whenStable();

    const root = fixture.nativeElement as HTMLElement;
    const headers = [...root.querySelectorAll('th.cdk-header-cell')].map((th) => th.textContent?.replace(/\s+/g, ' ').trim());
    expect(headers.join('|')).toContain('Région');
    expect(root.querySelectorAll('tr.data-row')).toHaveLength(3); // Nord, Sud + total épinglé

    fixture.componentRef.setInput('rows', [...SALES, {region: 'Est', year: 2026, amount: 1}]);
    await fixture.whenStable();
    expect(root.querySelectorAll('tr.data-row')).toHaveLength(4);
  });
});
