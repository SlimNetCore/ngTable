import {computed, TrackByFunction} from '@angular/core';
import {NgTableValueRange, valueRange} from '../cell-format';
import {highlightParts, NgTableTextPart} from '../search-highlight';
import {computeAggregate, NgTableGroupRow} from '../row-grouping';
import {NgTableSpacerRow} from '../virtual-window';
import {buildCellView, buildRowViews, EMPTY_CELL_VIEW, NgTableCellView, NgTableRowClasses} from '../row-view';
import {NgTableLoadingRow} from '../block-cache';
import {searchTerms} from '../filter-matching';
import type {NgTableColumn} from '../ng-table.models';
import {defaultRowKey, isDataItem, TableItem} from './internals';
import type {NgTableComponent} from '../ng-table.component';

/** Ligne de l'application (ni en-tête de groupe, ni espacement du défilement virtuel). */
/** Valeur d'une colonne d'espacement (virtualisation horizontale) : elle n'a rien à afficher. */
const SPACER_ACCESSOR = (): null => null;

/** Une cellule à rendre dans chaque ligne : sa colonne, ses classes et, si elle est figée, son décalage. */
interface RenderCell<T> {
  id: string;
  column: NgTableColumn<T>;
  /** Colonne d'espacement de la virtualisation horizontale, sinon `null`. */
  spacer: 'left' | 'right' | null;
  /** Classes d'une cellule du corps (`cdk-column-…`, plus celles d'une colonne figée). */
  cls: string;
  /** Classes d'une cellule d'en-tête collant, de ligne de totaux collante, d'en-tête de groupe. */
  headCls: string;
  footCls: string;
  groupCls: string;
  /** Décalage d'une colonne figée au début / à la fin (px), `null` sinon. */
  start: number | null;
  end: number | null;
}

/** Rendu : lignes et cellules à afficher, totaux, mise en forme et surlignage. */
export class TableRender<T> {
  constructor(private readonly table: NgTableComponent<T>) {}

  /** Ligne « paire » des lignes alternées (`[striped]`) : d'après son rang dans la liste, pas dans le document. */
  isAltRow(row: T): boolean {
    return this.table.striped() && (this.table.aria.renderedRowIndexes().get(row) ?? 0) % 2 === 1;
  }

  /** Lignes épinglées : côté et rang (depuis le bord le plus proche) de chacune. */
  readonly pinnedInfo = computed(() => {
    const info = new Map<T, { side: 'top' | 'bottom'; index: number; edge: boolean }>();
    const top = this.table.pinnedTopRows();
    top.forEach((row, index) => info.set(row, {side: 'top', index, edge: index === top.length - 1}));
    const bottom = this.table.pinnedBottomRows();
    bottom.forEach((row, index) => info.set(row, {side: 'bottom', index: bottom.length - 1 - index, edge: index === 0}));
    return info;
  });

  pinInfo(row: T): { side: 'top' | 'bottom'; index: number; edge: boolean } | undefined {
    return this.pinnedInfo().get(row);
  }

  /** Source de données de la table : lignes épinglées autour du corps (page ou tranche virtuelle). */
  readonly tableRows = computed<TableItem<T>[]>(() => {
    const top = this.table.pinnedTopRows();
    const bottom = this.table.pinnedBottomRows();
    const body = this.bodyRows();
    return top.length === 0 && bottom.length === 0 ? body : [...top, ...body, ...bottom];
  });

  /** Corps de la table : éléments de la page, fenêtrés en défilement virtuel. */
  readonly bodyRows = computed<TableItem<T>[]>(() => {
    const range = this.table.viewport.virtualRange();
    if (this.table.remote.blockMode() && range) {
      this.table.remote.blockVersion();
      const items: TableItem<T>[] = [new NgTableSpacerRow('top', 0)];
      for (let index = range.start; index < range.end; index++) {
        items.push(this.table.remote.blockCache.rowAt(index) ?? new NgTableLoadingRow(index));
      }
      items.push(new NgTableSpacerRow('bottom', 0));
      return items;
    }
    const items = this.table.paging.pageItems();
    if (!range) {
      return items;
    }
    return [new NgTableSpacerRow('top', 0), ...this.table.grouping.stickyGroupExtras(), ...items.slice(range.start, range.end), new NgTableSpacerRow('bottom', 0)];
  });

  /**
   * Valeurs, textes et classes des lignes rendues (page ou tranche virtuelle), pour les
   * colonnes visibles, calculés une fois par changement : une détection de changements
   * sans rapport avec les données ne rappelle ni `valueAccessor` ni `rowClassFn`.
   */
  readonly rowViews = computed(() =>
    buildRowViews(
      this.tableRows().filter((item): item is T => isDataItem(item)),
      this.table.columnLayout.renderedColumns(),
      this.table.rowClassFn(),
      this.table.live.flashes.size > 0 ? this.table.live.flashClassFn(performance.now()) : null,
    ),
  );

  /** Ligne de totaux (mode local) : agrégats sur toutes les lignes filtrées. */
  readonly totals = computed(() => {
    if (!this.table.showTotals() || this.table.dataMode() !== 'local') {
      return null;
    }
    const columns = this.table.columns().filter((column) => column.aggregate);
    if (columns.length === 0) {
      return null;
    }
    const rows = this.table.data.filteredSortedRows();
    const values: Record<string, unknown> = {};
    for (const column of columns) {
      const running = column.aggregate === 'sum' || column.aggregate === 'avg' ? this.table.data.pipeline.total(column.id) : undefined;
      if (running) {
        values[column.id] = running.count === 0 ? null : column.aggregate === 'sum' ? running.sum : running.sum / running.count;
      } else {
        values[column.id] = computeAggregate(column, rows); // min, max, nombre, agrégat personnalisé
      }
    }
    return this.table.grouping.formatAggregates(columns, values);
  });

  /** Colonne qui porte le libellé d'un en-tête de groupe / de la ligne de totaux : la première affichée. */
  readonly leadColumnId = computed(() => this.table.columnLayout.renderedColumns()[0]?.id ?? null);

  private readonly mobileActionsColumnId = '__mobile_actions__';

  private readonly mobileActionRowColumns = computed(() => {
    if (!this.table.columnLayout.isMobileView()) {
      return [] as string[];
    }
    return this.table.columnLayout.actionColumn() ? [this.mobileActionsColumnId] : [];
  });

  private cellValue(row: T, column: NgTableColumn<T>): unknown {
    return column.valueAccessor(row);
  }

  /** Valeur, texte, texte copié et contexte de template d'une cellule (mis en cache). */
  /**
   * Colonnes dont la cellule n'est qu'un texte sur une ligne : ni gabarit, ni mise en forme, ni édition, ni copie, ni
   * arbre. Le gabarit leur réserve un chemin court.
   */
  readonly plainColumnIds = computed(() => {
    const ids = new Set<string>();
    if (this.table.fillHandle()) {
      return ids; // la poignée de recopie peut se poser sur n'importe quelle cellule
    }
    const lead = this.table.tree.treeActive() ? this.leadColumnId() : null;
    for (const column of this.table.columns()) {
      if (!column.sparkline && !column.cellTemplate && !column.cell && !column.editable && !column.copy && column.textOverflow !== 'wrap' && column.id !== lead) {
        ids.add(column.id);
      }
    }
    return ids;
  });

  // La table est rendue par des `@for` (une ligne, une cellule), sans `CdkTable`. Mesuré : le CDK relançait ses
  // requêtes de contenu et recalculait les styles des colonnes figées à chaque ligne créée (environ 16 % du script
  // d'un défilement). Les classes `cdk-*` sont gardées pour les feuilles de style et les tests des applications.

  private readonly columnCssClasses = new Map<string, string>();

  /** Classe `cdk-column-<id>` d'une colonne (mêmes remplacements de caractères que le CDK). */
  private columnCssClass(id: string): string {
    let cls = this.columnCssClasses.get(id);
    if (cls === undefined) {
      cls = `cdk-column-${id.replace(/[^a-z0-9_-]/gi, '-')}`;
      this.columnCssClasses.set(id, cls);
    }
    return cls;
  }

  private readonly spacerDataColumns = {
    left: {id: '__colspacer_left__', header: '', valueAccessor: SPACER_ACCESSOR} as NgTableColumn<T>,
    right: {id: '__colspacer_right__', header: '', valueAccessor: SPACER_ACCESSOR} as NgTableColumn<T>,
  };

  private renderCell(id: string, column: NgTableColumn<T>, spacer: 'left' | 'right' | null): RenderCell<T> {
    const sticky = this.table.sticky.stickyCells().get(id);
    const stickyCls = sticky
      ? ` cdk-table-sticky ngt-sticky-col${sticky.edge ? (sticky.side === 'start' ? ' ngt-sticky-edge-start' : ' ngt-sticky-edge-end') : ''}`
      : '';
    const base = this.columnCssClass(id) + (spacer ? ' col-spacer-cell' : '');
    return {
      id,
      column,
      spacer,
      cls: base + stickyCls,
      headCls: `${base}${stickyCls} cdk-table-sticky cdk-table-sticky-border-elem-top`,
      footCls: `${base}${stickyCls} cdk-table-sticky cdk-table-sticky-border-elem-bottom`,
      groupCls: this.columnCssClass(`__group__${id}`) + (spacer ? ' col-spacer-cell' : '') + stickyCls,
      start: sticky?.side === 'start' ? sticky.offset : null,
      end: sticky?.side === 'end' ? sticky.offset : null,
    };
  }

  /** Cellules des colonnes de données (et d'espacement) de chaque ligne, dans l'ordre affiché. */
  readonly dataCells = computed<RenderCell<T>[]>(() => {
    const byId = new Map(this.table.columns().map((column) => [column.id, column] as const));
    const cells: RenderCell<T>[] = [];
    for (const id of this.table.columnLayout.displayedColumnIds()) {
      if (id === '__colspacer_left__' || id === '__colspacer_right__') {
        const side = id === '__colspacer_left__' ? 'left' : 'right';
        cells.push(this.renderCell(id, this.spacerDataColumns[side], side));
        continue;
      }
      const column = byId.get(id);
      if (column) {
        cells.push(this.renderCell(id, column, null));
      }
    }
    return cells;
  });

  /** Cellules de tête (déplacement, détail, sélection), présentes ou non selon les options et l'écran. */
  readonly leadCells = computed(() => {
    const ids = this.table.columnLayout.displayedColumnIds();
    const lead = (id: string): RenderCell<T> | null => (ids.includes(id) ? this.renderCell(id, this.spacerDataColumns.left, null) : null);
    return {drag: lead(this.table.columnLayout.rowDragColumnId), toggle: lead(this.table.columnLayout.detailToggleColumnId), selection: lead(this.table.columnLayout.selectionColumnId)};
  });

  /** Classes et décalage d'un en-tête groupé : ceux de sa première colonne (figée au début) ou de sa dernière (à la fin). */
  headerRunCell(level: {runs: {key: string; span: number; pin?: 'left' | 'right'}[]}, runIndex: number): {cls: string; headCls: string; start: number | null; end: number | null} {
    const run = level.runs[runIndex];
    const base = this.columnCssClass(run.key);
    if (!run.pin) {
      return {cls: base, headCls: `${base} cdk-table-sticky`, start: null, end: null};
    }
    let first = 0;
    for (let i = 0; i < runIndex; i++) {
      first += level.runs[i].span;
    }
    const ids = this.table.columnLayout.displayedColumnIds();
    const sticky = this.table.sticky.stickyCells().get(run.pin === 'left' ? ids[first] : ids[first + run.span - 1]);
    const cls = `${base} cdk-table-sticky ngt-sticky-col`;
    return {cls, headCls: cls, start: sticky?.side === 'start' ? sticky.offset : null, end: sticky?.side === 'end' ? sticky.offset : null};
  }

  asDataRow(item: TableItem<T>): T {
    return item as T;
  }

  asGroupRow(item: TableItem<T>): NgTableGroupRow<T> {
    return item as NgTableGroupRow<T>;
  }

  asSpacerRow(item: TableItem<T>): NgTableSpacerRow {
    return item as NgTableSpacerRow;
  }

  asLoadingRow(item: TableItem<T>): NgTableLoadingRow {
    return item as NgTableLoadingRow;
  }

  cellView(row: T, column: NgTableColumn<T>): NgTableCellView<T> {
    if (column.valueAccessor === SPACER_ACCESSOR) {
      return EMPTY_CELL_VIEW as NgTableCellView<T>;
    }
    return this.rowViews().get(row)?.cells.get(column.id) ?? buildCellView(row, column);
  }

  onRowClick(row: T): void {
    this.table.rowClick.emit(row);
    if (this.table.detail.isUncontrolledDetailMode() && this.table.detailRowToggleOnRowClick()) {
      this.table.detail.toggleDetail(row);
    }
  }

  /** A row is a keyboard focus stop only when it actually does something — no needless tab stops otherwise. */
  isRowInteractive(): boolean {
    return this.table.rowActivatable() || !!this.table.detailRowTemplate() || (this.table.rowContextMenuEnabled() && !!this.table.rowContextMenuTemplate());
  }

  rowClasses(row: T): NgTableRowClasses {
    return this.rowViews().get(row)?.classes ?? this.table.rowClassFn()?.(row) ?? '';
  }

  private trackByRow = (index: number, row: T): unknown => {
    const keyAccessor = this.table.rowKeyAccessor();
    if (keyAccessor) {
      return keyAccessor(row);
    }
    const externalTrackBy = this.table.rowTrackBy();
    if (externalTrackBy) {
      return externalTrackBy(index, row);
    }
    // Jamais l'index en dernier recours : il change au tri/filtre/pagination,
    // ce qui ferait réutiliser la vue (et la case à cocher) d'une ligne pour
    // une autre — voir `rowKey()` pour la même règle côté sélection.
    return defaultRowKey(row);
  };

  resolvedTrackBy: TrackByFunction<TableItem<T>> = (index: number, row: TableItem<T>): unknown => {
    if (row instanceof NgTableSpacerRow) {
      return `__spacer__${row.position}`;
    }
    // Réutilisation des lignes : l'identité d'une ligne rendue est son emplacement, pas la ligne elle-même.
    if (this.table.reuse.rowReuseActive()) {
      const slots = this.table.reuse.rowSlots();
      const position = row instanceof NgTableLoadingRow ? row.index : this.table.remote.blockMode() ? this.table.remote.blockRowIndex(row) : this.table.reuse.rowSlotIndexes().get(row);
      const slot = position === undefined ? undefined : slots.get(position);
      const cacheable = typeof row === 'object' && row !== null;
      if (slot !== undefined) {
        if (cacheable) {
          this.table.reuse.rowSlotOfItem.set(row as object, slot);
        }
        return slot;
      }
      // Angular redemande l'identité des lignes DÉJÀ rendues au moment de comparer : un élément sorti de la tranche
      // n'a plus d'emplacement, mais il doit répondre celui qu'il occupait, sinon aucune ligne ne serait reprise.
      const former = cacheable ? this.table.reuse.rowSlotOfItem.get(row as object) : undefined;
      if (former !== undefined) {
        return former;
      }
    }
    if (row instanceof NgTableGroupRow) {
      return `__group__${row.group.key}`;
    }
    if (row instanceof NgTableLoadingRow) {
      return `__loading__${row.index}`;
    }
    const pin = this.pinnedInfo().get(row);
    if (pin) {
      return `__pinned_${pin.side}__${pin.index}`; // clé propre : une ligne épinglée peut ressembler à une ligne du corps
    }
    return this.trackByRow(index, row);
  };

  mobileActionsRowWhen = (_: number, row: TableItem<T>): boolean =>
    isDataItem(row) && this.mobileActionRowColumns().length > 0;

  groupRowWhen = (_: number, row: TableItem<T>): boolean => row instanceof NgTableGroupRow;
  spacerRowWhen = (_: number, row: TableItem<T>): boolean => row instanceof NgTableSpacerRow;
  loadingRowWhen = (_: number, row: TableItem<T>): boolean => row instanceof NgTableLoadingRow;

  /**
   * Étendue (minimum, maximum) des colonnes en barre de données ou en dégradé sans bornes fixes : mesurée sur les
   * lignes filtrées en mode local, sur les lignes reçues en mode `remote`. Recalculée quand ces lignes changent.
   */
  private readonly cellFormatRanges = computed(() => {
    const ranges = new Map<string, NgTableValueRange | null>();
    const columns = this.table.columns().filter(
      (column) =>
        (column.cell?.type === 'dataBar' || column.cell?.type === 'colorScale') && (column.cell.min === undefined || column.cell.max === undefined),
    );
    if (columns.length === 0) {
      return ranges;
    }
    const rows = this.table.dataMode() === 'local' ? this.table.data.filteredSortedRows() : this.table.rows();
    for (const column of columns) {
      const accessor = column.valueAccessor;
      ranges.set(column.id, valueRange({[Symbol.iterator]: function* () { for (const row of rows) { yield accessor(row); } }}));
    }
    return ranges;
  });

  cellFormatRange(column: NgTableColumn<T>): NgTableValueRange | null {
    return this.cellFormatRanges().get(column.id) ?? null;
  }

  /** Mots de la recherche globale à surligner dans les cellules (vide : rien à surligner). */
  readonly highlightTerms = computed(() => (this.table.highlightSearch() ? searchTerms(this.table.filtering.globalSearchTerm()) : []));

  /** Découpages déjà faits pour les mots courants : une même valeur (statut, client...) n'est découpée qu'une fois. */
  private readonly highlightCache = computed(() => ({terms: this.highlightTerms(), parts: new Map<string, NgTableTextPart[]>()}));

  highlightParts(text: string): NgTableTextPart[] {
    const cache = this.highlightCache();
    let parts = cache.parts.get(text);
    if (!parts) {
      parts = highlightParts(text, cache.terms);
      if (cache.parts.size < 5000) {
        cache.parts.set(text, parts);
      }
    }
    return parts;
  }

  /** Liste vide alors qu'un filtre ou une recherche est actif : l'état vide propose de les réinitialiser. */
  readonly emptyBecauseFiltered = computed(() => this.table.tree.treeFilterActive());

  /** Message affiché quand la liste est vide — `[emptyLabel]` si fourni, sinon le défaut de `[labels]`. */
  resolvedEmptyLabel(): string {
    return this.table.emptyLabel() ?? this.table.effectiveLabels().noData;
  }

  mobileActionsCellContext(row: T): {
    $implicit: T;
    row: T;
    value: unknown;
    column: NgTableColumn<T>
  } | null {
    const actionColumn = this.table.columnLayout.actionColumn();
    if (!actionColumn) {
      return null;
    }

    return {
      $implicit: row,
      row,
      value: this.cellValue(row, actionColumn),
      column: actionColumn,
    };
  }

  /** Attribut `data-mobile-row-key` de la ligne d'actions mobile. */
  mobileRowKey(row: T): string {
    const key = defaultRowKey(row);
    return key === row ? '' : `${key}`;
  }

  mobileActionsColspan(): number {
    return Math.max(1, this.table.columnLayout.displayedColumnIds().length || 1);
  }
}
