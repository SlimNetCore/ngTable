import {afterNextRender, DestroyRef, Directive, ElementRef, inject, input} from '@angular/core';
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
    '(mouseleave)': 'closeSoon()',
    '(focusin)': 'open(0)',
    '(focusout)': 'close()',
    '(keydown.escape)': 'onEscape($event)',
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

  private readonly onDocumentKeydown = (event: KeyboardEvent): void => {
    // Échap ferme la bulle même quand elle a été ouverte au survol, sans que l'élément ait le focus (WCAG 1.4.13).
    if (event.key === 'Escape' && this.bubble) {
      // La touche a servi à fermer la bulle de l'élément qui a le focus : elle ne doit pas, en plus, déclencher
      // l'action d'un parent (vider la sélection, fermer un panneau).
      if (event.target instanceof Node && this.host.contains(event.target)) {
        event.stopPropagation();
      }
      this.close();
    }
  };
  private leaveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.close();
      this.anchor?.removeEventListener('focus', this.onAnchorFocus);
      this.anchor?.removeEventListener('blur', this.onAnchorBlur);
    });
    // Un texte tronqué n'est pas focalisable lui-même : la bulle s'ouvre aussi quand la cellule ou le bouton qui le
    // contient reçoit le focus, pour qu'il soit lisible en entier au clavier (WCAG 1.4.13, 2.1.1).
    afterNextRender(() => {
      const anchor = this.host.closest<HTMLElement>('td, th button, button');
      if (anchor && anchor !== this.host) {
        this.anchor = anchor;
        anchor.addEventListener('focus', this.onAnchorFocus);
        anchor.addEventListener('blur', this.onAnchorBlur);
      }
    });
  }

  private anchor: HTMLElement | null = null;
  private readonly onAnchorFocus = (): void => {
    // Seulement au clavier : après un clic, une bulle sous le pointeur gênerait.
    if (this.anchor?.matches(':focus-visible')) {
      this.open(0);
    }
  };
  private readonly onAnchorBlur = (): void => this.close();

  /**
   * Le pointeur quitte l'élément : la bulle reste un court instant, le temps de l'atteindre. Tant que le pointeur est
   * dessus, elle reste affichée (WCAG 1.4.13 : contenu survolable, utile avec une loupe d'écran).
   */
  protected closeSoon(): void {
    if (!this.bubble) {
      this.close();
      return;
    }
    this.leaveTimer = setTimeout(() => this.close(), 150);
  }

  /**
   * Échap ferme la bulle (WCAG 1.4.13). Quand une bulle était affichée, la touche s'arrête là : elle ne doit pas, en
   * plus, déclencher l'action d'un parent (vider la sélection, fermer un panneau).
   */
  protected onEscape(event: Event): void {
    if (this.bubble) {
      event.stopPropagation();
    }
    this.close();
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
    if (this.leaveTimer !== null) {
      clearTimeout(this.leaveTimer);
      this.leaveTimer = null;
    }
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.bubble) {
      this.bubble.remove();
      this.bubble = null;
      this.host.removeAttribute('aria-describedby');
      this.document.removeEventListener('scroll', this.onScroll, true);
      this.document.removeEventListener('keydown', this.onDocumentKeydown, true);
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
    bubble.addEventListener('mouseenter', () => {
      if (this.leaveTimer !== null) {
        clearTimeout(this.leaveTimer);
        this.leaveTimer = null;
      }
    });
    bubble.addEventListener('mouseleave', () => this.close());
    this.place(bubble);
    this.document.addEventListener('scroll', this.onScroll, true);
    this.document.addEventListener('keydown', this.onDocumentKeydown, true);
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
