import {provideZonelessChangeDetection} from '@angular/core';
import {TestBed} from '@angular/core/testing';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import type {ComputeWorkerLike} from './compute-worker-client';
import {NgTableColumn, NgTableComponent} from './ng-table.component';
import {FromWorker, ToWorker, WorkerComputeCore} from './worker-compute';

interface Row {
  id: number;
  nom: string;
  montant: number;
  statut: string;
}

const ROWS: Row[] = [
  {id: 1, nom: 'Charlie', montant: 300, statut: 'VALIDEE'},
  {id: 2, nom: 'alice', montant: 100, statut: 'BROUILLON'},
  {id: 3, nom: 'Bob', montant: 200, statut: 'VALIDEE'},
  {id: 4, nom: 'david', montant: 50, statut: 'VALIDEE'},
];

const columns = (): NgTableColumn<Row>[] => [
  {id: 'nom', header: 'Nom', valueAccessor: (r) => r.nom, sortable: true, filter: {type: 'text'}},
  {id: 'montant', header: 'Montant', valueAccessor: (r) => r.montant, sortable: true, filter: {type: 'number'}},
  {id: 'statut', header: 'Statut', valueAccessor: (r) => r.statut, filter: {type: 'enum', options: [{value: 'VALIDEE', label: 'Validée'}, {value: 'BROUILLON', label: 'Brouillon'}]}},
];

/** Un « worker » qui exécute le cœur dans le même fil, de façon asynchrone. `failing` : chaque calcul échoue. */
function fakeWorker(options: {failing?: boolean} = {}): ComputeWorkerLike & {runs: number} {
  const core = new WorkerComputeCore();
  const worker: ComputeWorkerLike & {runs: number} = {
    runs: 0,
    onmessage: null,
    onerror: null,
    terminate: () => undefined,
    postMessage(message: ToWorker) {
      const reply = (answer: FromWorker) => setTimeout(() => worker.onmessage?.({data: answer}), 0);
      if (message.type === 'data') {
        core.addData(message.dataset, message.count, message.entries);
      } else if (message.type === 'drop') {
        core.drop(message.dataset);
      } else {
        worker.runs++;
        if (options.failing) {
          reply({type: 'error', job: message.job, message: 'échec simulé'});
        } else {
          reply({type: 'done', job: message.job, order: core.run(message.dataset, message.request)});
        }
      }
    },
  };
  return worker;
}

async function create(inputs: Record<string, unknown>) {
  const fixture = TestBed.createComponent(NgTableComponent);
  const all: Record<string, unknown> = {columns: columns(), rows: ROWS, ...inputs};
  for (const [name, value] of Object.entries(all)) {
    fixture.componentRef.setInput(name, value);
  }
  const busy: boolean[] = [];
  fixture.componentInstance.computing.subscribe((value) => busy.push(value));
  await fixture.whenStable();
  const settle = async () => {
    for (let i = 0; i < 4; i++) {
      await new Promise((resolve) => setTimeout(resolve, 5));
      await fixture.whenStable();
    }
  };
  const ids = () => (fixture.componentInstance.displayedRows() as Row[]).map((row) => row.id);
  return {fixture, component: fixture.componentInstance, busy, settle, ids};
}

describe('NgTableComponent — calcul en worker', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({providers: [provideZonelessChangeDetection()]});
  });

  it('sous le seuil de lignes, tout reste sur le fil principal : aucun worker n’est créé', async () => {
    const factory = vi.fn(() => fakeWorker());
    const {component, ids, settle} = await create({workerCompute: true, workerThreshold: 1000, computeWorkerFactory: factory});
    component['onHeaderSort'](component.columns()[1]);
    await settle();
    expect(factory).not.toHaveBeenCalled();
    expect(ids()).toEqual([4, 2, 3, 1]);
  });

  it('trie dans le worker : l’ordre est celui du fil principal, l’attente est signalée puis levée', async () => {
    const worker = fakeWorker();
    const {fixture, component, ids, settle, busy} = await create({workerCompute: true, workerThreshold: 1, computeWorkerFactory: () => worker});
    expect(ids()).toEqual([1, 2, 3, 4]); // rien à calculer : l'ordre d'arrivée

    component['onHeaderSort'](component.columns()[1]); // montant croissant
    await fixture.whenStable();
    expect(component['workerBusy']()).toBe(true);
    expect(fixture.nativeElement.querySelector('.table-viewport')?.getAttribute('aria-busy')).toBe('true');

    await settle();
    expect(ids()).toEqual([4, 2, 3, 1]);
    expect(component['workerBusy']()).toBe(false);
    expect(busy).toEqual([false, true, false]);
    expect(worker.runs).toBe(1);

    component['onHeaderSort'](component.columns()[1]); // décroissant
    await settle();
    expect(ids()).toEqual([1, 3, 2, 4]);
  });

  it('filtre dans le worker, puis retrouve tout quand le filtre est vidé', async () => {
    const worker = fakeWorker();
    const {component, ids, settle} = await create({workerCompute: true, workerThreshold: 1, computeWorkerFactory: () => worker});

    component.applyQueryState({filters: {statut: 'VALIDEE'}});
    await settle();
    expect(ids()).toEqual([1, 3, 4]);

    component.applyQueryState({filters: {statut: 'VALIDEE', montant: '>=100'}});
    await settle();
    expect(ids()).toEqual([1, 3]);

    component.applyQueryState({filters: {}});
    await settle();
    expect(ids()).toEqual([1, 2, 3, 4]);
  });

  it('les transactions de données recalculent dans le worker (nouvelles données)', async () => {
    const worker = fakeWorker();
    const {component, ids, settle} = await create({workerCompute: true, workerThreshold: 1, computeWorkerFactory: () => worker});
    component['onHeaderSort'](component.columns()[1]);
    await settle();
    expect(ids()).toEqual([4, 2, 3, 1]);

    component.applyTransaction({update: [{id: 1, nom: 'Charlie', montant: 10, statut: 'VALIDEE'}]});
    await settle();
    expect(ids()).toEqual([1, 4, 2, 3]);
  });

  it('un worker en échec ne casse pas la table : retour au fil principal, résultat identique', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const {component, ids, settle} = await create({workerCompute: true, workerThreshold: 1, computeWorkerFactory: () => fakeWorker({failing: true})});

    component['onHeaderSort'](component.columns()[1]);
    await settle();
    expect(warn).toHaveBeenCalled();
    expect(component['workerBusy']()).toBe(false);
    expect(ids()).toEqual([4, 2, 3, 1]);

    component.applyQueryState({filters: {statut: 'BROUILLON'}});
    await settle();
    expect(ids()).toEqual([2]);
    warn.mockRestore();
  });

  it('un filtre à filterPredicate (fonction) se calcule sur le fil principal, même au-dessus du seuil', async () => {
    const worker = fakeWorker();
    const cols = columns();
    cols[0] = {...cols[0], filterPredicate: (row, value) => row.nom.toLowerCase().startsWith(value.toLowerCase())};
    const {component, ids, settle} = await create({columns: cols, workerCompute: true, workerThreshold: 1, computeWorkerFactory: () => worker});
    component.applyQueryState({filters: {nom: 'b'}});
    await settle();
    expect(ids()).toEqual([3]);
    expect(worker.runs).toBe(0);
  });
});
