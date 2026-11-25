import {computed, signal} from '@angular/core';
import {NgTableCheckboxChange} from '../ng-table-checkbox.component';
import {NgTableSelectionBarContext, ResolvedSelectionAction, resolveSelectionActions} from '../selection-actions';
import type {NgTableComponent} from '../ng-table.component';

/** Sélection de lignes et barre d'actions de sélection. */
export class TableSelection<T> {
  constructor(private readonly table: NgTableComponent<T>) {}

  /** Etat interne de selection quand `selectedRowKeys` n'est pas fourni. */
  private readonly internalSelectedKeys = signal<ReadonlySet<unknown>>(new Set());

  /** `{index}` interpolé en 1-based — plus lisible qu'un index 0-based pour un utilisateur de lecteur d'écran. */
  /**
   * Nom de la case de sélection d'une ligne : la valeur de sa première colonne (« Sélectionner la ligne CMD-000042 »).
   * Le rang de rendu changeait au défilement et ne désignait rien de stable ; il ne sert plus que si la ligne n'a pas
   * de texte en première colonne.
   */
  rowSelectAriaLabel(rowIndex: number, row?: T): string {
    const lead = row === undefined ? undefined : this.table.columnLayout.visibleColumns()[0];
    const name = lead && row !== undefined ? `${lead.valueAccessor(row) ?? ''}`.trim() : '';
    const labels = this.table.effectiveLabels();
    return name ? labels.selectRowNamed.replace('{name}', name) : labels.selectRow.replace('{index}', `${rowIndex + 1}`);
  }

  /**
   * Clés sélectionnées sous forme de `Set`, mémoïsé : `isRowSelected()` est appelé
   * pour chaque ligne à chaque rendu. Avant, le mode contrôlé faisait un
   * `Array.includes` (O(n)) par ligne, et chaque appel à `resolveSelectedKeysSet()`
   * recréait un `Set` complet.
   */
  readonly selectedKeysSet = computed<ReadonlySet<unknown>>(() => {
    const external = this.table.selectedRowKeys();
    return external ? new Set(external) : this.internalSelectedKeys();
  });

  /** Voir `NgTableComponent.isRowSelected`. */
  isRowSelected(row: T): boolean {
    return this.table.rowSelectionEnabled() && this.selectedKeysSet().has(this.table.data.rowKey(row));
  }

  /** Voir `NgTableComponent.selectedRowsCount`. */
  readonly selectedRowsCount = computed(() => this.selectedKeysSet().size);

  /** Nombre de lignes affichées sélectionnées — base commune de l'état de la case « tout sélectionner ». */
  private readonly selectedDisplayedCount = computed(() => {
    if (!this.table.rowSelectionEnabled()) {
      return 0;
    }
    const selected = this.selectedKeysSet();
    return this.table.paging.displayedRows().reduce((count, row) => count + (selected.has(this.table.data.rowKey(row)) ? 1 : 0), 0);
  });

  readonly areAllDisplayedRowsSelected = computed(() => {
    const total = this.table.paging.displayedRows().length;
    return this.table.rowSelectionEnabled() && total > 0 && this.selectedDisplayedCount() === total;
  });

  readonly hasPartiallySelectedDisplayedRows = computed(() => {
    const count = this.selectedDisplayedCount();
    return count > 0 && count < this.table.paging.displayedRows().length;
  });

  /** Lignes déjà vues quand elles ont été sélectionnées : en mode distant, la page courante ne les contient pas toutes. */
  private readonly selectedRowCache = new Map<unknown, T>();

  /** Lignes sélectionnées, dans l'ordre d'arrivée (local) ou d'affichage (distant). Calculées seulement si la barre est active. */
  private readonly selectedRowsList = computed<readonly T[]>(() => {
    if (!this.table.selectionBar() || !this.table.rowSelectionEnabled()) {
      return [];
    }
    const keys = this.selectedKeysSet();
    if (keys.size === 0) {
      return [];
    }
    if (this.table.dataMode() === 'local') {
      const store = this.table.data.syncedStore();
      this.table.data.dataVersion();
      const rows: T[] = [];
      for (const key of keys) {
        const row = store.get(key);
        if (row !== undefined) {
          rows.push(row);
        }
      }
      return rows;
    }
    const shown = new Map(this.table.paging.displayedRows().map((row) => [this.table.data.rowKey(row), row] as const));
    const rows: T[] = [];
    for (const key of keys) {
      const row = shown.get(key) ?? this.selectedRowCache.get(key);
      if (row !== undefined) {
        rows.push(row);
      }
    }
    return rows;
  });

  /** Lignes sélectionnées, pour un menu contextuel qui agit sur la sélection (selectedRows dans son contexte). */
  readonly contextSelectedRows = computed<readonly T[]>(() => {
    this.table.data.dataVersion();
    const keys = this.selectedKeysSet();
    if (!this.table.rowSelectionEnabled() || keys.size === 0) {
      return [];
    }
    return this.table.dataMode() === 'local'
      ? [...keys].map((key) => this.table.data.syncedStore().get(key)).filter((row): row is T => row !== undefined)
      : this.table.paging.displayedRows().filter((row) => keys.has(this.table.data.rowKey(row)));
  });

  /** La barre est visible : une sélection non vide qui satisfait la règle d'affichage. */
  readonly selectionBarVisible = computed(() => {
    if (!this.table.selectionBar() || !this.table.rowSelectionEnabled() || this.selectedRowsCount() === 0) {
      return false;
    }
    const rule = this.table.selectionBarWhen();
    if (!rule) {
      return true;
    }
    try {
      return rule(this.selectedRowsList());
    } catch {
      return false;
    }
  });

  private readonly resolvedSelectionActions = computed(() => resolveSelectionActions(this.table.selectionActions(), this.selectedRowsList()));
  readonly shownSelectionActions = computed(() => this.resolvedSelectionActions().slice(0, Math.max(1, this.table.selectionBarMaxActions())));
  readonly moreSelectionActions = computed(() => this.resolvedSelectionActions().slice(Math.max(1, this.table.selectionBarMaxActions())));

  readonly selectionCountLabel = computed(() => {
    const labels = this.table.effectiveLabels();
    const count = this.selectedRowsCount();
    return count === 1 ? labels.selectionCountOne : labels.selectionCountMany;
  });

  /** « Tout sélectionner » : proposé tant que des lignes filtrées ne sont pas sélectionnées (mode local). */
  readonly selectableTotal = computed(() => (this.table.dataMode() === 'local' ? this.table.data.filteredSortedRows().length : 0));

  readonly selectionContext = computed<NgTableSelectionBarContext<T>>(() => ({
    $implicit: this.selectedRowsList(),
    rows: this.selectedRowsList(),
    count: this.selectedRowsCount(),
    clear: () => this.clearSelection(),
  }));

  onSelectionAction(item: ResolvedSelectionAction<T>): void {
    if (!item.enabled) {
      return;
    }
    const rows = [...this.selectedRowsList()];
    item.action.run?.(rows);
    this.table.selectionAction.emit({action: item.action, rows});
  }

  private selectionBarReturn: HTMLElement | null = null;

  private selectionBarItems(bar: HTMLElement): HTMLElement[] {
    return Array.from(bar.querySelectorAll<HTMLElement>('button, a[href], input, select, [tabindex]:not([tabindex="-1"])')).filter(
      (item) => !item.hasAttribute('disabled') && !item.closest('[role="menu"]'),
    );
  }

  /** F6 depuis la table : le focus passe à la barre d'actions de sélection (sinon elle n'est atteinte qu'en tabulant jusqu'au bout). */
  onSelectionBarShortcut(event: KeyboardEvent): void {
    if (event.key !== 'F6' || event.ctrlKey || event.altKey || event.metaKey || !this.selectionBarVisible()) {
      return;
    }
    const bar = this.table.hostElement.nativeElement.querySelector<HTMLElement>('.ngt-action-bar');
    const first = bar ? this.selectionBarItems(bar)[0] : undefined;
    if (!first) {
      return;
    }
    event.preventDefault();
    this.selectionBarReturn = event.target instanceof HTMLElement ? event.target : null;
    first.focus();
  }

  /**
   * Dans la barre d'actions (motif « toolbar ») : les flèches, Début et Fin passent d'un bouton à l'autre, F6 rend
   * le focus à la table. Tab continue de parcourir les boutons : la barre peut contenir un gabarit de l'application.
   */
  onSelectionBarKeydown(event: KeyboardEvent): void {
    const bar = event.currentTarget as HTMLElement;
    const target = event.target as HTMLElement;
    if (event.key === 'F6') {
      event.preventDefault();
      (this.selectionBarReturn?.isConnected ? this.selectionBarReturn : this.table.focus.focusFallback(''))?.focus();
      return;
    }
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key) || target.closest('input, select, textarea, [contenteditable], [role="menu"]')) {
      return;
    }
    const items = this.selectionBarItems(bar);
    const index = items.indexOf(target);
    if (index === -1 || items.length < 2) {
      return;
    }
    const forward = (event.key === 'ArrowRight') !== (getComputedStyle(bar).direction === 'rtl');
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (forward ? 1 : -1) + items.length) % items.length;
    event.preventDefault();
    items[next].focus();
  }

  /** Voir `NgTableComponent.clearSelection`. */
  clearSelection(): void {
    if (this.selectedKeysSet().size === 0) {
      return;
    }
    this.selectedRowCache.clear();
    this.commitSelection(new Set(), null, false);
    this.table.announce([this.table.effectiveLabels().selectionClear]);
  }

  /** Voir `NgTableComponent.selectAllFiltered`. */
  selectAllFiltered(): void {
    if (this.table.dataMode() !== 'local') {
      return;
    }
    this.commitSelection(new Set(this.table.data.filteredSortedRows().map((row) => this.table.data.rowKey(row))), null, true);
  }

  onToggleRowSelection(event: NgTableCheckboxChange, row: T): void {
    const checked = event.checked;
    const key = this.table.data.rowKey(row);
    const selected = new Set(this.selectedKeysSet());
    if (checked) {
      selected.add(key);
    } else {
      selected.delete(key);
    }
    this.commitSelection(selected, row, checked);
  }

  onToggleAllDisplayedRows(event: NgTableCheckboxChange): void {
    const checked = event.checked;
    const selected = new Set(this.selectedKeysSet());
    const rows = this.table.paging.displayedRows();
    for (const row of rows) {
      const key = this.table.data.rowKey(row);
      if (checked) {
        selected.add(key);
      } else {
        selected.delete(key);
      }
    }
    this.commitSelection(selected, null, checked);
  }

  commitSelection(next: Set<unknown>, row: T | null, selected: boolean): void {
    // Avec la barre d'état, le compte est déjà annoncé par elle : pas de doublon (entendu avec NVDA).
    const labels = this.table.effectiveLabels();
    // Première ligne cochée : on dit aussi comment atteindre la barre d'actions qui vient d'apparaître.
    const hint = next.size > 0 && this.selectedKeysSet().size === 0 && this.table.selectionBar() ? labels.selectionBarHint : '';
    this.table.announce([next.size > 0 && !this.table.statusBar() ? labels.announceRowsSelected.replace('{count}', `${next.size}`) : '', hint]);
    const external = this.table.selectedRowKeys();
    if (!external) {
      this.internalSelectedKeys.set(next);
    }

    const source = this.table.dataMode() === 'local' ? this.table.data.sourceRows() : this.table.remote.blockMode() ? this.table.paging.displayedRows() : this.table.rows();
    const selectedRows = source.filter((item) => next.has(this.table.data.rowKey(item)));
    if (this.table.dataMode() !== 'local') {
      for (const key of [...this.selectedRowCache.keys()]) {
        if (!next.has(key)) {
          this.selectedRowCache.delete(key);
        }
      }
      for (const item of selectedRows) {
        this.selectedRowCache.set(this.table.data.rowKey(item), item);
      }
    }
    this.table.selectionChange.emit({
      row,
      selected,
      selectedKeys: [...next],
      selectedRows,
    });
  }
}
