import {provideZonelessChangeDetection} from '@angular/core';
import {TestBed} from '@angular/core/testing';
import {describe, expect, it} from 'vitest';
import {buildPivotModel, NgTablePivotComponent} from './ng-table-pivot.component';
import {PivotConfig} from './pivot';
import {ComputeWorkerLike} from './compute-worker-client';
import {FromWorker, ToWorker, WorkerComputeCore} from './worker-compute';

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

describe('NgTablePivotComponent — calcul en worker', () => {
  /** Un « worker » qui exécute le cœur dans le même fil, de façon asynchrone. `failing` : chaque pivot échoue. */
  function fakeWorker(failing = false): ComputeWorkerLike & {pivots: number} {
    const core = new WorkerComputeCore();
    const worker: ComputeWorkerLike & {pivots: number} = {
      pivots: 0,
      onmessage: null,
      onerror: null,
      terminate: () => undefined,
      postMessage(message: ToWorker) {
        const reply = (answer: FromWorker) => setTimeout(() => worker.onmessage?.({data: answer}), 0);
        if (message.type === 'data') {
          core.addData(message.dataset, message.count, message.entries);
        } else if (message.type === 'drop') {
          core.drop(message.dataset);
        } else if (message.type === 'pivot') {
          worker.pivots++;
          reply(failing ? {type: 'error', job: message.job, message: 'échec simulé'} : {type: 'pivot-done', job: message.job, result: core.pivot(message.dataset, message.spec)});
        }
      },
    };
    return worker;
  }

  async function create(worker: ComputeWorkerLike, threshold = 1) {
    TestBed.configureTestingModule({providers: [provideZonelessChangeDetection()]});
    const fixture = TestBed.createComponent(NgTablePivotComponent<Sale>);
    fixture.componentRef.setInput('rows', SALES);
    fixture.componentRef.setInput('config', config());
    fixture.componentRef.setInput('workerCompute', true);
    fixture.componentRef.setInput('workerThreshold', threshold);
    fixture.componentRef.setInput('computeWorkerFactory', () => worker);
    await fixture.whenStable();
    const settle = async () => {
      for (let i = 0; i < 4; i++) {
        await new Promise((resolve) => setTimeout(resolve, 5));
        await fixture.whenStable();
      }
    };
    await settle();
    const cells = () => fixture.componentInstance.model().rows.map((row) => fixture.componentInstance.model().columns.map((column) => column.valueAccessor(row)).join('|'));
    return {fixture, settle, cells};
  }

  it('le pivot vient du worker, identique au calcul direct, et se recalcule quand la configuration change', async () => {
    const worker = fakeWorker();
    const {fixture, settle, cells} = await create(worker);
    expect(worker.pivots).toBe(1);
    expect(cells()).toEqual(['Nord|10|30|40', 'Sud|5.5||5.5']);

    fixture.componentRef.setInput('config', config({values: [{id: 'amount', header: 'Montant', accessor: (s: Sale) => s.amount, aggregate: 'count'}]}));
    await settle();
    expect(worker.pivots).toBe(2);
    expect(cells()).toEqual(['Nord|1|1|2', 'Sud|1||1']);
  });

  it('sous le seuil de lignes, le worker n’est pas sollicité', async () => {
    const worker = fakeWorker();
    const {cells} = await create(worker, 1000);
    expect(worker.pivots).toBe(0);
    expect(cells()).toEqual(['Nord|10|30|40', 'Sud|5.5||5.5']);
  });

  it('worker en échec : le pivot revient sur le fil principal, sans message d’erreur', async () => {
    const warn = console.warn;
    console.warn = () => undefined;
    try {
      const {fixture, cells} = await create(fakeWorker(true));
      expect(cells()).toEqual(['Nord|10|30|40', 'Sud|5.5||5.5']);
      expect((fixture.nativeElement as HTMLElement).querySelector('.ngt-pivot__error')).toBeNull();
    } finally {
      console.warn = warn;
    }
  });
});
