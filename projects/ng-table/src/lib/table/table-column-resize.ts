import {escapeCssToken, measureNaturalWidth} from '../dom-utils';
import type {NgTableColumn} from '../ng-table.models';
import {DEFAULT_MIN_COLUMN_WIDTH_PX} from './internals';
import type {NgTableComponent} from '../ng-table.component';

/** Redimensionnement de colonnes : souris, clavier, ajustement au contenu. */
export class TableColumnResize<T> {
  constructor(private readonly table: NgTableComponent<T>) {}

  private resizingState: { columnId: string; startX: number; startWidth: number } | null = null;

  onResizeStart(event: MouseEvent, column: NgTableColumn<T>): void {
    if (!column.resizable) {
      return;
    }

    // Let dblclick trigger auto-fit without initiating a drag cycle.
    if (event.detail > 1) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    // `table-layout: fixed` ignore `min-width`/`max-width` sur les cellules : sans
    // largeur explicite, les colonnes voisines absorbent la place et s'écrasent sous
    // leur `minWidthPx` (leur contenu débordant alors sur la colonne suivante). On fige
    // donc la largeur rendue de toutes les colonnes avant de commencer le drag : chacune
    // garde sa taille, et le tableau déborde en scroll horizontal comme attendu.
    this.freezeRenderedColumnWidths(event.target as HTMLElement | null);

    const widthMap = this.table.columnLayout.columnWidths();
    const startWidth = widthMap[column.id] ?? column.widthPx ?? 180;
    this.resizingState = {
      columnId: column.id,
      startX: event.clientX,
      startWidth,
    };

    document.addEventListener('mousemove', this.onMouseMoveBound);
    document.addEventListener('mouseup', this.onMouseUpBound);
  }

  /**
   * Keyboard-operable alternative to dragging the resize handle: ArrowLeft/ArrowRight
   * shrink/grow the column by a fixed step while the handle is focused. The mouse-only
   * drag otherwise has no keyboard equivalent at all (WCAG 2.1.1 Keyboard).
   */
  onResizeHandleKeydown(event: KeyboardEvent, column: NgTableColumn<T>): void {
    if (!column.resizable) {
      return;
    }
    // Équivalents clavier du double-clic (ajuster) et des butées.
    if (event.key === 'Enter') {
      event.preventDefault();
      this.autoFitColumn(column);
      return;
    }
    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      this.freezeRenderedColumnWidths(event.target as HTMLElement | null);
      const edge = event.key === 'Home' ? (column.minWidthPx ?? DEFAULT_MIN_COLUMN_WIDTH_PX) : (column.maxWidthPx ?? 620);
      this.table.columnLayout.columnWidths.update((current) => ({...current, [column.id]: edge}));
      return;
    }
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
      return;
    }
    event.preventDefault();

    // Même raison que dans `onResizeStart` : sans figer les largeurs rendues des
    // colonnes voisines, `table-layout: fixed` les laisse s'écraser sous leur
    // `minWidthPx` au lieu de laisser le tableau déborder en scroll horizontal.
    this.freezeRenderedColumnWidths(event.target as HTMLElement | null);

    const step = 16;
    const delta = event.key === 'ArrowLeft' ? -step : step;
    const widthMap = this.table.columnLayout.columnWidths();
    const currentWidth = widthMap[column.id] ?? column.widthPx ?? 180;
    const minWidth = column.minWidthPx ?? DEFAULT_MIN_COLUMN_WIDTH_PX;
    const maxWidth = column.maxWidthPx ?? 620;
    const nextWidth = Math.max(minWidth, Math.min(maxWidth, currentWidth + delta));

    this.table.columnLayout.columnWidths.update((current) => ({...current, [column.id]: nextWidth}));
    this.table.filtering.requestFilterPositionUpdate();
  }

  onResizeAutoFit(event: Event, column: NgTableColumn<T>): void {
    event.preventDefault();
    event.stopPropagation();
    this.autoFitColumn(column);
  }

  /** Voir `NgTableComponent.autoFitColumn`. */
  autoFitColumn(column: NgTableColumn<T>): void {
    if (!column.resizable) {
      return;
    }
    this.fitColumnToContent(column);
  }

  fitColumnToContent(column: NgTableColumn<T>): void {
    const table = this.resolveTableElement(null);
    if (!table) {
      return;
    }

    const selector = `.cdk-column-${escapeCssToken(column.id)}`;
    const cells = Array.from(table.querySelectorAll<HTMLElement>(selector));
    if (cells.length === 0) {
      return;
    }

    let measured = 0;
    for (const cell of cells) {
      const preferredNode =
        (cell.querySelector('.header-button') as HTMLElement | null)
        ?? (cell.querySelector('.th-wrap') as HTMLElement | null)
        ?? (cell.querySelector('.cell-content') as HTMLElement | null)
        ?? cell;

      const computed = window.getComputedStyle(cell);
      const padding = (parseFloat(computed.paddingLeft) || 0) + (parseFloat(computed.paddingRight) || 0);
      // En-tête : le bouton de filtre et la poignée de redimensionnement prennent leur place à côté du titre.
      const controls = (cell.querySelector('.filter-button') ? 36 : 0) + (cell.querySelector('.sort-level-button') ? 40 : 0);
      measured = Math.max(measured, Math.ceil(measureNaturalWidth(preferredNode) + padding + 14 + controls));
    }

    const minWidth = column.minWidthPx ?? DEFAULT_MIN_COLUMN_WIDTH_PX;
    const maxWidth = column.maxWidthPx ?? 620;
    const nextWidth = Math.max(minWidth, Math.min(maxWidth, measured));

    // Les colonnes voisines doivent aussi être figées, sinon l'auto-fit d'une colonne
    // écrase les autres exactement comme un drag (cf. `freezeRenderedColumnWidths`).
    this.freezeRenderedColumnWidths(table);

    this.table.columnLayout.columnWidths.update((current) => ({
      ...current,
      [column.id]: nextWidth,
    }));

    this.table.filtering.requestFilterPositionUpdate();
  }

  /**
   * Donne une largeur explicite à chaque colonne visible qui n'en a pas encore, à
   * partir de sa largeur réellement rendue — condition pour qu'un redimensionnement
   * n'écrase pas les colonnes voisines (cf. `table-layout: fixed`).
   */
  private freezeRenderedColumnWidths(fromElement: HTMLElement | null): void {
    const table = this.resolveTableElement(fromElement);
    if (!table) {
      return;
    }

    const measured: Record<string, number> = {};
    for (const candidate of this.table.columnLayout.visibleColumns()) {
      if (this.table.columnLayout.columnWidths()[candidate.id] !== undefined) {
        continue;
      }
      const headerCell = table.querySelector<HTMLElement>(
        `th.cdk-column-${escapeCssToken(candidate.id)}`,
      );
      const width = headerCell?.getBoundingClientRect().width ?? 0;
      if (width > 0) {
        measured[candidate.id] = Math.round(width);
      }
    }

    if (Object.keys(measured).length > 0) {
      this.table.columnLayout.columnWidths.update((current) => ({...measured, ...current}));
    }
  }

  private resolveTableElement(fromElement: HTMLElement | null): HTMLElement | null {
    return (
      (fromElement?.closest('table.ng-table') as HTMLElement | null)
      ?? this.table.hostElement.nativeElement.querySelector<HTMLElement>('table.ng-table')
    );
  }

  private readonly onMouseMoveBound = (event: MouseEvent) => this.onResizeMove(event);
  private readonly onMouseUpBound = () => this.stopResize();

  onResizeMove(event: MouseEvent): void {
    if (!this.resizingState) {
      return;
    }

    const column = this.table.columns().find((item) => item.id === this.resizingState?.columnId);
    if (!column) {
      this.stopResize();
      return;
    }

    const delta = event.clientX - this.resizingState.startX;
    const minWidth = column.minWidthPx ?? DEFAULT_MIN_COLUMN_WIDTH_PX;
    const maxWidth = column.maxWidthPx ?? 620;
    const nextWidth = Math.max(minWidth, Math.min(maxWidth, this.resizingState.startWidth + delta));

    this.table.columnLayout.columnWidths.update((current) => ({
      ...current,
      [column.id]: nextWidth,
    }));
  }

  stopResize(): void {
    if (!this.resizingState) {
      return;
    }
    this.resizingState = null;
    document.removeEventListener('mousemove', this.onMouseMoveBound);
    document.removeEventListener('mouseup', this.onMouseUpBound);
  }
}
