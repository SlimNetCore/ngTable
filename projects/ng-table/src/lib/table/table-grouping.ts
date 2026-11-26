import {computed, effect, signal, untracked} from '@angular/core';
import {draggedTableColumn, NG_TABLE_COLUMN_DRAG_TYPE} from '../column-drag';
import {
    buildConsecutiveGroups,
    buildGroupTree,
    computeAggregate,
    flattenGroups,
    groupedUnits,
    NgTableGroupRow,
    openGroupHeaders,
    RowGroup,
} from '../row-grouping';
import type {NgTableColumn} from '../ng-table.models';
import {GROUP_LEVELS_JOIN} from './internals';
import type {NgTableComponent} from '../ng-table.component';

/** Type de donnée posé en glissant une puce du panneau de regroupement (réordonner les niveaux). */
const GROUP_LEVEL_DRAG_TYPE = 'application/x-ng-table-group-level';

/** Regroupement de lignes : niveaux, repli, agrégats, panneau de regroupement, en-têtes de groupe collants. */
export class TableGrouping<T> {
  constructor(private readonly table: NgTableComponent<T>) {}

  /** Colonne de regroupement effective (mode local, colonne existante), sinon `null`. */
  readonly groupColumn = computed(() => {
    const id = this.table.groupBy();
    return id ? (this.table.columns().find((column) => column.id === id) ?? null) : null;
  });

  /** Colonnes de regroupement, dans l'ordre des niveaux ; les niveaux supplémentaires ne valent qu'en mode local. */
  readonly groupColumns = computed(() => {
    const first = this.groupColumn();
    if (!first) {
      return [];
    }
    if (this.table.dataMode() === 'remote') {
      return [first];
    }
    const seen = new Set([first.id]);
    const more: NgTableColumn<T>[] = [];
    for (const id of this.table.groupLevels()) {
      const column = this.table.columns().find((candidate) => candidate.id === id);
      if (column && !seen.has(id)) {
        seen.add(id);
        more.push(column);
      }
    }
    return [first, ...more];
  });

  /**
   * En `remote`, replier un groupe demande au serveur d'exclure ses lignes, et la table
   * doit savoir où placer son en-tête : il faut la liste ordonnée des groupes
   * (`[groupSummaries]`). Sans elle, les groupes ne se replient pas.
   */
  readonly groupsCollapsible = computed(() => this.table.dataMode() === 'local' || !!this.table.groupSummaries());

  /** Des lignes se déplient (arbre, ligne détail, groupes) : `aria-expanded` n'est permis sur une ligne que dans un `treegrid`. */
  readonly rowsExpandable = computed(
    () => this.table.tree.treeActive() || !!this.table.detailRowTemplate() || (this.groupColumns().length > 0 && this.groupsCollapsible()),
  );

  /** Résumés serveur par clé de groupe. */
  private readonly summariesByKey = computed(
    () => new Map((this.table.groupSummaries() ?? []).map((summary) => [summary.key, summary] as const)),
  );

  /** Colonnes proposées dans le menu « Grouper ». */
  readonly groupableColumns = computed(() =>
    this.table.columnLayout.columnsMenuItems().filter((column) => column.groupable ?? (!!column.sortable || !!column.filter)),
  );

  /** Dernière colonne de regroupement vue par l'effet de changement (`undefined` avant le premier passage). */
  lastGroupBy: string | null | undefined;

  lastGroupLevels: string | undefined;

  /** Clés des groupes repliés. Vidé quand la colonne de regroupement change. */
  readonly collapsedGroups = signal<ReadonlySet<string>>(new Set());

  private readonly groups = computed(() => {
    const column = this.groupColumn();
    if (!column || this.table.tree.treeActive()) {
      return null;
    }
    if (this.table.dataMode() === 'remote') {
      return buildConsecutiveGroups(this.table.rows(), column);
    }
    const sort = this.table.sorting.sortState();
    const descending = sort.columnId === column.id && sort.direction === 'desc';
    return buildGroupTree(this.table.data.filteredSortedRows(), this.groupColumns(), descending, this.table.collator);
  });

  /** Unités paginées avec regroupement : lignes des groupes dépliés, un élément par groupe replié. */
  readonly groupUnits = computed(() => {
    const groups = this.groups();
    if (!groups) {
      return null;
    }
    return groupedUnits(groups, this.groupsCollapsible() ? this.collapsedGroups() : new Set<string>());
  });

  /** Positions et niveaux des en-têtes de groupe dans la liste affichée (seulement avec `[stickyGroupHeaders]`). */
  private readonly groupHeaderPositions = computed(() => {
    const positions: {index: number; depth: number}[] = [];
    if (!this.table.stickyGroupHeaders() || !this.groupUnits()) {
      return positions;
    }
    const items = this.table.paging.pageItems();
    for (let index = 0; index < items.length; index++) {
      const item = items[index];
      if (item instanceof NgTableGroupRow) {
        positions.push({index, depth: item.depth});
      }
    }
    return positions;
  });

  /**
   * Défilement virtuel : en-têtes du groupe en cours sortis de la tranche rendue. Ils y sont remis en tête, pour que
   * leur ligne existe et reste collée en haut de la zone.
   */
  readonly stickyGroupExtras = computed<NgTableGroupRow<T>[]>(() => {
    const range = this.table.viewport.virtualRange();
    const headers = this.groupHeaderPositions();
    if (!range || headers.length === 0 || this.table.remote.blockMode()) {
      return [];
    }
    const items = this.table.paging.pageItems();
    return openGroupHeaders(headers, range.start).map((index) => items[index] as NgTableGroupRow<T>);
  });

  private readonly stickyGroupExtraSet = computed(() => new Set<unknown>(this.stickyGroupExtras()));

  /** Cet en-tête de groupe est rendu en plus de la tranche (voir `stickyGroupExtras`). */
  isStickyGroupExtra(item: unknown): boolean {
    return this.stickyGroupExtraSet().has(item);
  }

  /** Agrégats de chaque groupe, par colonne (texte prêt à afficher), calculés une fois par changement. */
  /** Agrégats de chaque groupe (texte prêt à afficher), par clé de groupe. */
  private readonly groupAggregates = computed(() => {
    const result = new Map<string, Record<string, string>>();
    const columns = this.table.columns().filter((column) => column.aggregate);
    if (this.table.dataMode() === 'remote') {
      for (const summary of this.table.groupSummaries() ?? []) {
        result.set(summary.key, this.formatAggregates(columns, summary.aggregates ?? {}));
      }
      return result;
    }
    for (const group of flattenGroups(this.groups() ?? [])) {
      result.set(group.key, this.aggregateTexts(columns, group.rows));
    }
    return result;
  });

  private readonly numberFormat = new Intl.NumberFormat(undefined, {maximumFractionDigits: 2});

  /** Le panneau de regroupement survole une colonne glissée : il la prendrait. */
  readonly groupDropOver = signal(false);

  /** Colonnes que le panneau peut encore ajouter (groupables, pas déjà un niveau). */
  readonly addableGroupColumns = computed(() => {
    const used = new Set(this.groupColumns().map((column) => column.id));
    return this.groupableColumns().filter((column) => !used.has(column.id));
  });

  /** Premier niveau de regroupement ; `null` retire tout le regroupement, sous-niveaux compris. */
  setGroupBy(columnId: string | null): void {
    this.table.groupBy.set(columnId);
    if (columnId === null) {
      this.table.groupLevels.set([]);
    }
  }

  /** Ajoute un niveau de regroupement ; en mode `remote` (un seul niveau) la colonne remplace l'actuelle. */
  addGroupLevel(columnId: string): void {
    const ids = this.groupColumns().map((column) => column.id);
    if (ids.includes(columnId)) {
      return;
    }
    this.setGroupColumns(this.table.dataMode() === 'remote' ? [columnId] : [...ids, columnId]);
  }

  removeGroupLevel(index: number): void {
    const ids = this.groupColumns().map((column) => column.id);
    ids.splice(index, 1);
    this.setGroupColumns(ids);
  }

  setGroupColumns(ids: string[]): void {
    this.table.groupBy.set(ids[0] ?? null);
    this.table.groupLevels.set(ids.slice(1));
  }

  /** Colonne d'en-tête glissée en ce moment (ce tableau ou un autre), si elle peut servir au regroupement. */
  private draggedGroupableColumn(): string | null {
    const id = this.table.columnMove.draggingColumnId() ?? draggedTableColumn();
    return id && this.groupableColumns().some((column) => column.id === id) ? id : null;
  }

  onGroupPanelDragOver(event: DragEvent): void {
    if (this.draggedGroupableColumn()) {
      event.preventDefault();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = 'copy';
      }
      this.groupDropOver.set(true);
    }
  }

  onGroupPanelDrop(event: DragEvent): void {
    event.preventDefault();
    this.groupDropOver.set(false);
    const id = this.draggedGroupableColumn() ?? event.dataTransfer?.getData(NG_TABLE_COLUMN_DRAG_TYPE) ?? null;
    if (id && this.groupableColumns().some((column) => column.id === id)) {
      this.addGroupLevel(id);
    }
  }

  onGroupChipDragStart(event: DragEvent, index: number): void {
    event.dataTransfer?.setData(GROUP_LEVEL_DRAG_TYPE, `${index}`);
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
    }
  }

  onGroupChipDragOver(event: DragEvent): void {
    if (event.dataTransfer?.types.includes(GROUP_LEVEL_DRAG_TYPE)) {
      event.preventDefault();
    }
  }

  /** Déplace un niveau sur la place d'un autre (réordonne le regroupement). */
  onGroupChipDrop(event: DragEvent, target: number): void {
    const from = Number(event.dataTransfer?.getData(GROUP_LEVEL_DRAG_TYPE));
    if (!Number.isInteger(from)) {
      return; // une colonne d'en-tête : le panneau s'en charge
    }
    event.preventDefault();
    event.stopPropagation();
    const ids = this.groupColumns().map((column) => column.id);
    if (from < 0 || from >= ids.length || from === target) {
      return;
    }
    const [moved] = ids.splice(from, 1);
    ids.splice(target, 0, moved);
    this.setGroupColumns(ids);
  }

  /** Déplie ou replie un groupe (clic ou Entrée / Espace sur son en-tête). */
  toggleGroup(group: RowGroup<T>): void {
    if (!this.groupsCollapsible()) {
      return;
    }
    const next = new Set(this.collapsedGroups());
    if (!next.delete(group.key)) {
      next.add(group.key);
    }
    this.setCollapsedGroups(next);
  }

  /** Voir `NgTableComponent.collapseAllGroups`. */
  collapseAllGroups(): void {
    const keys = this.table.dataMode() === 'remote'
      ? (this.table.groupSummaries() ?? []).map((summary) => summary.key)
      : (this.groups() ?? []).map((group) => group.key);
    this.setCollapsedGroups(new Set(keys));
    this.table.announce([this.table.effectiveLabels().announceAllCollapsed]);
  }

  /** Voir `NgTableComponent.expandAllGroups`. */
  expandAllGroups(): void {
    this.setCollapsedGroups(new Set());
    this.table.announce([this.table.effectiveLabels().announceAllExpanded]);
  }

  /**
   * En remote, replier / déplier change les lignes à charger : nouvelle requête, même page,
   * ramenée à la nouvelle dernière page si le repli l'a fait disparaître (le nouveau total
   * se déduit des comptes de `[groupSummaries]`).
   */
  private setCollapsedGroups(keys: ReadonlySet<string>): void {
    this.collapsedGroups.set(keys);
    if (this.table.dataMode() !== 'remote' || !this.groupsCollapsible()) {
      return;
    }
    const size = this.table.pageSize();
    if (this.table.paging.pagingActive() && size > 0) {
      const expandedRows = (this.table.groupSummaries() ?? []).reduce(
        (total, summary) => total + (keys.has(summary.key) ? 0 : (summary.count ?? 0)),
        0,
      );
      const lastPage = Math.max(0, Math.ceil(expandedRows / size) - 1);
      if (this.table.pageIndex() > lastPage) {
        this.table.pageIndex.set(lastPage);
      }
    }
    this.table.query.emitRemoteQuery(this.table.query.buildRemoteQuery(this.table.pageIndex(), size));
  }

  /** Libellé de la valeur d'un groupe : libellé d'option du filtre s'il existe, sinon la valeur. */
  groupValueLabel(group: RowGroup<T>): string {
    const key = group.rawKey ?? group.key;
    if (key === '') {
      return this.table.effectiveLabels().groupEmpty;
    }
    const column = group.column ?? this.groupColumn();
    const options = column?.filter ? this.table.filtering.resolvedFilterOptions(column.id, column.filter) : [];
    return options.find((option) => option.value === key)?.label ?? key;
  }

  /** Nombre de lignes du groupe ; `''` en remote sans résumé serveur (un compte de page tromperait). */
  groupCountLabel(group: RowGroup<T>): string {
    const count = this.table.dataMode() === 'remote' ? this.summariesByKey().get(group.key)?.count : group.rows.length;
    return count === undefined ? '' : this.table.effectiveLabels().groupCount.replace('{count}', `${count}`);
  }

  groupAggregate(group: RowGroup<T>, columnId: string): string {
    return this.groupAggregates().get(group.key)?.[columnId] ?? '';
  }

  private aggregateTexts(columns: NgTableColumn<T>[], rows: readonly T[]): Record<string, string> {
    return this.formatAggregates(columns, Object.fromEntries(columns.map((column) => [column.id, computeAggregate(column, rows)])));
  }

  /** Texte affiché d'agrégats (calculés ici ou fournis par le serveur) : préfixe du type + nombre formaté. */
  formatAggregates(columns: NgTableColumn<T>[], values: Record<string, unknown>): Record<string, string> {
    const labels = this.table.effectiveLabels();
    const prefixes = {sum: labels.aggregateSum, avg: labels.aggregateAvg, min: labels.aggregateMin, max: labels.aggregateMax, count: labels.aggregateCount};
    const texts: Record<string, string> = {};
    for (const column of columns) {
      const value = values[column.id];
      if (value === null || value === undefined) {
        continue;
      }
      const formatted = typeof value === 'number' ? this.numberFormat.format(value) : `${value}`;
      const prefix = typeof column.aggregate === 'string' ? prefixes[column.aggregate] : '';
      texts[column.id] = prefix ? `${prefix} ${formatted}` : formatted;
    }
    return texts;
  }

  /** Déplie tout et revient en première page quand le regroupement change. */
  resetOnGroupingChange(): void {
    // Changer de colonne de regroupement déplie tout et revient en page 0 (pas au
    // premier passage : la page peut venir d'une URL ou d'une vue restaurée).
    effect(() => {
      const current = this.table.groupBy();
      const levels = this.table.groupLevels().join(GROUP_LEVELS_JOIN);
      untracked(() => {
        const previousGroupBy = this.lastGroupBy;
        const levelsChanged = this.lastGroupLevels !== undefined && levels !== this.lastGroupLevels;
        this.lastGroupLevels = levels;
        if ((previousGroupBy !== undefined && current !== previousGroupBy) || levelsChanged) {
          this.collapsedGroups.set(new Set());
          if (this.table.dataMode() === 'remote') {
            this.table.query.onQueryStateChanged(); // le serveur doit renvoyer les lignes triées par groupe
          } else if (this.table.paging.pagingActive() && this.table.pageIndex() !== 0) {
            this.table.pageIndex.set(0);
          }
        }
        this.lastGroupBy = current;
      });
    });
  }
}
