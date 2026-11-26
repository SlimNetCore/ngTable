import {computed, effect, signal, untracked} from '@angular/core';
import {draftFromValue} from '../cell-edit';
import {writeClipboardText} from '../dom-utils';
import {
    buildFillAssignments,
    buildPasteAssignments,
    CellPosition,
    CellRange,
    clampRange,
    FillDirection,
    fillTarget,
    normalizeRange,
    parseClipboardText,
    rangeContains,
    rangeEdges,
    toClipboardText,
} from '../cell-range';
import type {NgTableColumn, NgTableRangeSelection} from '../ng-table.models';
import {toExportCell} from './internals';
import type {NgTableComponent} from '../ng-table.component';

/** Sélection d'une plage de cellules : souris, clavier, copier, coller, poignée de recopie. */
export class TableRangeSelection<T> {
  constructor(private readonly table: NgTableComponent<T>) {}

  private readonly visibleColumnIndexes = computed(() => new Map(this.table.columnLayout.visibleColumns().map((column, index) => [column.id, index] as const)));
  private readonly rangeAnchor = signal<CellPosition | null>(null);
  private readonly rangeFocus = signal<CellPosition | null>(null);
  private rangeDragging = false;

  /** Plage sélectionnée, ramenée aux lignes et colonnes qui existent encore. */
  readonly rangeBounds = computed<CellRange | null>(() => {
    const anchor = this.rangeAnchor();
    const focus = this.rangeFocus();
    if (!this.table.rangeSelection() || !anchor || !focus) {
      return null;
    }
    return clampRange(normalizeRange(anchor, focus), this.table.paging.displayedRows().length, this.table.columnLayout.visibleColumns().length);
  });

  /** Position (ligne affichée, colonne visible) d'une cellule du DOM ; `null` hors données (sélection, épinglées...). */
  private rangePositionOf(element: Element | null): CellPosition | null {
    const cell = element?.closest('td');
    const rowAttr = cell?.parentElement?.getAttribute('data-ngt-row');
    const columnId = cell?.getAttribute('data-ngt-col');
    if (!cell || rowAttr === null || rowAttr === undefined || !columnId) {
      return null;
    }
    const col = this.visibleColumnIndexes().get(columnId);
    return col === undefined ? null : {row: Number(rowAttr), col};
  }

  /** Flèches : avec Maj, la plage s'étend jusqu'à la cellule atteinte ; sans Maj, elle se réduit à cette cellule. */
  moveRangeWithKeyboard(from: HTMLTableCellElement, to: HTMLTableCellElement | null, extend: boolean): void {
    if (!this.table.rangeSelection()) {
      return;
    }
    const destination = this.rangePositionOf(to);
    if (!destination) {
      return;
    }
    if (extend) {
      this.rangeAnchor.update((anchor) => anchor ?? this.rangePositionOf(from) ?? destination);
      this.rangeFocus.set(destination);
    } else {
      this.rangeAnchor.set(destination);
      this.rangeFocus.set(destination);
    }
  }

  onRangeMouseDown(event: MouseEvent): void {
    const target = event.target as HTMLElement | null;
    if (!this.table.rangeSelection() || event.button !== 0 || !target) {
      return;
    }
    // Les boutons, champs et cases à cocher des cellules gardent leur comportement.
    if (target.closest('button, a, input, select, textarea, ng-table-checkbox, [role="button"]')) {
      return;
    }
    // Recopie armée par un clic sur la poignée : ce clic désigne la dernière cellule à remplir.
    if (this.fillArmed()) {
      const bounds = this.rangeBounds();
      const to = this.rangePositionOf(target);
      this.fillArmed.set(false);
      const fill = bounds && to ? fillTarget(bounds, to) : null;
      if (bounds && fill) {
        event.preventDefault();
        this.fillRange(bounds, fill.range, fill.direction);
        return;
      }
    }
    const position = this.rangePositionOf(target);
    const cell = target.closest('td');
    if (!position || !cell) {
      return;
    }
    event.preventDefault(); // pas de sélection de texte pendant le glissement
    if (cell.getAttribute('tabindex') === null) {
      cell.tabIndex = -1; // focalisable, pour recevoir Ctrl+C / Ctrl+V / Échap
    }
    cell.focus({preventScroll: true});
    if (event.shiftKey && this.rangeAnchor()) {
      this.rangeFocus.set(position);
    } else {
      this.rangeAnchor.set(position);
      this.rangeFocus.set(position);
    }
    this.rangeDragging = true;
    document.addEventListener('mousemove', this.onRangeMouseMove);
    document.addEventListener('mouseup', this.onRangeMouseUp);
  }

  private readonly onRangeMouseMove = (event: MouseEvent): void => {
    const position = this.rangePositionOf(event.target as Element | null);
    const focus = this.rangeFocus();
    if (this.rangeDragging && position && (!focus || focus.row !== position.row || focus.col !== position.col)) {
      this.rangeFocus.set(position);
    }
  };

  private readonly onRangeMouseUp = (): void => this.detachRangeDragListeners();

  detachRangeDragListeners(): void {
    this.rangeDragging = false;
    // Appelé à la destruction, donc aussi en rendu côté serveur, où `document` n'existe pas.
    if (typeof document === 'undefined') {
      return;
    }
    document.removeEventListener('mousemove', this.onRangeMouseMove);
    document.removeEventListener('mouseup', this.onRangeMouseUp);
    document.removeEventListener('mousemove', this.onFillMove);
    document.removeEventListener('mouseup', this.onFillEnd);
  }

  /** Ctrl+C copie la plage, Ctrl+A la étend à toute la page, Échap l'efface. */
  onRangeKeydown(event: KeyboardEvent): void {
    const target = event.target as HTMLElement | null;
    // Dans un champ ou un bouton d'une cellule, les raccourcis gardent leur sens habituel.
    if (!this.table.rangeSelection() || target?.tagName !== 'TD') {
      return;
    }
    const modifier = event.ctrlKey || event.metaKey;
    const key = event.key.toLowerCase();
    if (modifier && key === 'c' && this.rangeBounds()) {
      event.preventDefault();
      void this.copySelectedRange();
    } else if (modifier && key === 'a' && this.rangePositionOf(target)) {
      event.preventDefault();
      this.selectAllCells();
    } else if (modifier && (key === 'd' || key === 'r') && this.table.fillHandle() && this.rangeBounds()) {
      // Ctrl+D / Ctrl+R : la première ligne (ou colonne) de la plage est recopiée dans le reste de la plage.
      const bounds = this.rangeBounds()!;
      const source = key === 'd' ? {...bounds, row2: bounds.row1} : {...bounds, col2: bounds.col1};
      if (source.row2 !== bounds.row2 || source.col2 !== bounds.col2) {
        event.preventDefault();
        this.fillRange(source, bounds, key === 'd' ? 'down' : 'right');
      }
    } else if (event.key === 'Escape' && this.fillArmed()) {
      this.fillArmed.set(false);
      this.table.announce([this.table.effectiveLabels().announceMoveCancelled]);
    } else if (event.key === 'Escape' && this.rangeBounds()) {
      this.clearRangeSelection();
    }
  }

  /** Plage visée pendant qu'on tire la poignée (source comprise), et sens de la recopie. */
  private readonly fillPreview = signal<{range: CellRange; direction: FillDirection} | null>(null);

  /** La cellule porte la poignée : coin bas-droit de la plage (côté fin de ligne). */
  isFillHandleCell(row: T, column: NgTableColumn<T>): boolean {
    const bounds = this.rangeBounds();
    if (!this.table.fillHandle() || !bounds || this.table.dataMode() !== 'local') {
      return false;
    }
    return this.table.aria.renderedRowIndexes().get(row) === bounds.row2 && this.visibleColumnIndexes().get(column.id) === bounds.col2;
  }

  /** `data-ngt-fill` d'une cellule : elle sera remplie si la poignée est lâchée maintenant. */
  cellFillAttr(row: T, column: NgTableColumn<T>): '' | null {
    const preview = this.fillPreview();
    const bounds = this.rangeBounds();
    if (!preview || !bounds) {
      return null;
    }
    const r = this.table.aria.renderedRowIndexes().get(row);
    const c = this.visibleColumnIndexes().get(column.id);
    return r !== undefined && c !== undefined && rangeContains(preview.range, r, c) && !rangeContains(bounds, r, c) ? '' : null;
  }

  /**
   * Recopie « armée » par un simple clic sur la poignée : le clic suivant sur une cellule recopie jusqu'à elle.
   * Alternative au glisser pour qui ne peut que cliquer ou toucher (WCAG 2.5.7).
   */
  readonly fillArmed = signal(false);

  onFillStart(event: MouseEvent): void {
    if (event.button !== 0 || !this.rangeBounds()) {
      return;
    }
    event.preventDefault();
    event.stopPropagation(); // ce n'est pas le début d'une nouvelle sélection
    this.fillDragged = false;
    document.addEventListener('mousemove', this.onFillMove);
    document.addEventListener('mouseup', this.onFillEnd);
  }

  private fillDragged = false;

  private readonly onFillMove = (event: MouseEvent): void => {
    const bounds = this.rangeBounds();
    const position = this.rangePositionOf(event.target as Element | null);
    this.fillDragged = true;
    if (bounds && position) {
      this.fillPreview.set(fillTarget(bounds, position));
    }
  };

  private readonly onFillEnd = (): void => {
    document.removeEventListener('mousemove', this.onFillMove);
    document.removeEventListener('mouseup', this.onFillEnd);
    const preview = this.fillPreview();
    const bounds = this.rangeBounds();
    this.fillPreview.set(null);
    if (preview && bounds) {
      this.fillArmed.set(false);
      this.fillRange(bounds, preview.range, preview.direction);
    } else if (!this.fillDragged && bounds) {
      // Clic sans glisser : la recopie est armée (ou désarmée par un second clic).
      const armed = !this.fillArmed();
      this.fillArmed.set(armed);
      this.table.announce([armed ? this.table.effectiveLabels().announceFillArmed : this.table.effectiveLabels().announceMoveCancelled]);
    }
  };

  /** Recopie `source` dans le reste de `target`, en un lot annulable, puis étend la sélection à `target`. */
  private fillRange(source: CellRange, target: CellRange, direction: FillDirection): void {
    const rows = this.table.paging.displayedRows();
    const columns = this.table.columnLayout.visibleColumns();
    const assignments = buildFillAssignments(source, target, direction, (row, col) => columns[col].valueAccessor(rows[row]))
      .filter(({row, col}) => row >= 0 && row < rows.length && col >= 0 && col < columns.length)
      .map(({row, col, value}) => ({row: rows[row], column: columns[col], value: draftFromValue(this.table.cellEditing.editorKind(columns[col]), value)}));
    this.table.cellEditing.applyPastedValues(assignments, 'fill');
    this.rangeAnchor.set({row: target.row1, col: target.col1});
    this.rangeFocus.set({row: target.row2, col: target.col2});
  }

  onRangePaste(event: ClipboardEvent): void {
    if (!this.table.rangeSelection() || (event.target as HTMLElement | null)?.tagName !== 'TD' || !this.rangeBounds()) {
      return;
    }
    const text = event.clipboardData?.getData('text/plain') ?? '';
    if (text !== '') {
      event.preventDefault();
      this.pasteIntoRange(text);
    }
  }

  /** `data-ngt-range` d'une cellule : `in`, plus `top` / `right` / `bottom` / `left` sur le contour de la plage. */
  cellRangeAttr(row: T, column: NgTableColumn<T>): string | null {
    const bounds = this.rangeBounds();
    if (!bounds) {
      return null;
    }
    const r = this.table.aria.renderedRowIndexes().get(row);
    const c = this.visibleColumnIndexes().get(column.id);
    if (r === undefined || c === undefined || !rangeContains(bounds, r, c)) {
      return null;
    }
    const edges = rangeEdges(bounds, r, c);
    return ['in', edges.top && 'top', edges.right && 'right', edges.bottom && 'bottom', edges.left && 'left'].filter(Boolean).join(' ');
  }

  /** `aria-selected` d'une cellule : seulement quand la table est une grille (`[cellNavigation]`). */
  cellRangeSelected(row: T, column: NgTableColumn<T>): 'true' | null {
    return this.table.keyboard.gridActive() && this.cellRangeAttr(row, column) ? 'true' : null;
  }

  /** `data-ngt-row` d'une ligne : son index dans `displayedRows()`, pour retrouver la cellule sous la souris. */
  rowRangeIndex(row: T): number | null {
    return this.table.rangeSelection() ? (this.table.aria.renderedRowIndexes().get(row) ?? null) : null;
  }

  /** Voir `NgTableComponent.getSelectedRange`. */
  getSelectedRange(): NgTableRangeSelection<T> | null {
    const bounds = this.rangeBounds();
    if (!bounds) {
      return null;
    }
    const rows = this.table.paging.displayedRows().slice(bounds.row1, bounds.row2 + 1);
    const columns = this.table.columnLayout.visibleColumns().slice(bounds.col1, bounds.col2 + 1);
    const matrix = rows.map((row) =>
      columns.map((column) => {
        const value = toExportCell(column.exportValueAccessor ? column.exportValueAccessor(row) : column.valueAccessor(row));
        return value === null ? '' : String(value);
      }),
    );
    if (this.table.rangeCopyHeaders()) {
      matrix.unshift(columns.map((column) => column.header));
    }
    return {rows, columns, text: toClipboardText(matrix)};
  }

  /** Voir `NgTableComponent.copySelectedRange`. */
  async copySelectedRange(): Promise<boolean> {
    const selection = this.getSelectedRange();
    if (!selection) {
      return false;
    }
    const copied = await writeClipboardText(selection.text);
    if (copied) {
      this.table.announce([this.table.effectiveLabels().announceCellsCopied.replace('{count}', `${selection.rows.length * selection.columns.length}`)]);
    }
    if (copied) {
      this.table.rangeCopied.emit({text: selection.text, rowCount: selection.rows.length, columnCount: selection.columns.length});
    }
    return copied;
  }

  /** Voir `NgTableComponent.pasteIntoRange`. */
  pasteIntoRange(text: string): void {
    const bounds = this.rangeBounds();
    if (!bounds) {
      return;
    }
    const values = parseClipboardText(text);
    const rows = this.table.paging.displayedRows();
    const columns = this.table.columnLayout.visibleColumns();
    const assignments = buildPasteAssignments(values, bounds, rows.length, columns.length).map(({row, col, value}) => ({
      row: rows[row],
      column: columns[col],
      value,
    }));
    const applied = this.table.editOnPaste() ? this.table.cellEditing.applyPastedValues(assignments) : 0;
    this.table.rangePasted.emit({assignments, text, values, applied});
  }

  /** Voir `NgTableComponent.selectAllCells`. */
  selectAllCells(): void {
    const rows = this.table.paging.displayedRows().length;
    const columns = this.table.columnLayout.visibleColumns().length;
    if (rows > 0 && columns > 0) {
      this.rangeAnchor.set({row: 0, col: 0});
      this.rangeFocus.set({row: rows - 1, col: columns - 1});
    }
  }

  /** Voir `NgTableComponent.clearRangeSelection`. */
  clearRangeSelection(): void {
    this.rangeAnchor.set(null);
    this.rangeFocus.set(null);
  }

  /** Efface la plage quand un tri, un filtre, une page ou un regroupement déplace les cellules. */
  clearWhenPositionsChange(): void {
    // La plage se rapporte à des positions : elle ne survit pas à un tri, un filtre, une
    // recherche, un changement de page ou de colonnes (mais bien aux mises à jour de données).
    effect(() => {
      this.table.sorting.sortStates();
      this.table.filtering.columnFilters();
      this.table.filtering.globalSearchTerm();
      this.table.pageIndex();
      this.table.pageSize();
      this.table.groupBy();
      this.table.groupLevels();
      this.table.columnLayout.displayedColumnIds();
      untracked(() => this.clearRangeSelection());
    });
  }
}
