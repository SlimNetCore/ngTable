import {DOCUMENT} from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  Directive,
  ElementRef,
  EmbeddedViewRef,
  inject,
  input,
  output,
  signal,
  TemplateRef,
  viewChild,
  ViewContainerRef,
  ViewEncapsulation,
} from '@angular/core';

/** Éléments du menu navigables aux flèches : les nôtres, ceux des rôles ARIA, et l'attribut hérité de Material. */
const ITEM_SELECTOR = '[ngt-menu-item], [mat-menu-item], [role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"]';
/** Panneaux et surcouches qui appartiennent au menu même s'ils sont posés ailleurs dans `<body>`. */
const OWNED_SELECTOR = '.ngt-select__panel, .cdk-overlay-container';
const GAP = 4;
const MARGIN = 8;

/**
 * Contenu d'un menu de `ng-table`, sans Angular Material. Il ne s'affiche pas lui-même : un déclencheur
 * `[ngTableMenuTriggerFor]` le pose dans `<body>` à l'ouverture.
 *
 * ```html
 * <button [ngTableMenuTriggerFor]="menu">Actions</button>
 * <ng-table-menu #menu class="mon-menu">
 *   <button ngt-menu-item (click)="faire()">Faire</button>
 * </ng-table-menu>
 * ```
 *
 * Les classes de l'élément `<ng-table-menu>` sont copiées sur le panneau. Un clic sur un élément `ngt-menu-item`
 * (ou `mat-menu-item`, conservé pour les modèles existants) ferme le menu, sauf si le clic est arrêté
 * (`$event.stopPropagation()`).
 */
@Component({
  selector: 'ng-table-menu',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  template: `
    <ng-template>
      <div class="ngt-menu-panel ngt-overlay" role="menu" tabindex="-1">
        <div class="ngt-menu-content">
          <ng-content/>
        </div>
      </div>
    </ng-template>
  `,
  styles: `
    ng-table-menu {
      display: none;
    }

    .ngt-menu-panel {
      position: fixed;
      inset: auto;
      z-index: 3000;
      box-sizing: border-box;
      min-width: 112px;
      max-width: calc(100vw - 16px);
      margin: 0;
      padding: 0;
      overflow: auto;
      border: 1px solid var(--ngt-border, var(--app-border, rgba(15, 23, 42, 0.13)));
      border-radius: 12px;
      background: var(--ngt-surface, var(--app-surface, #ffffff));
      box-shadow: 0 8px 28px rgba(15, 23, 42, 0.2);
      color: var(--ngt-text, var(--app-text, #0d1d26));
      font-size: 0.875rem;
      outline: none;
    }

    .ngt-menu-content {
      padding: 8px 0;
    }

    .ngt-menu-panel [ngt-menu-item],
    .ngt-menu-panel [mat-menu-item] {
      display: flex;
      align-items: center;
      gap: 12px;
      box-sizing: border-box;
      width: 100%;
      min-height: 44px;
      padding: 0 16px;
      border: 0;
      background: none;
      color: inherit;
      font: inherit;
      text-align: left;
      text-decoration: none;
      cursor: pointer;
    }

    .ngt-menu-panel [ngt-menu-item]:hover:not(:disabled),
    .ngt-menu-panel [mat-menu-item]:hover:not(:disabled),
    .ngt-menu-panel [ngt-menu-item]:focus-visible,
    .ngt-menu-panel [mat-menu-item]:focus-visible {
      background: var(--ngt-hover-surface, var(--app-hover-surface, #f6fbff));
      outline: none;
    }

    .ngt-menu-panel [ngt-menu-item]:disabled,
    .ngt-menu-panel [mat-menu-item]:disabled {
      opacity: 0.5;
      cursor: default;
    }

    .ngt-menu-panel [role='menuitemradio'][aria-checked='true'] {
      font-weight: 600;
    }
  `,
})
export class NgTableMenuComponent {
  /** Émis à la fermeture du menu, quelle qu'en soit la cause. */
  readonly closed = output<void>();
  /** Le modèle du panneau, instancié par le déclencheur. */
  readonly template = viewChild.required(TemplateRef);
  readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
}

/**
 * Ouvre un `<ng-table-menu>` sous l'élément (ou à l'endroit d'une ancre sans taille, pour un menu contextuel).
 *
 * Le panneau est posé dans `<body>` et dans la « top layer » du navigateur (API Popover) : il passe au-dessus de tout
 * `z-index`, y compris des fenêtres d'Angular Material. Il suit son déclencheur (défilement, redimensionnement), se
 * ferme au clic extérieur, à `Échap`, quand le focus le quitte et à la destruction du déclencheur. Les flèches,
 * Début et Fin parcourent les éléments.
 */
@Directive({
  selector: '[ngTableMenuTriggerFor]',
  exportAs: 'ngTableMenuTrigger',
  host: {
    'aria-haspopup': 'menu',
    '[attr.aria-expanded]': 'menu() ? opened() : null',
    '(click)': 'onClick($event)',
  },
})
export class NgTableMenuTriggerDirective {
  readonly menu = input<NgTableMenuComponent | null>(null, {alias: 'ngTableMenuTriggerFor'});
  readonly menuOpened = output<void>();
  readonly menuClosed = output<void>();

  protected readonly opened = signal(false);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly container = inject(ViewContainerRef);
  private readonly document = inject(DOCUMENT);
  private view: EmbeddedViewRef<unknown> | null = null;
  private panel: HTMLElement | null = null;
  private frame = 0;
  private current: NgTableMenuComponent | null = null;
  private cleanup: (() => void)[] = [];
  private destroyed = false;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      this.closeMenu(false);
    });
  }

  get menuOpen(): boolean {
    return this.view !== null;
  }

  protected onClick(event: MouseEvent): void {
    if (!this.menu()) {
      return;
    }
    if (this.menuOpen) {
      this.closeMenu(true);
    } else {
      this.openMenu(event.detail === 0);
    }
  }

  openMenu(focusFirstItem = false): void {
    const menu = this.menu();
    if (!menu || this.view) {
      return;
    }
    const view = this.container.createEmbeddedView(menu.template());
    view.detectChanges();
    const panel = view.rootNodes[0] as HTMLElement;
    this.view = view;
    this.panel = panel;
    this.current = menu;
    const extra = menu.host.className.split(/\s+/).filter((name) => name && !name.startsWith('ng-'));
    panel.classList.add(...extra);
    const theme = this.host.closest('[data-ngt-theme]')?.getAttribute('data-ngt-theme');
    if (theme) {
      panel.setAttribute('data-ngt-theme', theme);
    }
    this.document.body.appendChild(panel);
    // Les menus et fenêtres d'Angular Material vivent dans la « top layer » : aucun z-index ne passe au-dessus.
    if (typeof panel.showPopover === 'function') {
      panel.setAttribute('popover', 'manual');
      panel.showPopover();
    }
    this.opened.set(true);
    this.updatePosition();
    this.listen(panel);
    this.follow();
    // Un `<div ngt-menu-item>` n'est pas focusable de lui-même.
    panel.querySelectorAll<HTMLElement>(ITEM_SELECTOR).forEach((item) => {
      if (!item.hasAttribute('tabindex') && !['BUTTON', 'A', 'INPUT'].includes(item.tagName)) {
        item.setAttribute('tabindex', '-1');
      }
    });
    const first = panel.querySelector<HTMLElement>(ITEM_SELECTOR);
    (focusFirstItem && first ? first : panel).focus({preventScroll: true});
    this.menuOpened.emit();
  }

  closeMenu(refocus = false): void {
    if (!this.view) {
      return;
    }
    cancelAnimationFrame(this.frame);
    this.cleanup.forEach((undo) => undo());
    this.cleanup = [];
    const menu = this.current;
    this.view.destroy();
    this.panel?.remove();
    this.view = null;
    this.panel = null;
    this.current = null;
    this.opened.set(false);
    if (refocus && this.host.isConnected) {
      this.host.focus({preventScroll: true});
    }
    if (!this.destroyed) {
      this.menuClosed.emit();
      menu?.closed.emit();
    }
  }

  /** Replace le panneau sous son déclencheur (ou au-dessus s'il manque de place). */
  updatePosition(): void {
    const panel = this.panel;
    const view = this.document.defaultView;
    if (!panel || !view) {
      return;
    }
    const anchor = this.host.getBoundingClientRect();
    panel.style.maxHeight = '';
    const width = panel.offsetWidth;
    const height = panel.offsetHeight;
    const below = view.innerHeight - anchor.bottom - GAP - MARGIN;
    const above = anchor.top - GAP - MARGIN;
    const openUp = height > below && above > below;
    const room = Math.max(120, openUp ? above : below);
    panel.style.maxHeight = `${room}px`;
    const shown = Math.min(height, room);
    panel.style.left = `${Math.min(Math.max(MARGIN, anchor.left), Math.max(MARGIN, view.innerWidth - width - MARGIN))}px`;
    panel.style.top = `${openUp ? Math.max(MARGIN, anchor.top - GAP - shown) : anchor.bottom + GAP}px`;
  }

  private follow(): void {
    let last = '';
    const tick = () => {
      if (!this.view) {
        return;
      }
      if (!this.host.isConnected) {
        this.closeMenu(false);
        return;
      }
      const rect = this.host.getBoundingClientRect();
      const key = `${rect.left}|${rect.top}|${rect.width}|${rect.height}|${innerWidth}|${innerHeight}`;
      if (key !== last) {
        last = key;
        this.updatePosition();
      }
      this.frame = requestAnimationFrame(tick);
    };
    this.frame = requestAnimationFrame(tick);
  }

  private listen(panel: HTMLElement): void {
    const owned = (target: EventTarget | null) =>
      target instanceof Node && (panel.contains(target) || this.host.contains(target) || !!(target as Element).closest?.(OWNED_SELECTOR));
    const onPointerDown = (event: Event) => {
      if (!owned(event.target)) {
        this.closeMenu(false);
      }
    };
    const onFocusOut = (event: FocusEvent) => {
      const next = event.relatedTarget;
      if (next && !owned(next)) {
        this.closeMenu(false);
      }
    };
    const onClick = (event: MouseEvent) => {
      const item = (event.target as Element).closest<HTMLElement>(ITEM_SELECTOR);
      if (item && panel.contains(item) && !item.matches(':disabled, [aria-disabled="true"]')) {
        this.closeMenu(true);
      }
    };
    const onKeydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        this.closeMenu(true);
        return;
      }
      const target = event.target as HTMLElement;
      const onItem = target === panel || target.matches(ITEM_SELECTOR);
      if (!onItem || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        return;
      }
      const items = [...panel.querySelectorAll<HTMLElement>(ITEM_SELECTOR)].filter((item) => !item.matches(':disabled'));
      if (items.length === 0) {
        return;
      }
      event.preventDefault();
      const index = items.indexOf(target);
      const next =
        event.key === 'Home' ? 0
          : event.key === 'End' ? items.length - 1
            : event.key === 'ArrowDown' ? (index + 1) % items.length
              : (index <= 0 ? items.length - 1 : index - 1);
      items[next].focus();
    };
    this.document.addEventListener('pointerdown', onPointerDown, true);
    panel.addEventListener('focusout', onFocusOut);
    panel.addEventListener('click', onClick);
    panel.addEventListener('keydown', onKeydown);
    this.cleanup.push(
      () => this.document.removeEventListener('pointerdown', onPointerDown, true),
      () => panel.removeEventListener('focusout', onFocusOut),
      () => panel.removeEventListener('click', onClick),
      () => panel.removeEventListener('keydown', onKeydown),
    );
  }
}
