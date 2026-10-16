import {Component, signal} from '@angular/core';
import {TestBed} from '@angular/core/testing';
import {afterEach, describe, expect, it} from 'vitest';
import {NgTableMenuComponent, NgTableMenuTriggerDirective} from './ng-table-menu';

@Component({
  standalone: true,
  imports: [NgTableMenuComponent, NgTableMenuTriggerDirective],
  template: `
    <button #t="ngTableMenuTrigger" (menuClosed)="events.push('closed')" (menuOpened)="events.push('opened')"
            [ngTableMenuTriggerFor]="enabled() ? menu : null" id="trigger" type="button">Actions</button>
    <ng-table-menu #menu class="mon-menu" (closed)="events.push('menu-closed')">
      <button ngt-menu-item (click)="clicks.push('a')" type="button">Ouvrir</button>
      <!-- eslint-disable-next-line @angular-eslint/template/click-events-have-key-events, @angular-eslint/template/interactive-supports-focus -->
      <div ngt-menu-item (click)="$event.stopPropagation(); clicks.push('b')">Reste ouvert</div>
      <button ngt-menu-item disabled type="button">Désactivé</button>
      <button ngt-menu-item (click)="clicks.push('c')" type="button">Fermer</button>
    </ng-table-menu>
    <button id="other" type="button">Ailleurs</button>
  `,
})
class HostComponent {
  readonly enabled = signal(true);
  readonly events: string[] = [];
  readonly clicks: string[] = [];
}

const panel = () => document.querySelector('.ngt-menu-panel') as HTMLElement | null;
const items = () => [...document.querySelectorAll<HTMLElement>('.ngt-menu-panel [ngt-menu-item]')];
const key = (target: Element, name: string) => target.dispatchEvent(new KeyboardEvent('keydown', {key: name, bubbles: true}));

describe('menu', () => {
  afterEach(() => document.querySelectorAll('.ngt-menu-panel').forEach((p) => p.remove()));

  const create = async () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const trigger = root.querySelector('#trigger') as HTMLButtonElement;
    const settle = async () => {
      fixture.detectChanges();
      await fixture.whenStable();
    };
    return {fixture, host: fixture.componentInstance, trigger, root, settle};
  };

  it('s’ouvre au clic dans <body> avec role="menu", copie ses classes et signale l’ouverture', async () => {
    const {host, trigger, settle} = await create();
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    trigger.click();
    await settle();
    expect(panel()?.parentElement).toBe(document.body);
    expect(panel()?.getAttribute('role')).toBe('menu');
    expect(panel()?.classList.contains('mon-menu')).toBe(true);
    expect(items()).toHaveLength(4);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(host.events).toEqual(['opened']);

    trigger.click();
    await settle();
    expect(panel()).toBeNull();
    expect(host.events).toEqual(['opened', 'closed', 'menu-closed']);
  });

  it('un clic sur un élément ferme le menu, sauf si le clic est arrêté ; un élément désactivé ne ferme pas', async () => {
    const {host, trigger, settle} = await create();
    trigger.click();
    await settle();
    items()[1].click();
    expect(panel()).not.toBeNull();
    items()[2].click();
    expect(panel()).not.toBeNull();
    items()[0].click();
    await settle();
    expect(panel()).toBeNull();
    expect(host.clicks).toEqual(['b', 'a']);
  });

  it('Échap ferme et rend le focus au déclencheur', async () => {
    const {trigger, settle} = await create();
    trigger.click();
    await settle();
    key(panel()!, 'Escape');
    await settle();
    expect(panel()).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('un appui à l’extérieur ferme le menu, pas à l’intérieur', async () => {
    const {root, settle, trigger} = await create();
    trigger.click();
    await settle();
    panel()!.dispatchEvent(new Event('pointerdown', {bubbles: true}));
    expect(panel()).not.toBeNull();
    (root.querySelector('#other') as HTMLElement).dispatchEvent(new Event('pointerdown', {bubbles: true}));
    await settle();
    expect(panel()).toBeNull();
  });

  it('flèches, Fin et Début parcourent les éléments actifs en boucle', async () => {
    const {trigger, settle} = await create();
    trigger.dispatchEvent(new MouseEvent('click', {bubbles: true, detail: 0})); // ouverture au clavier : le premier élément a le focus
    await settle();
    expect(document.activeElement).toBe(items()[0]);
    key(items()[0], 'ArrowDown');
    expect(document.activeElement).toBe(items()[1]);
    key(items()[1], 'ArrowDown'); // saute l'élément désactivé
    expect(document.activeElement).toBe(items()[3]);
    key(items()[3], 'ArrowDown');
    expect(document.activeElement).toBe(items()[0]);
    key(items()[0], 'ArrowUp');
    expect(document.activeElement).toBe(items()[3]);
    key(items()[3], 'Home');
    expect(document.activeElement).toBe(items()[0]);
    key(items()[0], 'End');
    expect(document.activeElement).toBe(items()[3]);
  });

  it('sans menu (null), le déclencheur n’ouvre rien', async () => {
    const {host, trigger, settle} = await create();
    host.enabled.set(false);
    await settle();
    trigger.click();
    await settle();
    expect(panel()).toBeNull();
    expect(trigger.hasAttribute('aria-expanded')).toBe(false);
  });

  it('le panneau disparaît quand le déclencheur est détruit', async () => {
    const {fixture, trigger, settle} = await create();
    trigger.click();
    await settle();
    fixture.destroy();
    expect(panel()).toBeNull();
  });
});
