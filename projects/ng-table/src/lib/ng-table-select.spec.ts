import {Component, signal} from '@angular/core';
import {TestBed} from '@angular/core/testing';
import {afterEach, describe, expect, it} from 'vitest';
import {NgTableSelectComponent, NgTableSelectOption} from './ng-table-select.component';

const OPTIONS: NgTableSelectOption[] = [
  {value: 'a', label: 'Alpha'},
  {value: 'b', label: 'Bravo'},
  {value: 'c', label: 'Charlie'},
];

@Component({
  standalone: true,
  imports: [NgTableSelectComponent],
  template: `
    <ng-table-select [allLabel]="multiple() ? null : 'Tous'" [multiple]="multiple()" [options]="options" [searchable]="searchable()"
                     [value]="value()" (valueChange)="onChange($event)" placeholder="Choisir"/>
  `,
})
class HostComponent {
  readonly options = OPTIONS;
  readonly multiple = signal(false);
  readonly searchable = signal(false);
  readonly value = signal<string | readonly string[]>('');
  readonly changes: (string | string[])[] = [];

  onChange(next: string | string[]): void {
    this.changes.push(next);
    this.value.set(next);
  }
}

const panel = () => document.querySelector('.ngt-select__panel') as HTMLElement | null;
const options = () => [...document.querySelectorAll<HTMLElement>('.ngt-select__option')];
const key = (target: Element, name: string) => target.dispatchEvent(new KeyboardEvent('keydown', {key: name, bubbles: true}));

describe('NgTableSelectComponent', () => {
  afterEach(() => document.querySelectorAll('.ngt-select__panel').forEach((p) => p.remove()));

  const create = async (setup?: (host: HostComponent) => void) => {
    const fixture = TestBed.createComponent(HostComponent);
    setup?.(fixture.componentInstance);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const trigger = root.querySelector('button.ngt-select__trigger') as HTMLButtonElement;
    const settle = async () => {
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
    };
    return {fixture, root, trigger, host: fixture.componentInstance, settle};
  };

  it('affiche le texte indicatif, puis le libellé de la valeur choisie', async () => {
    const {trigger, host, settle} = await create();
    expect(trigger.textContent).toContain('Choisir');
    expect(trigger.getAttribute('role')).toBe('combobox');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    host.value.set('b');
    await settle();
    expect(trigger.textContent).toContain('Bravo');
  });

  it('s’ouvre au clic dans <body> avec des options role="option", et se ferme à Échap en rendant le focus', async () => {
    const {trigger, settle} = await create();
    trigger.click();
    await settle();
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(panel()?.parentElement).toBe(document.body);
    expect(options().map((o) => o.textContent?.trim())).toEqual(['Tous', 'Alpha', 'Bravo', 'Charlie']);
    expect(options().every((o) => o.getAttribute('role') === 'option')).toBe(true);

    key(panel()!, 'Escape');
    await settle();
    expect(panel()).toBeNull();
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('sélection simple : un clic choisit la valeur et ferme ; « Tous » la vide', async () => {
    const {trigger, host, settle} = await create((h) => h.value.set('a'));
    trigger.click();
    await settle();
    expect(options()[1].getAttribute('aria-selected')).toBe('true');
    options()[2].click();
    await settle();
    expect(host.changes).toEqual(['b']);
    expect(panel()).toBeNull();

    trigger.click();
    await settle();
    options()[0].click();
    await settle();
    expect(host.changes).toEqual(['b', '']);
  });

  it('sélection multiple : les clics basculent, le panneau reste ouvert, l’ordre suit celui des options', async () => {
    const {trigger, host, settle} = await create((h) => h.multiple.set(true));
    trigger.click();
    await settle();
    expect(options().map((o) => o.textContent?.trim())).toEqual(['Alpha', 'Bravo', 'Charlie']);
    options()[2].click();
    await settle();
    options()[0].click();
    await settle();
    expect(host.changes).toEqual([['c'], ['a', 'c']]);
    expect(panel()).not.toBeNull();
    expect(trigger.textContent).toContain('Alpha, Charlie');

    options()[0].click();
    await settle();
    expect(host.changes.at(-1)).toEqual(['c']);
  });

  it('clavier : flèches, Fin, Début, Entrée et Espace', async () => {
    const {trigger, host, settle} = await create((h) => h.multiple.set(true));
    key(trigger, 'ArrowDown');
    await settle();
    expect(panel()).not.toBeNull();
    key(panel()!, 'ArrowDown');
    key(panel()!, 'Enter');
    await settle();
    expect(host.changes).toEqual([['b']]);

    key(panel()!, 'End');
    key(panel()!, ' ');
    await settle();
    expect(host.changes.at(-1)).toEqual(['b', 'c']);

    key(panel()!, 'Home');
    await settle();
    expect(options()[0].classList.contains('ngt-select__option--active')).toBe(true);
    expect(panel()!.querySelector('[role="listbox"]')?.getAttribute('aria-activedescendant')).toBe(options()[0].id);
  });

  it('recherche : filtre les options et affiche un message quand il n’y a aucun résultat', async () => {
    const {trigger, settle} = await create((h) => h.searchable.set(true));
    trigger.click();
    await settle();
    const input = panel()!.querySelector('input') as HTMLInputElement;
    input.value = 'ra';
    input.dispatchEvent(new Event('input'));
    await settle();
    expect(options().map((o) => o.textContent?.trim())).toEqual(['Bravo']);

    input.value = 'zzz';
    input.dispatchEvent(new Event('input'));
    await settle();
    expect(options()).toHaveLength(0);
    expect(panel()!.querySelector('.ngt-select__empty')).not.toBeNull();
  });

  it('se ferme sur un clic à l’extérieur mais pas dans le panneau', async () => {
    const {trigger, settle} = await create((h) => h.searchable.set(true));
    trigger.click();
    await settle();
    panel()!.dispatchEvent(new Event('pointerdown', {bubbles: true}));
    await settle();
    expect(panel()).not.toBeNull();
    document.body.dispatchEvent(new Event('pointerdown', {bubbles: true}));
    await settle();
    expect(panel()).toBeNull();
  });

  it('retire le panneau du document quand le composant est détruit', async () => {
    const {fixture, trigger, settle} = await create();
    trigger.click();
    await settle();
    expect(panel()).not.toBeNull();
    fixture.destroy();
    expect(panel()).toBeNull();
  });
});
