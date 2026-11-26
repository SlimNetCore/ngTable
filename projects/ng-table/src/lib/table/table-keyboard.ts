import {afterNextRender, afterRenderEffect, computed, signal, untracked} from '@angular/core';
import {
    FOCUSABLE_IN_CELL,
    GRID_PAGE_STEP,
    gridCellAt,
    GridPosition,
    gridRows,
    locateGridCell,
    moveGridTabStop,
    nextGridPosition,
    syncGridTabStops,
} from '../grid-navigation';
import {NgTableGroupRow} from '../row-grouping';
import {isDataItem} from './internals';
import type {NgTableComponent} from '../ng-table.component';

/** Navigation au clavier dans la grille : cellule active, tabindex itinérant, sauts dans la liste virtuelle. */
export class TableKeyboard<T> {
  constructor(private readonly table: NgTableComponent<T>) {}

  private tabStopRows = new WeakSet<Element>();
  private tabStopColumns: unknown = null;
  private tabStopJumps = 0;
  rowSlotJumpsSeen = 0;

  /** Instant du dernier saut demandé au clavier (Ctrl+Fin, F8...) : le focus ou une annonce suit déjà. */
  keyboardJumpAt = 0;

  /**
   * Après un saut (barre de défilement, `scrollToIndex`) avec réutilisation des lignes, la cellule qui a le focus
   * affiche une autre ligne : on le dit, sinon un lecteur d'écran croit être resté au même endroit (WCAG 2.4.3).
   */
  announceFocusedCellAfterJump(): void {
    const table = this.table.tableElement()?.nativeElement;
    const active = typeof document === 'undefined' ? null : document.activeElement;
    if (!table || !(active instanceof HTMLTableCellElement) || !table.contains(active) || performance.now() - this.keyboardJumpAt < 600) {
      return;
    }
    const located = locateGridCell(table, active);
    const item = located ? this.gridItemAt(located.position.row) : undefined;
    const lead = this.table.columnLayout.visibleColumns()[0];
    if (!located || item === undefined || item instanceof NgTableGroupRow || !lead) {
      return;
    }
    const name = `${lead.valueAccessor(item) ?? ''}`.trim();
    const text = (active.textContent ?? '').trim();
    this.table.announce([name, text === name ? '' : text]);
  }

  /**
   * Défilement virtuel : Ctrl+Fin, Ctrl+Début, Page suivante et Page précédente visent une ligne de la LISTE, pas
   * seulement une des lignes rendues. Si la ligne visée n'est pas rendue, la table défile puis le focus s'y pose.
   * Renvoie `false` quand la navigation ordinaire suffit (ligne déjà rendue, ligne épinglée).
   */
  private jumpInVirtualList(event: KeyboardEvent, table: HTMLTableElement, cell: HTMLTableCellElement, position: GridPosition): boolean {
    const key = event.key;
    const paging = key === 'PageDown' || key === 'PageUp';
    if (!paging && !((event.ctrlKey || event.metaKey) && (key === 'End' || key === 'Home'))) {
      return false;
    }
    const count = this.table.viewport.virtualCount();
    const rank = Number(cell.parentElement?.getAttribute('aria-rowindex'));
    if (!this.table.viewport.virtualRange() || count === 0 || !Number.isFinite(rank) || rank <= 0) {
      return false;
    }
    const offset = this.table.aria.headerRowCount() + 1 + this.table.grouping.stickyGroupExtras().length;
    const current = rank - offset;
    const target = key === 'End' ? count - 1 : key === 'Home' ? 0 : Math.min(count - 1, Math.max(0, current + (key === 'PageDown' ? GRID_PAGE_STEP : -GRID_PAGE_STEP)));
    if (target === current || table.querySelector(`tr.data-row[aria-rowindex="${target + offset}"], tr.group-row[aria-rowindex="${target + offset}"]`)) {
      return false; // déjà rendue : le navigateur fait défiler en posant le focus
    }
    event.preventDefault();
    this.keyboardJumpAt = performance.now();
    // Vers le bas, la ligne visée arrive en bas de la zone ; vers le haut, en haut.
    const visible = Math.max(1, Math.floor(this.table.viewport.viewportHeight() / Math.max(1, this.table.viewport.rowHeight())) - 2);
    this.table.viewport.scrollToIndex(target > current ? Math.max(0, target - visible + 1) : target);
    const col = paging ? position.col : key === 'End' ? Number.MAX_SAFE_INTEGER : 0;
    this.focusListRowWhenRendered(target, col, cell, event.shiftKey, 0);
    return true;
  }

  /** Pose le focus sur la cellule `col` de la ligne `index` de la liste dès qu'elle est rendue (bloc en cours de chargement : on réessaie). */
  private focusListRowWhenRendered(index: number, col: number, from: HTMLTableCellElement, extend: boolean, attempt: number): void {
    afterNextRender(
      () => {
        const table: HTMLTableElement | undefined = this.table.tableElement()?.nativeElement;
        if (!table) {
          return;
        }
        const rank = index + this.table.aria.headerRowCount() + 1 + this.table.grouping.stickyGroupExtras().length;
        const row = table.querySelector<HTMLTableRowElement>(`tr.data-row[aria-rowindex="${rank}"], tr.group-row[aria-rowindex="${rank}"]`);
        if (!row || row.cells.length === 0) {
          if (attempt < 12) {
            setTimeout(() => this.focusListRowWhenRendered(index, col, from, extend, attempt + 1), 120);
          }
          return;
        }
        this.keyboardJumpAt = performance.now();
        const target = row.cells[Math.min(col, row.cells.length - 1)];
        target.focus();
        this.table.range.moveRangeWithKeyboard(from, target, extend);
      },
      {injector: this.table.injector},
    );
  }

  /**
   * La table se parcourt cellule par cellule au clavier (motif « grid » de WAI-ARIA). Demandé par `[cellNavigation]`,
   * et d'office dès qu'une fonction n'existerait sinon qu'à la souris ou que la table annonce un rôle qui promet les
   * flèches : colonnes éditables, sélection de plage, lignes qui se déplient (détail, arbre, groupes repliables).
   */
  readonly gridActive = computed(() => this.table.cellNavigation() || this.table.cellEditing.hasEditableColumns() || this.table.rangeSelection() || this.table.grouping.rowsExpandable());

  /** Éléments de la grille dans l'ordre du document : lignes de données et en-têtes de groupe. */
  private gridItemAt(row: number): T | NgTableGroupRow<T> | undefined {
    return this.table.render.tableRows().filter((item): item is T | NgTableGroupRow<T> => isDataItem(item) || item instanceof NgTableGroupRow)[row] as T | NgTableGroupRow<T> | undefined;
  }

  readonly cellsTagged = computed(() => this.table.rangeSelection() || this.table.cellEditing.hasEditableColumns());

  /** Cellule active de la navigation clavier (index de ligne affichée, index de cellule). */
  readonly activeGridCell = signal<GridPosition>({row: 0, col: 0});

  /**
   * Enter/Space mirrors a row click (detail toggle); the "ContextMenu" key or
   * Shift+F10 opens the row's context menu — the standard keyboard equivalent for a
   * right-click, per the WAI-ARIA APG. Without this, `rowContextMenuEnabled` would
   * only ever be reachable with a mouse.
   */
  /** Navigation cellule par cellule : touches reçues par la table (voir `cellNavigation`). */
  onGridKeydown(event: KeyboardEvent): void {
    const table = this.table.tableElement()?.nativeElement;
    const target = event.target as HTMLElement | null;
    if (!this.gridActive() || !table || !target) {
      return;
    }
    const located = locateGridCell(table, target);
    if (!located) {
      return;
    }
    const {cell, position} = located;

    // Focus sur un bouton / champ d'une cellule : il garde ses touches, Échap rend la main à la cellule.
    if (target !== cell) {
      if (event.key === 'Escape') {
        event.preventDefault();
        cell.focus();
      }
      return;
    }

    const item = this.gridItemAt(position.row);
    if (this.table.tree.treeActive() && event.altKey && (event.key === 'ArrowRight' || event.key === 'ArrowLeft')) {
      if (item !== undefined && !(item instanceof NgTableGroupRow)) {
        event.preventDefault();
        this.table.tree.setTreeExpanded(item, event.key === 'ArrowRight');
        return;
      }
    }
    // En-tête de groupe (motif treegrid) : Flèche droite déplie, Flèche gauche replie ; déjà dans cet état, la flèche
    // passe à la cellule voisine. Entrée et Espace basculent (gérés par la ligne elle-même).
    if (item instanceof NgTableGroupRow) {
      const sideways = event.key === 'ArrowRight' || event.key === 'ArrowLeft';
      if (sideways && this.table.grouping.groupsCollapsible() && !event.ctrlKey && !event.metaKey && item.collapsed === (event.key === 'ArrowRight')) {
        event.preventDefault();
        this.table.grouping.toggleGroup(item.group);
        return;
      }
    }

    if (this.table.viewport.virtualActive() && this.jumpInVirtualList(event, table, cell, position)) {
      return;
    }
    const rows = gridRows(table);
    const next = nextGridPosition(event.key, event.ctrlKey || event.metaKey, position, rows.length, cell.parentElement
      ? (cell.parentElement as HTMLTableRowElement).cells.length
      : 0);
    if (next) {
      event.preventDefault();
      this.focusGridCell(table, next, cell);
      this.table.range.moveRangeWithKeyboard(cell, gridCellAt(table, next), event.shiftKey);
      return;
    }

    // Le reste ne concerne que les lignes de données.
    if (item === undefined || item instanceof NgTableGroupRow) {
      return;
    }
    const row = item;
    if (event.key === 'Enter' || event.key === 'F2') {
      event.preventDefault();
      const column = this.table.cellEditing.columnOfCell(cell);
      if (column && this.table.cellEditing.startEdit(row, column, cell)) {
        return;
      }
      const inner = cell.querySelector<HTMLElement>(FOCUSABLE_IN_CELL);
      if (inner) {
        inner.focus();
      } else if (event.key === 'Enter') {
        this.table.render.onRowClick(row);
      }
    } else if (event.key === ' ' && this.table.rowSelectionEnabled()) {
      event.preventDefault();
      this.toggleRowSelectionFromKeyboard(row);
    } else if (event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey)) {
      event.preventDefault();
      this.table.rowMenu.openRowContextMenuFromKeyboard(cell.parentElement, row);
    } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      // Taper un caractère sur une cellule éditable ouvre l'éditeur avec ce caractère (comme un tableur).
      const column = this.table.cellEditing.columnOfCell(cell);
      if (column && this.table.cellEditing.startEdit(row, column, cell, event.key)) {
        event.preventDefault();
      }
    }
  }

  /** Ctrl+Z défait, Ctrl+Y (ou Ctrl+Maj+Z) rétablit : seulement sur une cellule, pas dans un champ de saisie. */
  onEditKeydown(event: KeyboardEvent): void {
    if (!this.table.cellEditing.hasEditableColumns() || (event.target as HTMLElement | null)?.tagName !== 'TD' || !(event.ctrlKey || event.metaKey)) {
      return;
    }
    const key = event.key.toLowerCase();
    if (key === 'z' && !event.shiftKey) {
      event.preventDefault();
      this.table.cellEditing.undo();
    } else if (key === 'y' || (key === 'z' && event.shiftKey)) {
      event.preventDefault();
      this.table.cellEditing.redo();
    }
  }

  /** Un clic (ou un focus programmatique) dans une cellule en fait la cellule active. */
  onGridFocusIn(event: FocusEvent): void {
    const table = this.table.tableElement()?.nativeElement;
    if (!this.gridActive() || !table || !event.target) {
      return;
    }
    const located = locateGridCell(table, event.target as Element);
    if (located) {
      moveGridTabStop(gridCellAt(table, this.activeGridCell()), located.cell);
      this.activeGridCell.set(located.position);
    }
  }

  focusGridCell(table: HTMLTableElement, position: GridPosition, from: HTMLTableCellElement): void {
    const target = gridCellAt(table, position);
    if (!target) {
      return;
    }
    moveGridTabStop(from, target);
    this.activeGridCell.set(position);
    target.focus();
  }

  toggleRowSelectionFromKeyboard(row: T): void {
    const key = this.table.data.rowKey(row);
    const selected = new Set(this.table.selection.selectedKeysSet());
    const checked = !selected.has(key);
    if (checked) {
      selected.add(key);
    } else {
      selected.delete(key);
    }
    this.table.selection.commitSelection(selected, row, checked);
  }

  onRowKeydown(event: KeyboardEvent, row: T): void {
    if (this.gridActive()) {
      return; // la grille gère déjà ces touches depuis la cellule active
    }
    // Seulement quand la LIGNE a le focus : Entrée ou Espace sur un bouton, une case ou un lien de la ligne leur
    // appartient (WCAG 2.1.1). Sans ce test, la ligne annulait leur action et basculait le détail à la place.
    if (event.target !== event.currentTarget) {
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.table.render.onRowClick(row);
      return;
    }

    if (event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey)) {
      event.preventDefault();
      this.table.rowMenu.openRowContextMenuFromKeyboard(event.currentTarget as HTMLElement | null, row);
    }
  }

  /** Tient à jour le tabindex itinérant après chaque rendu qui change les lignes ou les colonnes. */
  keepTabStopsAfterRender(): void {
    // Navigation cellule par cellule : après chaque rendu qui change les lignes ou les
    // colonnes, une seule cellule reste atteignable par Tab (tabindex itinérant). La
    // cellule qui a le focus le garde (en défilement virtuel, les lignes rendues changent).
    afterRenderEffect(() => {
      if (!this.gridActive()) {
        return;
      }
      this.table.render.tableRows();
      const columnIds = this.table.columnLayout.displayedColumnIds();
      const table = this.table.tableElement()?.nativeElement;
      if (table) {
        // Seules les lignes qui entrent sont parcourues. On repart de zéro quand les cellules des lignes déjà là ont
        // pu changer : colonnes modifiées, ou lignes réutilisées pour d'autres données (saut, tri, filtre).
        if (columnIds !== this.tabStopColumns || this.table.reuse.rowSlotJumps !== this.tabStopJumps || untracked(() => this.table.reuse.rowReuseActive())) {
          this.tabStopColumns = columnIds;
          this.tabStopJumps = this.table.reuse.rowSlotJumps;
          this.tabStopRows = new WeakSet<Element>();
        }
        const focused = document.activeElement ? locateGridCell(table, document.activeElement) : null;
        syncGridTabStops(table, focused?.position ?? untracked(() => this.activeGridCell()), this.tabStopRows);
      }
    });
  }
}
