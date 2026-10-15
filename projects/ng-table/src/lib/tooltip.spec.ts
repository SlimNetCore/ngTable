import {Component, signal} from '@angular/core';
import {TestBed} from '@angular/core/testing';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {NgTableTooltipDirective} from './tooltip.directive';
import {TruncateTooltipDirective} from './truncate-tooltip.directive';

@Component({
  standalone: true,
  imports: [NgTableTooltipDirective, TruncateTooltipDirective],
  template: `
    <button #plain [ngTableTooltip]="text()" [ngTableTooltipDisabled]="disabled()" type="button">Copier</button>
    <span #cut [ngTableTruncateTooltip]="'Le texte complet de la cellule'" style="display: block; width: 40px; overflow: hidden; white-space: nowrap">
      Un texte très long
    </span>
  `,
})
class HostComponent {
  readonly text = signal('Copier la valeur');
  readonly disabled = signal(false);
}

describe('info-bulle', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    document.querySelectorAll('.ngt-tooltip').forEach((bubble) => bubble.remove());
  });

  const create = () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    return {fixture, button: root.querySelector('button')!, span: root.querySelector('span')!};
  };
  const bubble = () => document.querySelector('.ngt-tooltip');

  it('s’ouvre après 300 ms de survol, relie la bulle à l’élément, et se ferme à la sortie', () => {
    const {button} = create();
    button.dispatchEvent(new Event('mouseenter'));
    vi.advanceTimersByTime(200);
    expect(bubble()).toBeNull();
    vi.advanceTimersByTime(150);

    expect(bubble()?.textContent).toBe('Copier la valeur');
    expect(bubble()?.getAttribute('role')).toBe('tooltip');
    expect(button.getAttribute('aria-describedby')).toBe(bubble()?.id);

    button.dispatchEvent(new Event('mouseleave'));
    expect(bubble()).toBeNull();
    expect(button.hasAttribute('aria-describedby')).toBe(false);
  });

  it('s’ouvre tout de suite au focus clavier et se ferme à Échap', () => {
    const {button} = create();
    button.dispatchEvent(new Event('focusin'));
    vi.advanceTimersByTime(1);
    expect(bubble()).not.toBeNull();
    button.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape'}));
    expect(bubble()).toBeNull();
  });

  it('une survol interrompu avant le délai n’ouvre rien ; texte vide ou désactivée : jamais de bulle', () => {
    const {fixture, button} = create();
    button.dispatchEvent(new Event('mouseenter'));
    button.dispatchEvent(new Event('mouseleave'));
    vi.advanceTimersByTime(1000);
    expect(bubble()).toBeNull();

    fixture.componentInstance.disabled.set(true);
    fixture.detectChanges();
    button.dispatchEvent(new Event('mouseenter'));
    vi.advanceTimersByTime(1000);
    expect(bubble()).toBeNull();

    fixture.componentInstance.disabled.set(false);
    fixture.componentInstance.text.set('   ');
    fixture.detectChanges();
    button.dispatchEvent(new Event('mouseenter'));
    vi.advanceTimersByTime(1000);
    expect(bubble()).toBeNull();
  });

  it('se ferme au défilement et quand l’élément est détruit', () => {
    const {fixture, button} = create();
    button.dispatchEvent(new Event('mouseenter'));
    vi.advanceTimersByTime(400);
    document.dispatchEvent(new Event('scroll'));
    expect(bubble()).toBeNull();

    button.dispatchEvent(new Event('mouseenter'));
    vi.advanceTimersByTime(400);
    expect(bubble()).not.toBeNull();
    fixture.destroy();
    expect(bubble()).toBeNull();
  });

  it('la bulle de troncature ne s’ouvre que si le texte est réellement coupé', () => {
    const {span} = create();
    // jsdom n'a pas de mise en page : on simule un texte plus large que son conteneur, puis qui tient.
    Object.defineProperty(span, 'scrollWidth', {value: 200, configurable: true});
    Object.defineProperty(span, 'clientWidth', {value: 40, configurable: true});
    span.dispatchEvent(new Event('mouseenter'));
    vi.advanceTimersByTime(400);
    expect(bubble()?.textContent).toBe('Le texte complet de la cellule');
    span.dispatchEvent(new Event('mouseleave'));

    Object.defineProperty(span, 'scrollWidth', {value: 40, configurable: true});
    span.dispatchEvent(new Event('mouseenter'));
    vi.advanceTimersByTime(400);
    expect(bubble()).toBeNull();
  });
});
