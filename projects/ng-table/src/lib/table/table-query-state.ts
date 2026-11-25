import {effect, untracked} from '@angular/core';
import {sanitizeFilterGroup} from '../advanced-filter';
import type {NgTableQueryState, NgTableRemoteQuery} from '../ng-table.models';
import {GLOBAL_SEARCH_KEY, GROUP_LEVELS_JOIN} from './internals';
import type {NgTableComponent} from '../ng-table.component';

/** État de requête : lecture, application, émission vers le parent et vers le serveur. */
export class TableQueryState<T> {
  constructor(private readonly table: NgTableComponent<T>) {}

  private lastCountAnnounced = '';

  /** Voir `NgTableComponent.getQueryState`. */
  getQueryState(): NgTableQueryState {
    const filters: Record<string, string> = {};
    for (const [columnId, value] of Object.entries(this.table.filtering.columnFilters())) {
      if (value.trim()) {
        filters[columnId] = value;
      }
    }
    return {
      sorts: this.table.sorting.sortStates().map((sort) => ({...sort})),
      filters,
      search: this.table.filtering.globalSearchTerm(),
      pageIndex: this.table.pageIndex(),
      pageSize: this.table.pageSize(),
      groupBy: this.table.grouping.groupColumn()?.id ?? null,
      ...(this.table.grouping.groupColumns().length > 1 ? {groupLevels: this.table.grouping.groupColumns().slice(1).map((column) => column.id)} : {}),
      collapsedGroups: [...this.table.grouping.collapsedGroups()],
      ...(this.table.advancedFilter() ? {advancedFilter: this.table.advancedFilter()} : {}),
    };
  }

  /** Voir `NgTableComponent.applyQueryState`. */
  applyQueryState(state: Partial<NgTableQueryState>): void {
    const previousPrimary = this.table.sorting.sortState();
    if (state.sorts) {
      const sorts = state.sorts.filter((sort) => sort.columnId && sort.direction).map((sort) => ({...sort}));
      this.table.sorting.sortStates.set(this.table.multiSort() ? sorts : sorts.slice(0, 1));
      const primary = this.table.sorting.sortState();
      if (primary.columnId !== previousPrimary.columnId || primary.direction !== previousPrimary.direction) {
        this.table.sortChange.emit(primary);
      }
      this.table.sortsChange.emit(this.table.sorting.sortStates());
    }
    if (state.filters) {
      for (const column of this.table.columns()) {
        this.table.filtering.bumpFilterEpoch(column.id);
      }
      const cleared = Object.fromEntries(Object.keys(this.table.filtering.columnFilters()).map((id) => [id, '']));
      this.table.filtering.columnFilters.set(this.table.filtering.withDefaultFilterKeys({...cleared, ...state.filters}));
      this.table.filtersChange.emit(this.table.filtering.columnFilters());
    }
    if (state.search !== undefined) {
      this.table.filtering.bumpFilterEpoch(GLOBAL_SEARCH_KEY);
      this.table.filtering.globalSearchDraft.set(state.search);
      if (state.search !== this.table.filtering.globalSearchTerm()) {
        this.table.filtering.globalSearchTerm.set(state.search);
        this.table.globalSearchChange.emit(state.search);
      }
    }
    if (state.groupBy !== undefined) {
      // Mémorisé avant l'effet de changement de colonne, pour qu'il ne relance ni ne vide rien.
      this.table.grouping.lastGroupBy = state.groupBy;
      this.table.groupBy.set(state.groupBy);
      this.table.grouping.collapsedGroups.set(new Set());
    }
    if (state.groupLevels !== undefined) {
      this.table.grouping.lastGroupLevels = state.groupLevels.join(GROUP_LEVELS_JOIN);
      this.table.groupLevels.set([...state.groupLevels]);
    }
    if (state.collapsedGroups) {
      this.table.grouping.collapsedGroups.set(new Set(state.collapsedGroups));
    }
    if (state.pageSize !== undefined) {
      this.table.pageSize.set(state.pageSize);
    }
    if (state.advancedFilter !== undefined) {
      this.table.filtering.setAdvancedFilterSilently(sanitizeFilterGroup(state.advancedFilter));
    }
    const queryChanged =
      !!state.sorts || !!state.filters || state.search !== undefined || state.groupBy !== undefined || state.advancedFilter !== undefined;
    if (state.pageIndex !== undefined) {
      this.table.pageIndex.set(state.pageIndex);
    } else if (queryChanged && this.table.paging.pagingActive()) {
      this.table.pageIndex.set(0);
    }
    if (this.table.dataMode() === 'remote') {
      this.emitRemoteQuery(this.buildRemoteQuery(this.table.pageIndex(), this.table.pageSize()));
    }
  }

  /**
   * Reports a sort/filter change: emits the full combined query in `remote` mode
   * (page reset to `0`), or requests a page reset in paginated `local` mode.
   */
  onQueryStateChanged(sortMessage = ''): void {
    if (this.table.dataMode() === 'remote') {
      // Nombre de lignes inconnu tant que le serveur n'a pas répondu : on annonce le tri, ou que la demande est partie.
      this.table.announce([sortMessage || this.table.effectiveLabels().announceRemoteQuery]);
      // Paginateur intégré : il doit refléter la page 0 demandée au serveur. Sans lui,
      // la page reste l'affaire du parent (comportement historique, aucun événement).
      if (this.table.paginator() && this.table.pageIndex() !== 0) {
        this.table.pageIndex.set(0);
      }
      this.emitRemoteQuery(this.buildRemoteQuery(0, this.table.pageSize()));
      return;
    }
    const count = this.table.data.filteredSortedRows().length;
    const labels = this.table.effectiveLabels();
    const countMessage = count === 0 ? labels.announceNoRows : labels.announceRowCount.replace('{count}', `${count}`);
    // Pendant la saisie d'une recherche, le même compte n'est pas redit à chaque lettre. Ailleurs (autre filtre, même
    // résultat), il est redit : sans cela, l'utilisateur ne saurait pas que son action a été prise en compte.
    if (sortMessage || !this.table.quietRepeat || countMessage !== this.lastCountAnnounced) {
      this.table.announce([sortMessage, countMessage]);
    }
    this.lastCountAnnounced = countMessage;
    if (this.table.paging.pagingActive() && this.table.pageIndex() !== 0) {
      this.table.pageIndex.set(0); // émet (pageIndexChange)
    }
  }

  /**
   * La requête serveur a changé (tri, filtres, recherche, page...). En modèle par blocs,
   * le cache repart de zéro et les blocs visibles sont redemandés ; sinon, le parent est
   * prévenu par `(remoteQueryChange)`.
   */
  emitRemoteQuery(query: NgTableRemoteQuery): void {
    if (this.table.remote.blockMode()) {
      this.table.remote.resetBlocks(false);
      return;
    }
    this.table.remoteQueryChange.emit(query);
  }

  /** `page.size` vaut `0` quand la pagination n'est pas suivie (= tout). */
  buildRemoteQuery(pageIndex: number, pageSize: number): NgTableRemoteQuery {
    return {
      sort: this.table.sorting.sortState(),
      sorts: this.table.sorting.sortStates(),
      filters: this.table.filtering.columnFilters(),
      page: {index: pageIndex, size: this.table.paging.pagingActive() ? pageSize : 0},
      search: this.table.filtering.globalSearchTerm(),
      // Présent seulement quand il y a un filtre avancé : la requête garde sa forme d'avant pour les autres.
      ...(this.table.advancedFilter() ? {advancedFilter: this.table.advancedFilter()} : {}),
      groupBy: this.table.grouping.groupColumn()?.id ?? null,
      collapsedGroups: this.table.grouping.groupColumn() && this.table.grouping.groupsCollapsible() ? [...this.table.grouping.collapsedGroups()] : [],
    };
  }

  /** Émet `(queryStateChange)`, d'un seul endroit, quelle que soit l'origine du changement. */
  reportStateChanges(): void {
    // Un seul point d'émission de `queryStateChange`, quelle que soit l'origine du
    // changement (clic, vue, paginateur, applyQueryState...). Émis une fois au démarrage.
    effect(() => {
      const state = this.getQueryState();
      untracked(() => this.table.queryStateChange.emit(state));
    });
  }
}
