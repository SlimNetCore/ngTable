import {signal} from '@angular/core';
import {draggedTableColumn, NG_TABLE_COLUMN_DRAG_TYPE} from '../column-drag';
import type {NgTableColumn} from '../ng-table.models';
import type {NgTableComponent} from '../ng-table.component';

/** Déplacement de colonnes : glisser-déposer et clavier. */
export class TableColumnMove<T> {
  constructor(private readonly table: NgTableComponent<T>) {}

  /** Native HTML5 drag-and-drop state for column reordering (id of the column being dragged / hovered). */
  readonly draggingColumnId = signal<string | null>(null);

  readonly dragOverColumnId = signal<string | null>(null);

  /** Reorders columns after a header drag-and-drop (disponible à toute largeur : la poignée reste visible quand le tableau se rétrécit). */
  onColumnDragStart(event: DragEvent, column: NgTableColumn<T>): void {
    this.draggingColumnId.set(column.id);
    // Une zone de dépôt hors de la table (le pivot) peut accepter la colonne : son identifiant est publié.
    draggedTableColumn.set(column.id);
    event.dataTransfer?.setData('text/plain', column.id);
    event.dataTransfer?.setData(NG_TABLE_COLUMN_DRAG_TYPE, column.id);
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'copyMove';
    }
  }

  onColumnDragOver(event: DragEvent, column: NgTableColumn<T>): void {
    const draggingId = this.draggingColumnId();
    if (!draggingId || draggingId === column.id) {
      return;
    }
    // Must call preventDefault() for the browser to allow a drop on this element.
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
    this.dragOverColumnId.set(column.id);
  }

  onColumnDragLeave(column: NgTableColumn<T>): void {
    if (this.dragOverColumnId() === column.id) {
      this.dragOverColumnId.set(null);
    }
  }

  onColumnDrop(event: DragEvent, column: NgTableColumn<T>): void {
    event.preventDefault();
    const sourceId = this.draggingColumnId();
    this.draggingColumnId.set(null);
    this.dragOverColumnId.set(null);
    if (!sourceId) {
      return;
    }
    this.moveColumnNextTo(sourceId, column.id);
  }

  onColumnDragEnd(): void {
    draggedTableColumn.set(null);
    this.draggingColumnId.set(null);
    this.dragOverColumnId.set(null);
  }

  /**
   * Keyboard-operable alternative to the drag-and-drop reorder: ArrowLeft/ArrowRight
   * while the drag handle is focused move the column one step in that direction.
   * Native HTML5 drag-and-drop (used for the mouse path) has no keyboard equivalent
   * at all, so this is required for WCAG 2.1.1 (Keyboard) — not just a nicety.
   */
  onColumnHandleKeydown(event: KeyboardEvent, column: NgTableColumn<T>): void {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
      return;
    }
    event.preventDefault();

    const reorderable = this.table.columnLayout.visibleColumns().map((c) => c.id);
    const fromIndex = reorderable.indexOf(column.id);
    if (fromIndex === -1) {
      return;
    }
    const toIndex = event.key === 'ArrowLeft' ? fromIndex - 1 : fromIndex + 1;
    if (toIndex < 0 || toIndex >= reorderable.length) {
      return;
    }
    this.moveColumnNextTo(column.id, reorderable[toIndex]);
    this.table.announce([this.table.effectiveLabels().announceColumnMoved.replace('{column}', column.header).replace('{position}', `${toIndex + 1}`)]);
    // L'en-tête est reconstruit à sa nouvelle place : le focus revient sur la poignée de la même colonne.
    this.table.focus.refocusAfterRender(() => this.headerCellOf(column.id)?.querySelector<HTMLElement>('.drag-handle'));
  }

  private headerCellOf(columnId: string): HTMLElement | undefined {
    return Array.from(this.table.hostElement.nativeElement.querySelectorAll<HTMLElement>('th[data-ngt-header]')).find(
      (cell) => cell.getAttribute('data-ngt-header') === columnId,
    );
  }

  /** Une colonne peut-elle avancer (`-1`) ou reculer (`1`) d'un cran parmi les colonnes visibles ? */
  canMoveColumn(column: NgTableColumn<T>, delta: -1 | 1): boolean {
    const ids = this.table.columnLayout.visibleColumns().map((c) => c.id);
    const index = ids.indexOf(column.id);
    return index !== -1 && index + delta >= 0 && index + delta < ids.length;
  }

  /** Voir `NgTableComponent.moveColumnBy`. */
  moveColumnBy(column: NgTableColumn<T>, delta: -1 | 1): void {
    if (!this.canMoveColumn(column, delta)) {
      return;
    }
    const ids = this.table.columnLayout.visibleColumns().map((c) => c.id);
    // Le bouton cliqué suit sa ligne dans le menu ; arrivé en butée il se désactive : son voisin prend le focus.
    const clicked = typeof document === 'undefined' ? null : document.activeElement;
    if (clicked instanceof HTMLButtonElement && clicked.closest('.columns-menu-moves')) {
      this.table.focus.refocusAfterRender(() =>
        clicked.isConnected && !clicked.disabled ? clicked : clicked.parentElement?.querySelector<HTMLElement>('button:not([disabled])'),
      );
    }
    this.moveColumnNextTo(column.id, ids[ids.indexOf(column.id) + delta]);
    const position = this.table.columnLayout.visibleColumns().findIndex((c) => c.id === column.id) + 1;
    this.table.announce([this.table.effectiveLabels().announceColumnMoved.replace('{column}', column.header).replace('{position}', `${position}`)]);
  }

  /** Moves `sourceId` to `targetId`'s position. Shared by the drag-drop and keyboard reorder paths. */
  moveColumnNextTo(sourceId: string, targetId: string): void {
    if (sourceId === targetId) {
      return;
    }

    const reorderable = this.table.columnLayout.visibleColumns().map((c) => c.id);
    const fromIndex = reorderable.indexOf(sourceId);
    const toIndex = reorderable.indexOf(targetId);
    if (fromIndex === -1 || toIndex === -1) {
      return;
    }
    reorderable.splice(fromIndex, 1);
    reorderable.splice(toIndex, 0, sourceId);

    // Columns currently hidden by the picker keep their place at the end so
    // toggling them visible later doesn't jump them to an unexpected spot.
    const hiddenIds = this.table.columns()
      .map((c) => c.id)
      .filter((id) => !reorderable.includes(id));

    const next = [...reorderable, ...hiddenIds];
    this.table.columnLayout.internalColumnOrder.set(next);
    this.table.columnOrderChange.emit(next);
  }
}
