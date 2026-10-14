import {TestBed} from '@angular/core/testing';
import {describe, expect, it, vi} from 'vitest';
import {NgTablePivotComponent} from './ng-table-pivot.component';
import {computePivot, PivotConfig, PivotDatasource, PivotField, pivotToServerResult} from './pivot';

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

const REGION: PivotField<Sale> = {id: 'region', header: 'Région', accessor: (s) => s.region};
const YEAR: PivotField<Sale> = {id: 'year', header: 'Année', accessor: (s) => s.year};
const AMOUNT: PivotField<Sale> = {id: 'amount', header: 'Montant', accessor: (s) => s.amount};

const base = (): PivotConfig<Sale> => ({rows: [REGION], columns: YEAR, values: [{...AMOUNT, aggregate: 'sum'}]});

/** Faux serveur : pivote `SALES` comme le ferait une base de données. */
const fakeServer =
  (log: string[] = []): PivotDatasource =>
  async (request) => {
    log.push(JSON.stringify(request));
    const fields = new Map([REGION, YEAR, AMOUNT].map((field) => [field.id, field]));
    const config: PivotConfig<Sale> = {
      rows: request.rows.map((id) => fields.get(id)!),
      columns: request.column ? fields.get(request.column)! : null,
      values: request.values.map((value) => ({...fields.get(value.id)!, aggregate: value.aggregate})),
      columnSort: request.columnSort,
    };
    return pivotToServerResult(computePivot(SALES, config), config as PivotConfig<unknown>);
  };

/** Laisse les promesses du faux serveur se résoudre, puis la détection de changements s'exécuter. */
const settle = async (fixture: { whenStable: () => Promise<unknown> }) => {
  await new Promise((resolve) => setTimeout(resolve));
  await fixture.whenStable();
};

const headers = (root: HTMLElement) => [...root.querySelectorAll('tr.mat-mdc-header-row')].pop()!.textContent?.replace(/\s+/g, ' ').trim();

describe('NgTablePivotComponent : serveur', () => {
  it('affiche le pivot calculé par le serveur, sans lire [rows]', async () => {
    const log: string[] = [];
    const fixture = TestBed.createComponent(NgTablePivotComponent<Sale>);
    fixture.componentRef.setInput('config', base());
    fixture.componentRef.setInput('datasource', fakeServer(log));
    await fixture.whenStable();

    const root = fixture.nativeElement as HTMLElement;
    expect(JSON.parse(log[0])).toMatchObject({rows: ['region'], column: 'year', values: [{id: 'amount', aggregate: 'sum'}]});
    expect(headers(root)).toContain('2025');
    expect(root.querySelectorAll('tr.data-row')).toHaveLength(3); // Nord, Sud + total
    expect(root.querySelector('td.mat-column-pivot-row-0')?.textContent?.trim()).toBe('Nord');
  });

  it('une réponse périmée est ignorée, et la requête précédente est annulée', async () => {
    const resolvers: ((value: Awaited<ReturnType<PivotDatasource>>) => void)[] = [];
    const signals: AbortSignal[] = [];
    const datasource: PivotDatasource = (_request, {signal}) => {
      signals.push(signal);
      return new Promise((resolve) => resolvers.push(resolve));
    };
    const fixture = TestBed.createComponent(NgTablePivotComponent<Sale>);
    fixture.componentRef.setInput('config', base());
    fixture.componentRef.setInput('datasource', datasource);
    await fixture.whenStable();
    fixture.componentRef.setInput('config', {...base(), columns: null});
    await fixture.whenStable();
    expect(signals).toHaveLength(2);
    expect(signals[0].aborted).toBe(true);

    const current = fakeServer();
    resolvers[1](await current({rows: ['region'], column: null, values: [{id: 'amount', aggregate: 'sum'}], columnSort: 'asc'}, {signal: signals[1]}));
    resolvers[0]({rows: [{labels: ['PÉRIMÉ'], cells: {}}]}); // arrive après : ne doit rien changer
    await settle(fixture);
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('PÉRIMÉ');
    expect((fixture.nativeElement as HTMLElement).querySelectorAll('tr.data-row')).toHaveLength(3);
  });

  it('une erreur du serveur est signalée, avec un bouton pour réessayer', async () => {
    let calls = 0;
    const datasource: PivotDatasource = async (request, options) => {
      if (++calls === 1) {
        throw new Error('503');
      }
      return fakeServer()(request, options);
    };
    const fixture = TestBed.createComponent(NgTablePivotComponent<Sale>);
    const errors: unknown[] = [];
    fixture.componentInstance.pivotError.subscribe((e) => errors.push(e));
    fixture.componentRef.setInput('config', base());
    fixture.componentRef.setInput('datasource', datasource);
    await fixture.whenStable();

    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('[role="alert"]')).not.toBeNull();
    expect(errors).toHaveLength(1);
    (root.querySelector('.ngt-pivot-error button') as HTMLButtonElement).click();
    await settle(fixture);
    expect(root.querySelector('[role="alert"]')).toBeNull();
    expect(root.querySelectorAll('tr.data-row')).toHaveLength(3);
  });

  it('transmet les filtres au serveur', async () => {
    const log: string[] = [];
    const fixture = TestBed.createComponent(NgTablePivotComponent<Sale>);
    fixture.componentRef.setInput('config', base());
    fixture.componentRef.setInput('datasource', fakeServer(log));
    fixture.componentRef.setInput('filters', {region: 'Nord'});
    await fixture.whenStable();
    expect(JSON.parse(log.at(-1)!).filters).toEqual({region: 'Nord'});
  });
});

describe('NgTablePivotComponent : configurateur', () => {
  const create = async (config: PivotConfig<Sale>) => {
    const fixture = TestBed.createComponent(NgTablePivotComponent<Sale>);
    fixture.componentRef.setInput('rows', SALES);
    fixture.componentRef.setInput('config', config);
    fixture.componentRef.setInput('dimensions', [REGION, YEAR]);
    fixture.componentRef.setInput('measures', [AMOUNT]);
    fixture.componentRef.setInput('configurator', true);
    await fixture.whenStable();
    return fixture;
  };
  const zone = (root: HTMLElement, id: string) => root.querySelector(`[data-zone="${id}"]`) as HTMLElement;
  const chips = (el: HTMLElement) => [...el.querySelectorAll('.ngt-pivot-chip')].map((c) => c.textContent?.replace(/\s+/g, ' ').replace('×', '').trim());
  const dragEvent = (type: string) => {
    const event = new Event(type, {bubbles: true, cancelable: true}) as DragEvent;
    Object.defineProperty(event, 'dataTransfer', {value: {setData: vi.fn(), effectAllowed: ''}});
    return event;
  };

  it('montre où est chaque champ, et les champs inutilisés', async () => {
    const fixture = await create({rows: [REGION], columns: null, values: [{...AMOUNT, aggregate: 'sum'}]});
    const root = fixture.nativeElement as HTMLElement;
    expect(chips(zone(root, 'rows'))[0]).toContain('Région');
    expect(chips(zone(root, 'values'))[0]).toContain('Montant');
    expect(chips(root.querySelector('.ngt-pivot-zone--fields') as HTMLElement)).toEqual(['Année']);
  });

  it('glisser un champ dans « Colonnes » met à jour la configuration et le tableau', async () => {
    const fixture = await create({rows: [REGION], columns: null, values: [{...AMOUNT, aggregate: 'sum'}]});
    const root = fixture.nativeElement as HTMLElement;
    const year = root.querySelector('.ngt-pivot-zone--fields .ngt-pivot-chip') as HTMLElement;

    year.dispatchEvent(dragEvent('dragstart'));
    zone(root, 'column').dispatchEvent(dragEvent('dragover'));
    zone(root, 'column').dispatchEvent(dragEvent('drop'));
    await fixture.whenStable();

    expect(fixture.componentInstance.config().columns?.id).toBe('year');
    expect(headers(root)).toContain('2026');
  });

  it('un champ ne se dépose pas dans une zone qui ne lui convient pas', async () => {
    const fixture = await create({rows: [REGION], columns: null, values: []});
    const root = fixture.nativeElement as HTMLElement;
    const amount = root.querySelectorAll('.ngt-pivot-zone--fields .ngt-pivot-chip')[1] as HTMLElement; // « Montant » (après « Année »)
    amount.dispatchEvent(dragEvent('dragstart'));
    const over = dragEvent('dragover');
    zone(root, 'rows').dispatchEvent(over);
    expect(over.defaultPrevented).toBe(false); // une mesure ne va pas en lignes
    const ok = dragEvent('dragover');
    zone(root, 'values').dispatchEvent(ok);
    expect(ok.defaultPrevented).toBe(true);
  });

  it('au clavier : la liste « + » ajoute un champ, « × » le retire, l’agrégat se change', async () => {
    const fixture = await create({rows: [REGION], columns: null, values: [{...AMOUNT, aggregate: 'sum'}]});
    const root = fixture.nativeElement as HTMLElement;

    const add = zone(root, 'column').querySelector('select.ngt-pivot-add') as HTMLSelectElement;
    add.value = 'year';
    add.dispatchEvent(new Event('change', {bubbles: true}));
    await fixture.whenStable();
    expect(fixture.componentInstance.config().columns?.id).toBe('year');

    const aggregate = zone(root, 'values').querySelector('select.ngt-pivot-agg') as HTMLSelectElement;
    aggregate.value = 'max';
    aggregate.dispatchEvent(new Event('change', {bubbles: true}));
    await fixture.whenStable();
    expect(fixture.componentInstance.config().values[0].aggregate).toBe('max');

    (zone(root, 'rows').querySelector('.ngt-pivot-chip__x') as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(fixture.componentInstance.config().rows).toEqual([]);
  });
});
