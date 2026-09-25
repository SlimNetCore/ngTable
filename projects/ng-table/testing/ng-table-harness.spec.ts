import {Component, provideZonelessChangeDetection, signal} from '@angular/core';
import {TestBed} from '@angular/core/testing';
import {TestbedHarnessEnvironment} from '@angular/cdk/testing/testbed';
import {HarnessLoader} from '@angular/cdk/testing';
import {beforeEach, describe, expect, it} from 'vitest';
import {NgTableColumn, NgTableComponent} from '../src/public-api';
import {NgTableHarness} from './ng-table-harness';

interface Row {
  id: string;
  client: string;
  montant: number;
}

const ROWS: Row[] = [
  {id: '1', client: 'Dupont', montant: 300},
  {id: '2', client: 'Martin', montant: 100},
  {id: '3', client: 'Bernard', montant: 200},
];

@Component({
  standalone: true,
  imports: [NgTableComponent],
  template: `
    <ng-table
      [ariaLabel]="'Commandes'"
      [columns]="columns"
      [rows]="rows()"
      [globalSearchEnabled]="true"
      [multiSort]="true"
      [rowSelectionEnabled]="true"
      [paginator]="true"
      [pageSize]="2"
      (rowClick)="clicked.set($event)"
    />
  `,
})
class HostComponent {
  readonly rows = signal(ROWS);
  readonly clicked = signal<Row | null>(null);
  readonly columns: NgTableColumn<Row>[] = [
    {id: 'client', header: 'Client', valueAccessor: (r) => r.client, sortable: true, copy: true},
    {id: 'montant', header: 'Montant', valueAccessor: (r) => r.montant, sortable: true},
  ];
}

describe('NgTableHarness', () => {
  let loader: HarnessLoader;
  let host: HostComponent;

  beforeEach(async () => {
    TestBed.configureTestingModule({providers: [provideZonelessChangeDetection()]});
    const fixture = TestBed.createComponent(HostComponent);
    host = fixture.componentInstance;
    await fixture.whenStable();
    loader = TestbedHarnessEnvironment.loader(fixture);
  });

  it('se trouve par aria-label et lit en-têtes et cellules', async () => {
    const table = await loader.getHarness(NgTableHarness.with({ariaLabel: 'Commandes'}));

    expect(await table.getHeaderTexts()).toEqual(['Client', 'Montant']);
    // Le bouton « copier » de la colonne Client ne pollue pas le texte de la cellule.
    expect(await table.getCellTexts()).toEqual([['Dupont', '300'], ['Martin', '100']]);
    expect(await table.getRowCount()).toBe(2);
  });

  it('trie, y compris sur plusieurs niveaux', async () => {
    const table = await loader.getHarness(NgTableHarness);

    await table.sortBy('Montant');
    expect(await table.getSortDirection('Montant')).toBe('asc');
    expect(await table.getColumnTexts('Client')).toEqual(['Martin', 'Bernard']);

    await table.sortBy('Client', {additive: true});
    expect(await table.getSortDirection('Montant')).toBe('asc'); // reste le tri principal
    expect(await table.getLiveAnnouncement()).toContain('Client, tri croissant');
  });

  it('recherche sans attendre le debounce', async () => {
    const table = await loader.getHarness(NgTableHarness);

    await table.search('bern');

    expect(await table.getSearchValue()).toBe('bern');
    expect(await table.getColumnTexts('Client')).toEqual(['Bernard']);

    await table.search('introuvable');
    expect(await table.getEmptyText()).toBeTruthy();
  });

  it('pilote la pagination intégrée, la sélection et le clic de ligne', async () => {
    const table = await loader.getHarness(NgTableHarness);

    const paginator = (await table.getPaginator())!;
    await paginator.goToNextPage();
    expect(await table.getColumnTexts('Client')).toEqual(['Bernard']);

    const [row] = await table.getRows();
    await row.toggleSelection();
    expect(await row.isSelected()).toBe(true);

    await row.click();
    expect(host.clicked()?.client).toBe('Bernard');
  });
});
