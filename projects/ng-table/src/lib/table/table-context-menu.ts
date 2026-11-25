import {signal} from '@angular/core';
import type {NgTableComponent} from '../ng-table.component';

/** Menu contextuel de ligne. */
export class TableContextMenu<T> {
  constructor(private readonly table: NgTableComponent<T>) {}

  readonly contextMenuRow = signal<T | null>(null);
  readonly contextMenuPosition = signal<{ x: number; y: number }>({x: 0, y: 0});

  /** Ancre du menu contextuel, une fois déplacée dans `document.body` (voir `onRowContextMenu`). */
  private contextMenuAnchor: HTMLElement | null = null;

  onRowContextMenu(event: MouseEvent, row: T): void {
    if (!this.table.rowContextMenuEnabled() || !this.table.rowContextMenuTemplate()) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    this.contextMenuRow.set(row);
    // Small offset keeps the pointer visible and makes the menu feel anchored to the click.
    this.contextMenuPosition.set({x: event.clientX + 2, y: event.clientY + 2});
    this.detachContextMenuAnchorFromHost();
    this.table.rowContextMenu.emit({
      row,
      position: {x: event.clientX, y: event.clientY},
    });

    const trigger = this.table.contextMenuTriggerRef();
    if (!trigger) {
      return;
    }

    if (trigger.menuOpen) {
      trigger.closeMenu();
    }
    // Wait one frame so overlay origin position is fully updated before opening.
    requestAnimationFrame(() => trigger.openMenu());
  }

  openRowContextMenuFromKeyboard(rowElement: HTMLElement | null, row: T): void {
    if (!this.table.rowContextMenuEnabled() || !this.table.rowContextMenuTemplate()) {
      return;
    }

    // Pas de coordonnées souris pour une ouverture clavier : on ancre le menu au
    // coin de la ligne plutôt qu'à un point de clic.
    const rect = rowElement?.getBoundingClientRect();
    const x = rect ? rect.left + 12 : 0;
    const y = rect ? rect.top + 12 : 0;
    // L'élément qui avait le focus le retrouvera à la fermeture du menu (WCAG 2.4.3).
    this.contextMenuReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : rowElement;

    this.contextMenuRow.set(row);
    this.contextMenuPosition.set({x, y});
    this.detachContextMenuAnchorFromHost();
    this.table.rowContextMenu.emit({row, position: {x, y}});

    const trigger = this.table.contextMenuTriggerRef();
    if (!trigger) {
      return;
    }
    if (trigger.menuOpen) {
      trigger.closeMenu();
    }
    requestAnimationFrame(() => trigger.openMenu());
  }

  private contextMenuReturnFocus: HTMLElement | null = null;

  onRowContextMenuClosed(): void {
    this.contextMenuRow.set(null);
    const target = this.contextMenuReturnFocus;
    this.contextMenuReturnFocus = null;
    // Seulement si le focus est retombé sur la page : un élément du menu a pu le déplacer volontairement (dialogue ouvert...).
    if (target?.isConnected && (document.activeElement === document.body || document.activeElement === null)) {
      target.focus({preventScroll: true});
    }
  }

  /**
   * L'ancre du menu contextuel est en `position: fixed` : si un ancêtre du composant
   * porte `backdrop-filter`, `transform`, `filter` ou `perspective`, cet ancêtre devient
   * le bloc conteneur des éléments `fixed` et le menu s'ouvre au mauvais endroit.
   * On déplace donc l'ancre dans `document.body` au premier clic droit — le composant
   * reste ainsi correct quel que soit le contexte de mise en page du consommateur.
   */
  private detachContextMenuAnchorFromHost(): void {
    if (this.contextMenuAnchor || typeof document === 'undefined') {
      return;
    }
    const anchor = this.table.hostElement.nativeElement.querySelector<HTMLElement>('.context-menu-anchor');
    if (!anchor || anchor.parentElement === document.body) {
      return;
    }
    document.body.appendChild(anchor);
    this.contextMenuAnchor = anchor;
  }

  /** Retire l'ancre du menu, déplacée dans `document.body`. */
  dispose(): void {
    // L'ancre a été déplacée dans `document.body` : elle n'est plus détruite avec la vue.
    this.contextMenuAnchor?.remove();
    this.contextMenuAnchor = null;
  }
}
