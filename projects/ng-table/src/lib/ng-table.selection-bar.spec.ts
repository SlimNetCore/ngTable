import {provideZonelessChangeDetection} from '@angular/core';
import {TestBed} from '@angular/core/testing';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {NgTableColumn, NgTableComponent} from './ng-table.component';
import type {NgTableSelectionAction, NgTableSelectionActionEvent} from './selection-actions';

interface Row {
  id: string;
  nom: string;
  statut: 'BROUILLON' | 'VALIDEE';
}

const ROWS: Row[] = [
  {id: '1', nom: 'Charlie', statut: 'BROUILLON'},
  {id: '2', nom: 'Alice', statut: 'BROUILLON'},
  {id: '3', nom: 'Bob', statut: 'VALIDEE'},
  {id: '4', nom: 'David', statut: 'VALIDEE'},
];

const columns = (): NgTableColumn<Row>[] => [
  {id: 'nom', header: 'Nom', valueAccessor: (r) => r.nom, sortable: true},
  {id: 'statut', header: 'Statut', valueAccessor: (r) => r.statut, sortable: true},
];

const run = vi.fn();
const actions = (): NgTableSelectionAction<Row>[] => [
  {id: 'validate', label: 'Valider', icon: 'check', appearance: 'primary', when: (rows) => rows.every((row) => row.statut === 'BROUILLON'), run},
  {id: 'ship', label: 'Expédier', when: (rows) => rows.every((row) => row.statut === 'VALIDEE'), otherwise: 'disable', disabledReason: 'Seules les commandes validées'},
  {id: 'edit', label: 'Modifier', maxRows: 1},
  {id: 'delete', label: 'Supprimer', appearance: 'danger', icon: 'delete'},
];

async function create(inputs: Record<string, unknown> = {}) {
  const fixture = TestBed.createComponent(NgTableComponent);
  const all: Record<string, unknown> = {columns: columns(), rows: ROWS, rowSelectionEnabled: true, selectionBar: true, selectionActions: actions(), ...inputs};
  for (const [name, value] of Object.entries(all)) {
    fixture.componentRef.setInput(name, value);
  }
  const events: NgTableSelectionActionEvent<Row>[] = [];
  fixture.componentInstance.selectionAction.subscribe((event) => events.push(event as NgTableSelectionActionEvent<Row>));
  await fixture.whenStable();
  const root = fixture.nativeElement as HTMLElement;
  const select = async (...ids: string[]) => {
    fixture.componentInstance['commitSelection'](new Set(ids), null, true);
    await fixture.whenStable();
  };
  const bar = () => root.querySelector('.ngt-action-bar') as HTMLElement | null;
  const labels = () => [...root.querySelectorAll('.ngt-action-bar__action')].map((button) => button.textContent?.replace(/\s+/g, ' ').trim());
  const button = (label: string) => [...root.querySelectorAll<HTMLButtonElement>('.ngt-action-bar__action')].find((candidate) => candidate.textContent?.includes(label))!;
  return {fixture, component: fixture.componentInstance, root, select, bar, labels, button, events};
}

describe('NgTableComponent — barre d’actions de sélection', () => {
  beforeEach(() => {
    localStorage.clear();
    run.mockClear();
    TestBed.configureTestingModule({providers: [provideZonelessChangeDetection()]});
  });

  it('n’apparaît qu’avec une sélection, et seulement si l’option est activée', async () => {
    const {bar, select, fixture} = await create();
    expect(bar()).toBeNull();
    await select('1');
    expect(bar()).not.toBeNull();
    expect(bar()?.getAttribute('role')).toBe('toolbar');
    expect(bar()?.querySelector('.ngt-action-bar__badge')?.textContent).toBe('1');
    expect(bar()?.querySelector('.ngt-action-bar__count-text')?.textContent?.trim()).toBe('1 ligne sélectionnée');

    const off = await create({selectionBar: false});
    await off.select('1');
    expect(off.bar()).toBeNull();
    void fixture;
  });

  it('montre le nombre de lignes et ne propose que les actions dont la règle est respectée', async () => {
    const {bar, select, labels} = await create();
    await select('1', '2');
    expect(bar()?.querySelector('.ngt-action-bar__badge')?.textContent).toBe('2');
    expect(bar()?.querySelector('.ngt-action-bar__count-text')?.textContent?.trim()).toBe('2 lignes sélectionnées');
    // Brouillons : « Valider » oui, « Expédier » grisée (otherwise: disable), « Modifier » (max 1) masquée.
    expect(labels()).toEqual(['Valider', 'Expédier', 'Supprimer']);

    await select('3', '4');
    expect(labels()).toEqual(['Expédier', 'Supprimer']);

    await select('1');
    expect(labels()).toEqual(['Valider', 'Expédier', 'Modifier', 'Supprimer']);
  });

  it('un clic exécute run(), émet (selectionAction) avec les lignes, et ignore une action grisée', async () => {
    const {select, button, events} = await create();
    await select('1', '2');

    button('Valider').click();
    expect(run).toHaveBeenCalledTimes(1);
    expect(events).toHaveLength(1);
    expect(events[0].action.id).toBe('validate');
    expect(events[0].rows.map((row) => row.id)).toEqual(['1', '2']);

    const ship = button('Expédier');
    expect(ship.getAttribute('aria-disabled')).toBe('true');
    ship.click();
    expect(events).toHaveLength(1);
  });

  it('la règle d’affichage cache la barre quand la sélection ne la satisfait pas', async () => {
    const {bar, select} = await create({selectionBarWhen: (rows: readonly Row[]) => rows.every((row) => row.statut === 'BROUILLON')});
    await select('1', '2');
    expect(bar()).not.toBeNull();
    await select('1', '3');
    expect(bar()).toBeNull();
  });

  it('les actions au-delà de selectionBarMaxActions passent dans le menu « Autres actions »', async () => {
    const {root, select, labels, fixture} = await create({selectionBarMaxActions: 2});
    await select('1');
    expect(labels()).toEqual(['Valider', 'Expédier', '']);
    const more = root.querySelector<HTMLButtonElement>('[aria-label="Autres actions"]')!;
    more.click();
    await fixture.whenStable();
    const items = [...document.querySelectorAll('.ngt-menu-panel [ngt-menu-item]')].map((item) => item.textContent?.replace(/\s+/g, ' ').trim());
    expect(items).toEqual(['Modifier', 'Supprimer']);
  });

  it('« Tout désélectionner » et Échap vident la sélection ; « Tout sélectionner » prend toutes les lignes filtrées', async () => {
    const {component, root, select, bar, fixture} = await create();
    await select('1');
    const selectAll = [...root.querySelectorAll<HTMLButtonElement>('.ngt-action-bar__link')][0];
    expect(selectAll.textContent).toContain('Tout sélectionner (4)');
    selectAll.click();
    await fixture.whenStable();
    expect(component.selectedRowsCount()).toBe(4);
    expect(root.querySelector('.ngt-action-bar__link')).toBeNull(); // tout est déjà sélectionné

    root.querySelector<HTMLButtonElement>('.ngt-action-bar__clear')!.click();
    await fixture.whenStable();
    expect(component.selectedRowsCount()).toBe(0);
    expect(bar()).toBeNull();

    await select('2');
    bar()!.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true}));
    await fixture.whenStable();
    expect(bar()).toBeNull();
  });

  it('une règle qui échoue ne fait pas disparaître le tableau : la barre se masque', async () => {
    const {bar, select} = await create({
      selectionBarWhen: () => {
        throw new Error('règle cassée');
      },
    });
    await select('1');
    expect(bar()).toBeNull();
  });
});
