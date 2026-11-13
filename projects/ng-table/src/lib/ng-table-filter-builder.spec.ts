import {Component, provideZonelessChangeDetection, signal, viewChild} from '@angular/core';
import {ComponentFixture, TestBed} from '@angular/core/testing';
import {beforeEach, describe, expect, it} from 'vitest';
import type {NgTableFilterGroup} from './advanced-filter';
import {NgTableFilterBuilderComponent} from './ng-table-filter-builder.component';
import {NgTableColumn, NgTableComponent, NgTableRemoteQuery} from './ng-table.component';

interface Row {
  id: string;
  statut: string;
  montant: number;
}

const ROWS: Row[] = [
  {id: '1', statut: 'Validée', montant: 8000},
  {id: '2', statut: 'Validée', montant: 200},
  {id: '3', statut: 'Expédiée', montant: 9000},
  {id: '4', statut: 'Annulée', montant: 7000},
];
const COLUMNS: NgTableColumn<Row>[] = [
  {id: 'statut', header: 'Statut', valueAccessor: (r) => r.statut, filter: {type: 'text'}},
  {id: 'montant', header: 'Montant', valueAccessor: (r) => r.montant, filter: {type: 'number'}},
];

@Component({
  imports: [NgTableComponent, NgTableFilterBuilderComponent],
  template: `
    <ng-table-filter-builder [(filter)]="filter" [columns]="columns" [debounceMs]="0"/>
    <ng-table (remoteQueryChange)="queries.push($event)" [(advancedFilter)]="filter" [columns]="columns" [dataMode]="mode()" [rows]="rows"/>
  `,
})
class HostComponent {
  readonly table = viewChild.required(NgTableComponent);
  readonly columns = COLUMNS;
  readonly rows = ROWS;
  readonly filter = signal<NgTableFilterGroup | null>(null);
  readonly mode = signal<'local' | 'remote'>('local');
  readonly queries: NgTableRemoteQuery[] = [];
}

describe('filtre avancé : constructeur et table', () => {
  let fixture: ComponentFixture<HostComponent>;
  const root = () => fixture.nativeElement as HTMLElement;
  const shown = () => (fixture.componentInstance.table().displayedRows() as Row[]).map((row) => row.id);
  const button = (text: string, index = 0) => [...root().querySelectorAll<HTMLButtonElement>('ng-table-filter-builder button')].filter((b) => b.textContent?.includes(text))[index];
  const set = async (element: HTMLInputElement | HTMLSelectElement, value: string, event = 'input') => {
    element.value = value;
    element.dispatchEvent(new Event(event, {bubbles: true}));
    await fixture.whenStable();
  };
  const values = () => [...root().querySelectorAll<HTMLInputElement>('.ngt-fb__value')];
  const columnSelects = () => [...root().querySelectorAll<HTMLSelectElement>('.ngt-fb__condition select')];

  beforeEach(async () => {
    TestBed.configureTestingModule({providers: [provideZonelessChangeDetection()]});
    fixture = TestBed.createComponent(HostComponent);
    await fixture.whenStable();
  });

  it('construit « Validée ET montant > 5000 », puis passe en OU', async () => {
    expect(shown()).toEqual(['1', '2', '3', '4']);
    button('Ajouter une condition').click();
    await fixture.whenStable();
    await set(values()[0], 'validée');
    expect(shown()).toEqual(['1', '2']);

    button('Ajouter une condition').click();
    await fixture.whenStable();
    await set(columnSelects()[1], 'montant', 'change');
    await set(values()[1], '>5000');
    expect(shown()).toEqual(['1']);
    expect(fixture.componentInstance.filter()).toEqual({
      operator: 'and',
      children: [{columnId: 'statut', value: 'validée'}, {columnId: 'montant', value: '>5000'}],
    });

    await set(root().querySelector<HTMLSelectElement>('.ngt-fb__operator')!, 'or', 'change');
    expect(shown()).toEqual(['1', '2', '3', '4']);
    expect(root().querySelector('.ngt-fb__joiner')?.textContent).toBe('OU');
  });

  it('groupe imbriqué et « sauf » : (Validée OU Expédiée) ET SAUF montant < 1000', async () => {
    button('Ajouter un groupe').click();
    await fixture.whenStable();
    // Le groupe ajouté dans un ET est un OU, avec une première condition.
    await set(values()[0], 'validée');
    button('Ajouter une condition', 0).click(); // bouton du groupe imbriqué : il vient avant celui du groupe racine
    await fixture.whenStable();
    await set(values()[1], 'expédiée');
    expect(shown()).toEqual(['1', '2', '3']);

    button('Ajouter une condition', 1).click(); // bouton du groupe racine
    await fixture.whenStable();
    expect(values()).toHaveLength(3);
    await set(columnSelects()[2], 'montant', 'change');
    await set(values()[2], '<1000');
    root().querySelectorAll<HTMLInputElement>('.ngt-fb__not input')[2].click();
    await fixture.whenStable();
    expect(shown()).toEqual(['1', '3']);
  });

  it('retirer une condition, tout effacer : le filtre redevient null', async () => {
    button('Ajouter une condition').click();
    await fixture.whenStable();
    await set(values()[0], 'annulée');
    expect(shown()).toEqual(['4']);
    root().querySelector<HTMLButtonElement>('.ngt-fb__condition .ngt-fb__icon')!.click();
    await fixture.whenStable();
    expect(fixture.componentInstance.filter()).toBeNull();
    expect(shown()).toEqual(['1', '2', '3', '4']);
  });

  it('liste vidée par le filtre avancé : « réinitialiser les filtres » de la table l’efface, et le constructeur suit', async () => {
    fixture.componentInstance.filter.set({operator: 'and', children: [{columnId: 'statut', value: 'introuvable'}]});
    await fixture.whenStable();
    expect(values()[0].value).toBe('introuvable');
    expect(shown()).toEqual([]);
    root().querySelector<HTMLButtonElement>('.no-data-cell__action')!.click();
    await fixture.whenStable();
    expect(fixture.componentInstance.filter()).toBeNull();
    expect(values()).toHaveLength(0);
    expect(shown()).toEqual(['1', '2', '3', '4']);
  });

  it('mode remote : le filtre part dans la requête, une seule fois par changement', async () => {
    fixture.componentInstance.mode.set('remote');
    await fixture.whenStable();
    fixture.componentInstance.queries.length = 0;
    const filter: NgTableFilterGroup = {operator: 'or', children: [{columnId: 'montant', value: '>5000'}]};
    fixture.componentInstance.filter.set(filter);
    await fixture.whenStable();
    expect(fixture.componentInstance.queries.map((query) => query.advancedFilter)).toEqual([filter]);
  });

  it('état de requête et vues : le filtre avancé est lu, appliqué, enregistré et restauré', async () => {
    const table = fixture.componentInstance.table();
    const filter: NgTableFilterGroup = {operator: 'and', children: [{columnId: 'montant', value: '>5000'}]};
    expect(table.getQueryState().advancedFilter).toBeUndefined();

    table.applyQueryState({advancedFilter: filter});
    await fixture.whenStable();
    expect(shown()).toEqual(['1', '3', '4']);
    expect(table.getQueryState().advancedFilter).toEqual(filter);
    expect(values()[0].value, 'le constructeur suit').toBe('>5000');

    // Une valeur mal formée (lien bricolé) retire le filtre au lieu de planter.
    table.applyQueryState({advancedFilter: {operator: 'xor', children: []} as never});
    await fixture.whenStable();
    expect(fixture.componentInstance.filter()).toBeNull();
    expect(shown()).toEqual(['1', '2', '3', '4']);

    // Absent de l'état : inchangé.
    table.applyQueryState({advancedFilter: filter});
    table.applyQueryState({search: ''});
    await fixture.whenStable();
    expect(shown()).toEqual(['1', '3', '4']);
  });

  it('accessibilité : chaque champ a un nom, le groupe est un fieldset avec légende', async () => {
    button('Ajouter une condition').click();
    await fixture.whenStable();
    const unnamed = [...root().querySelectorAll('ng-table-filter-builder select, ng-table-filter-builder input[type="text"], ng-table-filter-builder button')].filter(
      (element) => !(element.getAttribute('aria-label') || element.textContent || '').trim(),
    );
    expect(unnamed).toEqual([]);
    expect(root().querySelector('fieldset legend')?.textContent).toContain('ET');
  });
});
