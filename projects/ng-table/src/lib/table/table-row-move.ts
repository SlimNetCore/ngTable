import {signal} from '@angular/core';
import {dropPositionFor, moveRow, RowDropPosition} from '../row-drag';
import {isDataItem} from './internals';
import type {NgTableComponent} from '../ng-table.component';

/** Déplacement de lignes : glisser-déposer et clavier. */
export class TableRowMove<T> {
  constructor(private readonly table: NgTableComponent<T>) {}

  /** Ligne en cours de déplacement, et endroit où elle serait déposée. */
  private readonly draggingRow = signal<{ key: unknown } | null>(null);

  private readonly rowDrop = signal<{ key: unknown; position: RowDropPosition } | null>(null);

  rowDropAttr(row: T): RowDropPosition | null {
    const drop = this.rowDrop();
    return drop && Object.is(drop.key, this.table.data.rowKey(row)) ? drop.position : null;
  }

  isRowDragging(row: T): boolean {
    const dragging = this.draggingRow();
    return !!dragging && Object.is(dragging.key, this.table.data.rowKey(row));
  }

  onRowDragStart(event: DragEvent, row: T): void {
    const key = this.table.data.rowKey(row);
    this.draggingRow.set({key});
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', `${key}`);
      const tr = (event.currentTarget as HTMLElement).closest('tr');
      if (tr) {
        event.dataTransfer.setDragImage(tr, 16, 16);
      }
    }
  }

  onRowDragEnd(): void {
    this.draggingRow.set(null);
    this.rowDrop.set(null);
  }

  onRowDragOver(event: DragEvent, row: T): void {
    const dragging = this.draggingRow();
    if (!dragging || this.table.render.pinInfo(row)) {
      return;
    }
    const key = this.table.data.rowKey(row);
    if (Object.is(dragging.key, key)) {
      this.rowDrop.set(null);
      return;
    }
    event.preventDefault(); // autorise le dépôt
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
    const position = dropPositionFor(event.clientY, (event.currentTarget as HTMLElement).getBoundingClientRect());
    const drop = this.rowDrop();
    if (!drop || !Object.is(drop.key, key) || drop.position !== position) {
      this.rowDrop.set({key, position});
    }
    this.autoScrollWhileDragging(event.clientY);
  }

  /** Fait défiler la zone quand on glisse près de son bord haut ou bas. */
  private autoScrollWhileDragging(clientY: number): void {
    const wrap = this.table.hostElement.nativeElement.querySelector<HTMLElement>('.table-wrap');
    if (!wrap) {
      return;
    }
    const rect = wrap.getBoundingClientRect();
    const edge = 40;
    if (clientY < rect.top + edge) {
      wrap.scrollTop -= 20;
    } else if (clientY > rect.bottom - edge) {
      wrap.scrollTop += 20;
    }
  }

  onRowDrop(event: DragEvent, row: T): void {
    const dragging = this.draggingRow();
    const drop = this.rowDrop();
    if (!dragging) {
      return;
    }
    event.preventDefault();
    const key = this.table.data.rowKey(row);
    const position = drop && Object.is(drop.key, key) ? drop.position : dropPositionFor(event.clientY, (event.currentTarget as HTMLElement).getBoundingClientRect());
    this.onRowDragEnd();
    this.commitRowMove(dragging.key, key, position);
  }

  /** Alt + flèche haut / bas sur la poignée : monte ou descend la ligne d'un cran dans l'affichage. */
  /** Ligne « saisie » par un clic sur sa poignée, en attente du clic sur la poignée de destination. */
  private readonly pickedRowKey = signal<unknown>(undefined);

  isRowPicked(row: T): boolean {
    return this.pickedRowKey() !== undefined && this.pickedRowKey() === this.table.data.rowKey(row);
  }

  /**
   * Déplacer une ligne sans glisser (WCAG 2.5.7) : un clic sur la poignée saisit la ligne, un clic sur la poignée
   * d'une autre ligne l'y dépose (avant elle en remontant, après elle en descendant). Un second clic sur la même
   * poignée annule.
   */
  onRowHandleClick(event: Event, row: T): void {
    event.stopPropagation();
    const labels = this.table.effectiveLabels();
    const picked = this.pickedRowKey();
    const key = this.table.data.rowKey(row);
    if (picked === undefined) {
      this.pickedRowKey.set(key);
      this.table.announce([labels.announceRowPicked]);
      return;
    }
    this.pickedRowKey.set(undefined);
    if (picked === key) {
      this.table.announce([labels.announceMoveCancelled]);
      return;
    }
    const displayed = this.table.paging.displayedRows();
    const from = displayed.findIndex((item) => this.table.data.rowKey(item) === picked);
    const to = displayed.indexOf(row);
    if (from !== -1 && to !== -1) {
      this.commitRowMove(picked, key, to > from ? 'after' : 'before');
    }
  }

  onRowHandleKeydown(event: KeyboardEvent, row: T): void {
    if (!event.altKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const displayed = this.table.paging.displayedRows();
    const index = displayed.indexOf(row);
    const neighbour = displayed[index + (event.key === 'ArrowUp' ? -1 : 1)];
    if (index >= 0 && neighbour !== undefined) {
      const key = this.table.data.rowKey(row);
      if (this.commitRowMove(key, this.table.data.rowKey(neighbour), event.key === 'ArrowUp' ? 'before' : 'after')) {
        // La ligne change de place dans le document : le focus revient sur sa poignée, pour enchaîner les déplacements.
        this.table.focus.refocusAfterRender(() => this.rowHandleOf(key));
      }
    }
  }

  /** Voir `NgTableComponent.moveRow`. */
  moveRow(row: T, target: T, position: RowDropPosition = 'before'): boolean {
    return this.commitRowMove(this.table.data.rowKey(row), this.table.data.rowKey(target), position);
  }

  private commitRowMove(fromKey: unknown, targetKey: unknown, position: RowDropPosition): boolean {
    const result = moveRow(this.table.data.syncedStore().rows(), (row) => this.table.data.rowKey(row), fromKey, targetKey, position);
    if (!result) {
      return false;
    }
    const store = this.table.data.syncedStore();
    this.table.rowMoved.emit({
      row: store.get(fromKey) as T,
      target: store.get(targetKey) as T,
      position,
      fromIndex: result.fromIndex,
      toIndex: result.toIndex,
      rows: result.rows,
    });
    this.table.announce([this.table.effectiveLabels().announceRowMoved.replace('{position}', `${result.toIndex + 1}`)]);
    return true;
  }

  /** Poignée de la ligne de clé `key`, parmi les lignes rendues (les lignes épinglées n'en ont pas). */
  private rowHandleOf(key: unknown): HTMLElement | undefined {
    const pinned = this.table.render.pinnedInfo();
    const index = this.table.render.tableRows()
      .filter((item): item is T => isDataItem(item) && !pinned.has(item as T))
      .findIndex((item) => Object.is(this.table.data.rowKey(item), key));
    return index === -1 ? undefined : this.table.hostElement.nativeElement.querySelectorAll<HTMLElement>('.ngt-row-handle')[index];
  }
}
