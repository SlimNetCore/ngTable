import {ComponentFixture, TestBed} from '@angular/core/testing';
import {describe, expect, it} from 'vitest';
import {ColumnFilterRendererComponent, ColumnFilterType} from './column-filter-renderer.component';

function create(type: ColumnFilterType, value = '') {
  const fixture: ComponentFixture<ColumnFilterRendererComponent> = TestBed.createComponent(ColumnFilterRendererComponent);
  fixture.componentRef.setInput('type', type);
  fixture.componentRef.setInput('value', value);
  fixture.componentRef.setInput('label', 'Date');
  const emitted: string[] = [];
  fixture.componentInstance.valueChange.subscribe((v) => emitted.push(v));
  fixture.detectChanges();
  const inputs = () => [...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLInputElement>('input[type="date"]')];
  const change = (input: HTMLInputElement, value: string) => {
    input.value = value;
    input.dispatchEvent(new Event('change'));
  };
  return {fixture, emitted, inputs, change};
}

describe('filtres de date natifs', () => {
  it('date : un champ natif, qui reflète la valeur et applique une date complète', () => {
    const {inputs, emitted, change} = create('date', '2026-03-04');
    expect(inputs()).toHaveLength(1);
    expect(inputs()[0].value).toBe('2026-03-04');
    expect(inputs()[0].getAttribute('aria-label')).toContain('Date');

    change(inputs()[0], '2026-05-06');
    change(inputs()[0], '');
    expect(emitted).toEqual(['2026-05-06', '']);
  });

  it('date : une valeur qui n’est pas au format ISO n’est pas affichée', () => {
    const {inputs} = create('date', '04/03/2026');
    expect(inputs()[0].value).toBe('');
  });

  it('période : deux champs, bornes liées par min / max, valeur sérialisée "début..fin"', () => {
    const {inputs, emitted, change} = create('range', '2026-01-10..2026-02-20');
    expect(inputs().map((i) => i.value)).toEqual(['2026-01-10', '2026-02-20']);
    expect(inputs()[0].getAttribute('max')).toBe('2026-02-20');
    expect(inputs()[1].getAttribute('min')).toBe('2026-01-10');

    change(inputs()[0], '2026-01-15');
    change(inputs()[1], '');
    expect(emitted).toEqual(['2026-01-15..2026-02-20', '2026-01-10..']);
  });

  it('période : une borne vidée des deux côtés efface le filtre, des bornes inversées sont remises dans l’ordre', () => {
    const {inputs, emitted, change} = create('range', '2026-01-10..');
    change(inputs()[0], '');
    change(inputs()[1], '2026-01-01');
    expect(emitted).toEqual(['', '2026-01-01..2026-01-10']);
  });
});
