import {describe, expect, it} from 'vitest';
import {computePivot, PivotConfig, pivotCellKey, pivotColumnFields, pivotTotalKey, PIVOT_PATH_SEPARATOR} from './pivot';

interface Sale {
  region: string;
  product: string;
  year: number;
  amount: number | null;
}

const SALES: Sale[] = [
  {region: 'Nord', product: 'A', year: 2025, amount: 10},
  {region: 'Nord', product: 'B', year: 2025, amount: 20},
  {region: 'Nord', product: 'A', year: 2026, amount: 30},
  {region: 'Sud', product: 'A', year: 2025, amount: 5},
  {region: 'Sud', product: 'A', year: 2026, amount: null},
  {region: 'Sud', product: 'B', year: 2026, amount: 15},
];

const field = <K extends keyof Sale>(id: K) => ({id, header: id, accessor: (row: Sale) => row[id]});

const config = (overrides: Partial<PivotConfig<Sale>> = {}): PivotConfig<Sale> => ({
  rows: [field('region')],
  columns: field('year'),
  values: [{...field('amount'), aggregate: 'sum'}],
  ...overrides,
});

const cell = (row: {cells: Record<string, number | null>}, column: string, value = 'amount') => row.cells[pivotCellKey(column, value)];

describe('pivot', () => {
  it('regroupe par ligne, étale la colonne pivot et additionne', () => {
    const pivot = computePivot(SALES, config());
    expect(pivot.columnKeys).toEqual(['2025', '2026']);
    expect(pivot.rows.map((row) => row.labels[0])).toEqual(['Nord', 'Sud']);
    expect(cell(pivot.rows[0], '2025')).toBe(30);
    expect(cell(pivot.rows[0], '2026')).toBe(30);
    expect(cell(pivot.rows[1], '2025')).toBe(5);
    expect(cell(pivot.rows[1], '2026')).toBe(15); // la valeur vide est ignorée
  });

  it('calcule les totaux de ligne et la ligne de total général', () => {
    const pivot = computePivot(SALES, config());
    expect(pivot.rows[0].cells[pivotTotalKey('amount')]).toBe(60);
    expect(pivot.rows[1].cells[pivotTotalKey('amount')]).toBe(20);
    expect(pivot.grandTotal?.labels).toEqual(['Total']);
    expect(cell(pivot.grandTotal!, '2025')).toBe(35);
    expect(pivot.grandTotal!.cells[pivotTotalKey('amount')]).toBe(80);
    expect(computePivot(SALES, config({grandTotal: false})).grandTotal).toBeNull();
  });

  it('moyenne, min, max et nombre se calculent sur les lignes, pas sur des moyennes de moyennes', () => {
    const avg = computePivot(SALES, config({columns: null, values: [{...field('amount'), aggregate: 'avg'}]}));
    expect(avg.columnKeys).toEqual(['']);
    expect(avg.rows[0].cells[pivotTotalKey('amount')]).toBe(20); // (10 + 20 + 30) / 3
    expect(avg.rows[1].cells[pivotTotalKey('amount')]).toBe(10); // (5 + 15) / 2, la valeur vide est ignorée

    const count = computePivot(SALES, config({columns: null, values: [{...field('amount'), aggregate: 'count'}]}));
    expect(count.rows[1].cells[pivotTotalKey('amount')]).toBe(3); // les 3 lignes du Sud, valeur vide comprise
    const min = computePivot(SALES, config({columns: null, values: [{...field('amount'), aggregate: 'min'}]}));
    const max = computePivot(SALES, config({columns: null, values: [{...field('amount'), aggregate: 'max'}]}));
    expect(min.rows[0].cells[pivotTotalKey('amount')]).toBe(10);
    expect(max.rows[0].cells[pivotTotalKey('amount')]).toBe(30);
  });

  it('plusieurs champs en lignes sont triés du plus externe au plus interne ; plusieurs valeurs sont possibles', () => {
    const pivot = computePivot(SALES, config({rows: [field('region'), field('product')], columns: null, values: [{...field('amount')}, {...field('year'), aggregate: 'max'}]}));
    expect(pivot.rows.map((row) => row.labels.join('/'))).toEqual(['Nord/A', 'Nord/B', 'Sud/A', 'Sud/B']);
    expect(pivot.rows[0].cells[pivotTotalKey('amount')]).toBe(40);
    expect(pivot.rows[0].cells[pivotTotalKey('year')]).toBe(2026);
    expect(pivot.grandTotal?.labels).toEqual(['Total', '']);
  });

  it('une cellule sans ligne vaut null ; l’ordre des colonnes peut être inversé ; sans données, pas de total', () => {
    const pivot = computePivot(SALES, config({rows: [field('product')], columns: field('region'), columnSort: 'desc'}));
    expect(pivot.columnKeys).toEqual(['Sud', 'Nord']);
    const sparse = computePivot(SALES.slice(0, 3), config({rows: [field('product')]}));
    expect(cell(sparse.rows[1], '2026')).toBeNull(); // le produit B n'a rien vendu en 2026
    const empty = computePivot([], config());
    expect(empty.rows).toEqual([]);
    expect(empty.grandTotal).toBeNull();
  });

  describe('plusieurs champs en colonnes', () => {
    const multi = (extra: Partial<PivotConfig<Sale>> = {}) => config({columns: [field('year'), field('product')], ...extra});
    const key = (...path: string[]) => path.join(PIVOT_PATH_SEPARATOR);

    it('chaque combinaison de valeurs est une colonne, triée champ par champ', () => {
      const pivot = computePivot(SALES, multi());
      expect(pivot.columnPaths).toEqual([['2025', 'A'], ['2025', 'B'], ['2026', 'A'], ['2026', 'B']]);
      expect(pivot.columnKeys).toEqual(pivot.columnPaths.map((path) => path.join(PIVOT_PATH_SEPARATOR)));
      expect(cell(pivot.rows[0], key('2025', 'A'))).toBe(10); // Nord, 2025, produit A
      expect(cell(pivot.rows[0], key('2025', 'B'))).toBe(20);
      expect(cell(pivot.rows[0], key('2026', 'A'))).toBe(30);
      expect(cell(pivot.rows[0], key('2026', 'B'))).toBeNull();
      expect(cell(pivot.rows[1], key('2026', 'B'))).toBe(15); // Sud
    });

    it('les totaux de ligne et le total général couvrent toutes les colonnes', () => {
      const pivot = computePivot(SALES, multi());
      expect(pivot.rows[0].cells[pivotTotalKey('amount')]).toBe(60);
      expect(pivot.grandTotal!.cells[pivotTotalKey('amount')]).toBe(80);
      expect(cell(pivot.grandTotal!, key('2025', 'A'))).toBe(15);
    });

    it('l’ordre des colonnes peut être inversé ; un champ seul en tableau donne la même chose qu’un champ', () => {
      expect(computePivot(SALES, multi({columnSort: 'desc'})).columnPaths[0]).toEqual(['2026', 'B']);
      const single = computePivot(SALES, config());
      const asArray = computePivot(SALES, config({columns: [field('year')]}));
      expect(asArray).toEqual(single);
      expect(pivotColumnFields(config())).toHaveLength(1);
      expect(pivotColumnFields(config({columns: null}))).toEqual([]);
    });
  });

  it('les nombres dans les libellés se trient comme des nombres', () => {
    const rows = [{y: 10}, {y: 9}, {y: 100}].map((row) => ({...row, v: 1}));
    const pivot = computePivot(rows, {rows: [{id: 'y', header: 'y', accessor: (r) => r.y}], values: [{id: 'v', header: 'v', accessor: (r) => r.v}]});
    expect(pivot.rows.map((row) => row.labels[0])).toEqual(['9', '10', '100']);
  });
});
