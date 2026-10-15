import {TestBed} from '@angular/core/testing';
import {describe, expect, it} from 'vitest';
import {NG_TABLE_LABELS_EN} from './ng-table-labels';
import {NgTableCheckboxChange, NgTableCheckboxComponent} from './ng-table-checkbox.component';
import {NgTablePageEvent, NgTablePaginatorComponent} from './ng-table-paginator.component';

const create = async (inputs: Record<string, unknown> = {}) => {
  const fixture = TestBed.createComponent(NgTablePaginatorComponent);
  const events: NgTablePageEvent[] = [];
  fixture.componentInstance.page.subscribe((event) => events.push(event));
  for (const [name, value] of Object.entries({length: 95, pageIndex: 0, pageSize: 20, pageSizeOptions: [10, 20, 50], ...inputs})) {
    fixture.componentRef.setInput(name, value);
  }
  await fixture.whenStable();
  const root = fixture.nativeElement as HTMLElement;
  const buttons = () => [...root.querySelectorAll<HTMLButtonElement>('.ngt-pager__buttons button')];
  return {fixture, root, events, buttons, range: () => root.querySelector('.ngt-pager__range')?.textContent?.trim()};
};

describe('paginateur', () => {
  it('affiche la plage et les textes français par défaut', async () => {
    const {range, root} = await create();
    expect(range()).toBe('1 – 20 sur 95');
    expect(root.querySelector('.ngt-pager__size span')?.textContent).toBe('Éléments par page');
    expect(root.querySelector('button')?.getAttribute('aria-label')).toBe('Première page');
  });

  it('suit [labels] : les textes viennent de la table, pas de Material', async () => {
    const {range, root} = await create({labels: NG_TABLE_LABELS_EN, pageIndex: 4});
    expect(range()).toBe('81 – 95 of 95');
    expect(root.querySelector('.ngt-pager__size span')?.textContent).toBe('Items per page');
  });

  it('première / précédente / suivante / dernière page, bornes comprises', async () => {
    const {fixture, events, buttons} = await create({pageIndex: 2});
    buttons()[3].click(); // dernière : 95 / 20 → page 4
    buttons()[0].click();
    buttons()[1].click();
    buttons()[2].click();
    expect(events.map((event) => event.pageIndex)).toEqual([4, 0, 1, 3]);
    expect(events[0]).toMatchObject({previousPageIndex: 2, pageSize: 20, length: 95});

    fixture.componentRef.setInput('pageIndex', 0);
    await fixture.whenStable();
    expect(buttons().map((button) => button.disabled)).toEqual([true, true, false, false]);
    fixture.componentRef.setInput('pageIndex', 4);
    await fixture.whenStable();
    expect(buttons().map((button) => button.disabled)).toEqual([false, false, true, true]);
  });

  it('changer la taille de page garde la première ligne affichée', async () => {
    const {root, events} = await create({pageIndex: 3, pageSize: 20}); // lignes 61 à 80
    const select = root.querySelector('select') as HTMLSelectElement;
    select.value = '50';
    select.dispatchEvent(new Event('change'));
    expect(events).toEqual([{pageIndex: 1, previousPageIndex: 3, pageSize: 50, length: 95}]); // ligne 61 → page 2 de 50
    select.value = '20';
    select.dispatchEvent(new Event('change'));
    expect(events).toHaveLength(1); // même taille : rien
  });

  it('sans données : « 0 sur 0 » ; une seule taille proposée : pas de choix', async () => {
    const {range, root} = await create({length: 0, pageSizeOptions: [20]});
    expect(range()).toBe('0 sur 0');
    expect(root.querySelector('select')).toBeNull();
  });
});

describe('case à cocher', () => {
  const make = async (inputs: Record<string, unknown> = {}) => {
    const fixture = TestBed.createComponent(NgTableCheckboxComponent);
    const changes: NgTableCheckboxChange[] = [];
    fixture.componentInstance.checkedChange.subscribe((event) => changes.push(event));
    for (const [name, value] of Object.entries(inputs)) {
      fixture.componentRef.setInput(name, value);
    }
    await fixture.whenStable();
    const input = (fixture.nativeElement as HTMLElement).querySelector('input') as HTMLInputElement;
    return {fixture, input, changes};
  };

  it('est un vrai <input type="checkbox"> avec son nom accessible', async () => {
    const {input} = await make({checked: true, ariaLabel: 'Tout sélectionner'});
    expect(input.type).toBe('checkbox');
    expect(input.checked).toBe(true);
    expect(input.getAttribute('aria-label')).toBe('Tout sélectionner');
  });

  it('émet le nouvel état, et reprend celui du parent quand il ne change pas [checked] (contrôlée)', async () => {
    const {fixture, input, changes} = await make({checked: false});
    input.click();
    expect(changes).toEqual([{checked: true}]);
    await fixture.whenStable();
    expect(input.checked).toBe(false); // le parent n'a rien changé : la case revient en arrière
  });

  it('l’événement natif change ne remonte pas jusqu’à l’hôte', async () => {
    const {fixture, input} = await make({checked: false});
    let hostCalls = 0;
    (fixture.nativeElement as HTMLElement).addEventListener('change', () => hostCalls++);
    input.click();
    expect(hostCalls).toBe(0);
  });

  it('indéterminée et désactivée', async () => {
    const {input} = await make({indeterminate: true, disabled: true});
    expect(input.indeterminate).toBe(true);
    expect(input.disabled).toBe(true);
  });
});
