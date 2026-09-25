import {Component, provideZonelessChangeDetection} from '@angular/core';
import {TestBed} from '@angular/core/testing';
import {provideRouter, Router} from '@angular/router';
import {RouterTestingHarness} from '@angular/router/testing';
import {describe, expect, it} from 'vitest';
import {NgTableColumn, NgTableComponent, NgTableQueryState} from '../src/public-api';
import {NgTableUrlStateDirective} from './ng-table-url-state.directive';
import {fromUrlParams, toUrlParams} from './url-state';

const EMPTY: NgTableQueryState = {sorts: [], filters: {}, search: '', pageIndex: 0, pageSize: 10, groupBy: null, collapsedGroups: []};

describe('url-state', () => {
  it('écrit des paramètres lisibles, sans les valeurs par défaut', () => {
    const params = toUrlParams(
      {
        sorts: [{columnId: 'montant', direction: 'desc'}, {columnId: 'client', direction: 'asc'}],
        filters: {statut: 'VALIDEE', client: ''},
        search: 'dupont',
        pageIndex: 2,
        pageSize: 10,
        groupBy: 'statut',
        collapsedGroups: ['VALIDEE'],
      },
      '',
      10,
    );
    // Les groupes repliés ne vont pas dans l'URL.
    expect(params).toEqual({s: 'montant:desc,client:asc', q: 'dupont', p: '3', g: 'statut', 'f.statut': 'VALIDEE'});
    expect(toUrlParams(EMPTY, '', 10)).toEqual({});
  });

  it('préfixe les paramètres et retire ceux qui ne servent plus', () => {
    const params = toUrlParams({...EMPTY, search: 'x'}, 'cmd', 10, {'cmd.s': 'a:asc', 'cmd.f.statut': 'X', autre: '1'});
    expect(params).toEqual({'cmd.s': null, 'cmd.f.statut': null, 'cmd.q': 'x'});
  });

  it('relit ce qu’il a écrit et ignore les valeurs invalides', () => {
    const state: NgTableQueryState = {
      sorts: [{columnId: 'montant', direction: 'desc'}],
      filters: {statut: 'VALIDEE'},
      search: 'dupont',
      pageIndex: 4,
      pageSize: 50,
      groupBy: 'client',
      collapsedGroups: [],
    };
    const params = toUrlParams(state, 'cmd', 10) as Record<string, string>;
    expect(fromUrlParams(params, 'cmd', 10)).toEqual(state);

    expect(fromUrlParams({s: 'montant:sideways,:asc', p: '-2', ps: 'abc'}, '', 25)).toEqual({...EMPTY, pageSize: 25});
  });
});

interface Row {
  id: string;
  client: string;
  montant: number;
}

@Component({
  standalone: true,
  imports: [NgTableComponent, NgTableUrlStateDirective],
  template: `<ng-table ngTableUrlState [columns]="columns" [rows]="rows" [globalSearchEnabled]="true" [paginator]="true" [pageSize]="1" />`,
})
class ListComponent {
  readonly rows: Row[] = [
    {id: '1', client: 'Dupont', montant: 300},
    {id: '2', client: 'Martin', montant: 100},
    {id: '3', client: 'Durand', montant: 200},
  ];
  readonly columns: NgTableColumn<Row>[] = [
    {id: 'client', header: 'Client', valueAccessor: (r) => r.client, sortable: true, filter: {type: 'text'}},
    {id: 'montant', header: 'Montant', valueAccessor: (r) => r.montant, sortable: true},
  ];
}

describe('NgTableUrlStateDirective', () => {
  async function open(url: string) {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), provideRouter([{path: 'liste', component: ListComponent}])],
    });
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url);
    await harness.fixture.whenStable();
    const table = harness.fixture.debugElement.query((el) => el.name === 'ng-table').componentInstance as NgTableComponent<Row>;
    return {harness, table, router: TestBed.inject(Router)};
  }

  it('applique l’état de l’URL au chargement', async () => {
    const {table} = await open('/liste?s=montant:desc&q=du&p=2');

    expect(table.getQueryState()).toMatchObject({sorts: [{columnId: 'montant', direction: 'desc'}], search: 'du', pageIndex: 1});
    expect(table.displayedRows().map((r) => r.client)).toEqual(['Durand']); // "du" : Dupont, Durand ; page 2
  });

  it('écrit dans l’URL chaque changement de la table', async () => {
    const {harness, table, router} = await open('/liste');

    table.applyQueryState({sorts: [{columnId: 'client', direction: 'asc'}], filters: {client: 'mar'}});
    await harness.fixture.whenStable();

    expect(router.url).toBe('/liste?s=client:asc&f.client=mar');
  });

  it('suit une navigation vers d’autres paramètres (Précédent / lien)', async () => {
    const {harness, table} = await open('/liste?q=dupont');

    await harness.navigateByUrl('/liste?q=martin');
    await harness.fixture.whenStable();

    expect(table.getQueryState().search).toBe('martin');
    expect(table.displayedRows().map((r) => r.client)).toEqual(['Martin']);
  });
});
