import {TestBed} from '@angular/core/testing';
import {describe, expect, it} from 'vitest';
import {NgTableSetFilterComponent} from './ng-table-set-filter.component';
import type {SetFilterValue} from './set-filter';

const VALUES: SetFilterValue[] = [
  {key: 'Nord', label: 'Nord', count: 3},
  {key: 'Sud', label: 'Sud', count: 2},
  {key: '', label: '(Vides)', count: 1},
];

function create(value = '', values: readonly SetFilterValue[] = VALUES) {
  const fixture = TestBed.createComponent(NgTableSetFilterComponent);
  fixture.componentRef.setInput('values', values);
  fixture.componentRef.setInput('value', value);
  const emitted: string[] = [];
  fixture.componentInstance.valueChange.subscribe((v) => emitted.push(v));
  fixture.detectChanges();
  const root = fixture.nativeElement as HTMLElement;
  const rows = () => [...root.querySelectorAll<HTMLElement>('.ngt-setf__row')];
  const box = (row: HTMLElement) => row.querySelector('input') as HTMLInputElement;
  const all = () => root.querySelector('.ngt-setf__all input') as HTMLInputElement;
  const click = (input: HTMLInputElement) => input.click();
  return {fixture, root, emitted, rows, box, all, click};
}

describe('ng-table-set-filter', () => {
  it('sans filtre, tout est coché et chaque valeur montre son effectif', () => {
    const {rows, box, all} = create();
    expect(rows().map((row) => row.textContent?.replace(/\s+/g, '').trim())).toEqual(['Nord3', 'Sud2', '(Vides)1']);
    expect(rows().every((row) => box(row).checked)).toBe(true);
    expect(all().checked).toBe(true);
  });

  it('décocher une valeur émet l’ensemble des autres, dans l’ordre de la liste', () => {
    const {rows, box, click, emitted} = create();
    click(box(rows()[1]));
    expect(emitted).toEqual(['["Nord",""]']);
  });

  it('tout recocher efface le filtre (valeur vide) ; tout décocher ne garde rien', () => {
    const {rows, box, all, click, emitted} = create('["Nord"]');
    expect(rows().map((row) => box(row).checked)).toEqual([true, false, false]);
    expect(all().indeterminate).toBe(true);

    click(box(rows()[1]));
    expect(emitted.at(-1)).toBe('["Nord","Sud"]');

    const second = create('["Nord","Sud"]');
    second.click(second.box(second.rows()[2]));
    expect(second.emitted).toEqual(['']);

    const third = create();
    third.click(third.all());
    expect(third.emitted).toEqual(['[]']);
  });

  it('la recherche réduit la liste ; « tout sélectionner » ne porte que sur les valeurs visibles', () => {
    const {fixture, root, rows, all, click, emitted} = create('["Sud"]');
    const input = root.querySelector('.ngt-setf__search input') as HTMLInputElement;
    input.value = 'nor';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(rows().map((row) => row.textContent?.trim().startsWith('Nord'))).toEqual([true]);
    expect(all().checked).toBe(false);

    click(all());
    expect(emitted).toEqual(['["Nord","Sud"]']);
  });

  it('une liste vide affiche « aucune donnée », une liste tronquée le dit', () => {
    const empty = create('', []);
    expect(empty.root.querySelector('.ngt-setf__empty')).not.toBeNull();
    const fixture = TestBed.createComponent(NgTableSetFilterComponent);
    fixture.componentRef.setInput('values', VALUES);
    fixture.componentRef.setInput('truncated', true);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('.ngt-setf__note')).not.toBeNull();
  });
});
