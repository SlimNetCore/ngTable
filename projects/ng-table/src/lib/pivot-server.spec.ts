import {describe, expect, it} from 'vitest';
import {
  computePivot,
  configFromLayout,
  PIVOT_PATH_SEPARATOR,
  PivotConfig,
  PivotField,
  PivotLayout,
  pivotCellKey,
  pivotColumnFields,
  pivotFromServer,
  pivotRequestFor,
  pivotToServerResult,
  pivotTotalKey,
  placeInLayout,
  removeFromLayout,
  setLayoutAggregate,
} from './pivot';

interface Sale {
  region: string;
  year: number;
  amount: number;
}

const SALES: Sale[] = [
  {region: 'Nord', year: 2025, amount: 10},
  {region: 'Nord', year: 2026, amount: 30},
  {region: 'Sud', year: 2025, amount: 5},
];

const config: PivotConfig<Sale> = {
  rows: [{id: 'region', header: 'Région', accessor: (s) => s.region}],
  columns: {id: 'year', header: 'Année', accessor: (s) => s.year},
  values: [{id: 'amount', header: 'Montant', accessor: (s) => s.amount, aggregate: 'sum'}],
};

describe('pivot serveur', () => {
  it('la requête décrit les champs par leur identifiant, sans les fonctions', () => {
    expect(pivotRequestFor(config, {region: 'Nord'})).toEqual({
      rows: ['region'],
      columns: ['year'],
      values: [{id: 'amount', aggregate: 'sum'}],
      columnSort: 'asc',
      filters: {region: 'Nord'},
    });
    expect(pivotRequestFor({...config, columns: null, columnSort: 'desc'}).columns).toEqual([]);
    expect('filters' in pivotRequestFor(config, {})).toBe(false);
  });

  it('une réponse serveur donne le même résultat que le calcul local (aller-retour)', () => {
    const local = computePivot(SALES, config);
    const server = pivotToServerResult(local, config as PivotConfig<unknown>);
    expect(server.rows[0]).toMatchObject({labels: ['Nord'], cells: {'2025': {amount: 10}, '2026': {amount: 30}}, totals: {amount: 40}});
    expect(pivotFromServer(server, config)).toEqual(local);
  });

  it('les colonnes pivot sont déduites des lignes quand le serveur ne les donne pas', () => {
    const result = pivotFromServer(
      {rows: [{labels: ['Nord'], cells: {'2026': {amount: 1}, '2025': {amount: 2}}}]},
      config,
    );
    expect(result.columnKeys).toEqual(['2025', '2026']);
    expect(result.rows[0].cells[pivotCellKey('2025', 'amount')]).toBe(2);
    expect(result.grandTotal).toBeNull(); // pas de total envoyé
  });

  it('plusieurs champs en colonnes : chemins, clés et aller-retour', () => {
    const multi: PivotConfig<Sale> = {...config, columns: [config.columns as PivotField<Sale>, {id: 'product', header: 'Produit', accessor: () => 'A'}]};
    expect(pivotRequestFor(multi).columns).toEqual(['year', 'product']);
    const server = {
      columns: [['2025', 'A'], ['2026', 'B']],
      rows: [{labels: ['Nord'], cells: {[`2025${PIVOT_PATH_SEPARATOR}A`]: {amount: 1}, [`2026${PIVOT_PATH_SEPARATOR}B`]: {amount: 2}}, totals: {amount: 3}}],
    };
    const result = pivotFromServer(server, multi);
    expect(result.columnPaths).toEqual([['2025', 'A'], ['2026', 'B']]);
    expect(result.rows[0].cells[pivotCellKey(`2026${PIVOT_PATH_SEPARATOR}B`, 'amount')]).toBe(2);
    // Sans `columns` envoyé par le serveur, les chemins sont déduits des clés.
    expect(pivotFromServer({rows: server.rows}, multi).columnPaths).toEqual([['2025', 'A'], ['2026', 'B']]);
    expect(pivotToServerResult(result, multi as PivotConfig<unknown>).columns).toEqual([['2025', 'A'], ['2026', 'B']]);
  });

  it('une cellule absente vaut null ; sans colonne pivot, le total de ligne est la valeur', () => {
    const noColumn: PivotConfig<Sale> = {...config, columns: null};
    const result = pivotFromServer({rows: [{labels: ['Sud'], cells: {'': {amount: 5}}}]}, noColumn);
    expect(result.columnKeys).toEqual(['']);
    expect(result.rows[0].cells[pivotTotalKey('amount')]).toBe(5);
    const sparse = pivotFromServer({columns: [['2025'], ['2026']], rows: [{labels: ['Sud'], cells: {'2025': {amount: 5}}, totals: {amount: 5}}]}, config);
    expect(sparse.rows[0].cells[pivotCellKey('2026', 'amount')]).toBeNull();
  });
});

describe('composition par glisser-déposer', () => {
  const empty: PivotLayout = {rows: [], columns: [], values: []};
  const place = (layout: PivotLayout, id: string, zone: 'rows' | 'columns' | 'values', kind: 'dimension' | 'measure', index?: number) =>
    placeInLayout(layout, id, zone, kind, index)!;

  it('place les dimensions en lignes ou en colonne et les mesures en valeurs, pas autrement', () => {
    expect(placeInLayout(empty, 'amount', 'rows', 'measure')).toBeNull();
    expect(placeInLayout(empty, 'region', 'values', 'dimension')).toBeNull();
    expect(place(empty, 'region', 'rows', 'dimension').rows).toEqual(['region']);
    expect(place(empty, 'amount', 'values', 'measure').values).toEqual([{id: 'amount', aggregate: 'sum'}]);
  });

  it('un champ n’est que dans une zone ; les colonnes comme les lignes peuvent en avoir plusieurs, dans l’ordre', () => {
    let layout = place(empty, 'region', 'rows', 'dimension');
    layout = place(layout, 'region', 'columns', 'dimension');
    expect(layout).toEqual({rows: [], columns: ['region'], values: []});
    layout = place(layout, 'year', 'columns', 'dimension');
    expect(layout.columns).toEqual(['region', 'year']);
    layout = place(layout, 'year', 'columns', 'dimension', 0); // réordonner dans la zone
    expect(layout.columns).toEqual(['year', 'region']);
    layout = place(layout, 'year', 'rows', 'dimension'); // changer de zone
    expect(layout).toMatchObject({rows: ['year'], columns: ['region']});
  });

  it('l’ordre des lignes se règle par la position de dépôt', () => {
    let layout = place(empty, 'a', 'rows', 'dimension');
    layout = place(layout, 'b', 'rows', 'dimension');
    layout = place(layout, 'c', 'rows', 'dimension', 0);
    expect(layout.rows).toEqual(['c', 'a', 'b']);
    layout = place(layout, 'c', 'rows', 'dimension', 2); // déplacer dans la même zone
    expect(layout.rows).toEqual(['a', 'b', 'c']);
  });

  it('retire un champ, change un agrégat, et produit une configuration', () => {
    let layout: PivotLayout = {rows: ['region'], columns: ['year'], values: [{id: 'amount', aggregate: 'sum'}]};
    layout = setLayoutAggregate(layout, 'amount', 'avg');
    const dimensions = [config.rows[0], ...pivotColumnFields(config)];
    const measures = config.values;
    const built = configFromLayout(layout, dimensions, measures, {totalLabel: 'Tout'});
    expect(built.rows.map((f) => f.id)).toEqual(['region']);
    expect(built.columns).toEqual(pivotColumnFields(config));
    expect(built.values[0]).toMatchObject({id: 'amount', aggregate: 'avg'});
    expect(built.totalLabel).toBe('Tout');
    expect(removeFromLayout(layout, 'year').columns).toEqual([]);
    expect(removeFromLayout(layout, 'amount').values).toEqual([]);
    expect(configFromLayout({rows: ['inconnu'], columns: ['nope'], values: [{id: 'x', aggregate: 'sum'}]}, dimensions, measures)).toMatchObject({rows: [], columns: [], values: []});
  });
});
