import {DestroyRef, Directive, ElementRef, inject, input} from '@angular/core';
import {DOCUMENT} from '@angular/common';

let nextId = 0;

/** Écart entre l'élément et sa bulle, et marge minimale avec le bord de la fenêtre. */
const GAP = 8;
const MARGIN = 8;

/**
 * Info-bulle de `ng-table`, sans Angular Material : une bulle `role="tooltip"` posée dans `<body>`, reliée à
 * l'élément par `aria-describedby`. Elle s'ouvre au survol (après 300 ms) et au focus clavier, se ferme à la sortie,
 * à `Échap`, au défilement et à la destruction de l'élément ; elle se place au-dessus, ou en dessous quand il n'y a pas
 * la place, et reste dans la fenêtre.
 *
 * ```html
 * <button [ngTableTooltip]="'Copier la valeur'">…</button>
 * ```
 *
 * La bulle porte les classes `ngt-tooltip` et `ngt-truncate-tooltip` ; ses couleurs, rayon, ombre... se règlent par
 * les variables `--ngt-tooltip-*` (voir le README).
 */
@Directive({
  selector: '[ngTableTooltip]',
  host: {
    '(mouseenter)': 'open(300)',
    '(mouseleave)': 'close()',
    '(focusin)': 'open(0)',
    '(focusout)': 'close()',
    '(keydown.escape)': 'close()',
  },
})
export class NgTableTooltipDirective {
  /** Le texte de la bulle ; vide : pas de bulle. */
  readonly ngTableTooltip = input<string>('');
  /** Désactive la bulle. */
  readonly ngTableTooltipDisabled = input(false);

  protected readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly document = inject(DOCUMENT);
  private bubble: HTMLElement | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly id = `ngt-tooltip-${nextId++}`;
  private readonly onScroll = () => this.close();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.close());
  }

  /** Texte à afficher à l'ouverture ; une sous-classe peut le calculer au dernier moment. */
  protected message(): string {
    return this.ngTableTooltip();
  }

  /** La bulle peut-elle s'ouvrir maintenant ? */
  protected enabled(): boolean {
    return !this.ngTableTooltipDisabled() && this.message().trim() !== '';
  }

  open(delayMs = 300): void {
    this.close();
    if (!this.enabled()) {
      return;
    }
    this.timer = setTimeout(() => this.show(), delayMs);
  }

  close(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.bubble) {
      this.bubble.remove();
      this.bubble = null;
      this.host.removeAttribute('aria-describedby');
      this.document.removeEventListener('scroll', this.onScroll, true);
    }
  }

  private show(): void {
    this.timer = null;
    if (!this.host.isConnected || !this.enabled()) {
      return;
    }
    const bubble = this.document.createElement('div');
    bubble.id = this.id;
    bubble.setAttribute('role', 'tooltip');
    bubble.className = 'ngt-tooltip ngt-truncate-tooltip';
    bubble.textContent = this.message();
    this.document.body.appendChild(bubble);
    this.bubble = bubble;
    this.host.setAttribute('aria-describedby', this.id);
    this.place(bubble);
    this.document.addEventListener('scroll', this.onScroll, true);
  }

  private place(bubble: HTMLElement): void {
    const anchor = this.host.getBoundingClientRect();
    const size = bubble.getBoundingClientRect();
    const view = this.document.defaultView!;
    const above = anchor.top - size.height - GAP >= MARGIN;
    const top = above ? anchor.top - size.height - GAP : anchor.bottom + GAP;
    const left = Math.min(Math.max(MARGIN, anchor.left + anchor.width / 2 - size.width / 2), view.innerWidth - size.width - MARGIN);
    bubble.style.top = `${Math.max(MARGIN, top)}px`;
    bubble.style.left = `${Math.max(MARGIN, left)}px`;
  }
}
