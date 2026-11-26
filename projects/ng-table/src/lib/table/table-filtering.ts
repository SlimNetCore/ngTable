import {computed, effect, signal, untracked} from '@angular/core';
import {takeUntilDestroyed} from '@angular/core/rxjs-interop';
import {NgTableMenuTriggerDirective} from '../ng-table-menu';
import {firstValueFrom, Observable, Subject, timer} from 'rxjs';
import {debounce, groupBy, mergeMap} from 'rxjs/operators';
import {ColumnFilterType} from '../column-filter-renderer.component';
import {NgTableFilterGroup} from '../advanced-filter';
import {distinctSetValues, parseSetFilter, SetFilterValue} from '../set-filter';
import {formatRangeValue} from '../filter-matching';
import type {NgTableColumn, NgTableFilterConfig, NgTableFilterOption} from '../ng-table.models';
import {GLOBAL_SEARCH_KEY} from './internals';
import type {NgTableComponent} from '../ng-table.component';

/** Filtres à choix discret : appliqués immédiatement, jamais debouncés. */
const DISCRETE_FILTER_TYPES: ReadonlySet<ColumnFilterType> = new Set<ColumnFilterType>([
  'enum',
  'set',
  'boolean',
  'date',
  'range',
]);

/** Filtres de colonne, recherche globale et filtre avancé. */
export class TableFiltering<T> {
  constructor(private readonly table: NgTableComponent<T>) {}

  readonly columnFilters = signal<Record<string, string>>({});

  /** Recherche globale appliquée (après debounce). */
  readonly globalSearchTerm = signal('');

  /** Texte du champ de recherche, à jour à chaque frappe (le debounce ne porte que sur l'application). */
  readonly globalSearchDraft = signal('');

  /** Voir `NgTableComponent.activeFilterSummaries`. */
  readonly activeFilterSummaries = computed<{ columnId: string; label: string; value: string }[]>(() => {
    const filters = this.columnFilters();
    const summaries: { columnId: string; label: string; value: string }[] = [];
    const search = this.globalSearchTerm().trim();
    if (search) {
      summaries.push({columnId: GLOBAL_SEARCH_KEY, label: this.table.effectiveLabels().globalSearchLabel, value: search});
    }
    for (const column of this.table.columns()) {
      const rawValue = (filters[column.id] ?? '').trim();
      if (!rawValue) {
        continue;
      }
      summaries.push({
        columnId: column.id,
        label: column.filter?.label ?? column.header,
        value: this.formatFilterValueForDisplay(column, rawValue),
      });
    }
    return summaries;
  });

  private readonly lazyFilterOptions = signal<Record<string, NgTableFilterOption[]>>({});
  private readonly lazyFilterLoading = signal<Record<string, boolean>>({});

  /** `true` = "empty options" error, `false` = no error, a loader error is tracked separately below. */
  private readonly lazyFilterEmptyError = signal<Record<string, boolean>>({});

  private readonly lazyFilterLoadError = signal<Record<string, boolean>>({});

  /**
   * Change le filtre avancé sans que l'effet qui le surveille relance une requête : l'appelant (état appliqué, vue
   * activée) émet lui-même la requête complète, une seule fois.
   */
  setAdvancedFilterSilently(filter: NgTableFilterGroup | null): void {
    if (filter === null && this.table.advancedFilter() === null) {
      return;
    }
    this.advancedFilterApplied = filter;
    this.table.advancedFilter.set(filter);
  }

  /** Dernier filtre avancé pris en compte (`undefined` avant le premier passage de l'effet). */
  private advancedFilterApplied: NgTableFilterGroup | null | undefined = undefined;

  /**
   * Free-typed filter keystrokes flow through here instead of committing straight to
   * `columnFilters`. Grouped by column so typing in one field never resets another
   * field's debounce timer (`groupBy` + `mergeMap` keeps each column's debounce
   * independent), then `debounce` collapses rapid keystrokes into one commit —
   * which in `remote` mode means one request instead of one per character.
   */
  private readonly filterInputSubject = new Subject<{ columnId: string; value: string; epoch: number }>();

  private readonly filterEpochByColumn = new Map<string, number>();
  private readonly activeFilterColumnId = signal<string | null>(null);
  private readonly activeFilterTrigger = signal<NgTableMenuTriggerDirective | null>(null);

  /**
   * `text` filters are free-typed — every keystroke would otherwise re-run local
   * filtering and, in `remote` mode, fire a request per character. Those are
   * debounced (see `filterInputSubject`); discrete selections (select/enum/boolean/
   * date pickers) commit immediately since they're single deliberate actions.
   */
  onFilterValue(columnId: string, value: string): void {
    if (!this.isFreeTypedFilter(columnId)) {
      this.commitFilterValue(columnId, value);
      return;
    }
    this.filterInputSubject.next({columnId, value, epoch: this.filterEpoch(columnId)});
  }

  /** Voir `NgTableComponent.clearFilter`. */
  clearFilter(columnId: string): void {
    if (columnId === GLOBAL_SEARCH_KEY) {
      this.clearGlobalSearch(); // pastille « Recherche » de la barre des filtres actifs
      return;
    }
    this.bumpFilterEpoch(columnId); // supersede any debounced keystroke still in flight for this column
    this.commitFilterValue(columnId, '');
  }

  /** Voir `NgTableComponent.clearAllFilters`. */
  clearAllFilters(): void {
    for (const column of this.table.columns()) {
      this.bumpFilterEpoch(column.id);
    }
    this.bumpFilterEpoch(GLOBAL_SEARCH_KEY);
    this.globalSearchDraft.set('');
    if (this.globalSearchTerm()) {
      this.globalSearchTerm.set('');
      this.table.globalSearchChange.emit('');
    }
    const next: Record<string, string> = {};
    this.columnFilters.set(next);
    this.table.filtersChange.emit(next);
    if (this.table.advancedFilter()) {
      this.advancedFilterApplied = null; // l'effet ne redemandera pas une seconde requête pour ce changement
      this.table.advancedFilter.set(null);
    }
    this.table.query.onQueryStateChanged();
  }

  /** Saisie dans le champ de recherche globale : debouncée comme un filtre texte. */
  onGlobalSearchInput(value: string): void {
    this.globalSearchDraft.set(value);
    this.filterInputSubject.next({columnId: GLOBAL_SEARCH_KEY, value, epoch: this.filterEpoch(GLOBAL_SEARCH_KEY)});
  }

  /** Entrée dans le champ de recherche : applique tout de suite, sans attendre le debounce. */
  applyGlobalSearchNow(): void {
    this.bumpFilterEpoch(GLOBAL_SEARCH_KEY); // la frappe encore en attente devient caduque
    this.commitGlobalSearch(this.globalSearchDraft());
  }

  /** Voir `NgTableComponent.clearGlobalSearch`. */
  clearGlobalSearch(): void {
    this.bumpFilterEpoch(GLOBAL_SEARCH_KEY);
    this.globalSearchDraft.set('');
    this.commitGlobalSearch('');
  }

  commitGlobalSearch(value: string): void {
    if (value === this.globalSearchTerm()) {
      return;
    }
    this.globalSearchTerm.set(value);
    this.table.globalSearchChange.emit(value);
    if (this.table.data.searchCacheTimer !== null) {
      clearTimeout(this.table.data.searchCacheTimer);
      this.table.data.searchCacheTimer = null;
    }
    if (value === '' && typeof window !== 'undefined') {
      this.table.data.searchCacheTimer = setTimeout(() => this.table.data.releaseSearchCache(), 30_000);
    }
    // Recherche en cours de frappe : un compte inchangé n'est pas redit à chaque lettre (entendu avec NVDA).
    this.table.quietRepeat = true;
    this.table.query.onQueryStateChanged();
    this.table.quietRepeat = false;
  }

  isFilterActive(columnId: string): boolean {
    return !!(this.columnFilters()[columnId] ?? '').trim();
  }

  currentFilterValue(columnId: string): string {
    return this.columnFilters()[columnId] ?? '';
  }

  /** Titre du menu de filtre (libellé de la colonne). */
  filterMenuTitle(column: NgTableColumn<T>): string {
    return column.filter?.label ?? column.header ?? '';
  }

  /** `effectiveLabels().filterBy` avec `{field}` remplacé par le libellé de la colonne. */
  filterByAriaLabel(column: NgTableColumn<T>): string {
    const labels = this.table.effectiveLabels();
    return (this.isFilterActive(column.id) ? labels.filterActiveOn : labels.filterBy).replace('{field}', column.header ?? '');
  }

  /** Nom de la croix d'une puce de filtre : avec le champ concerné, pour ne pas avoir dix « Effacer le filtre ». */
  clearFilterLabel(field: string): string {
    return this.table.effectiveLabels().clearFilterOf.replace('{field}', field);
  }

  onFilterMenuOpened(columnId: string, trigger: NgTableMenuTriggerDirective, filter: NgTableFilterConfig): void {
    this.activeFilterColumnId.set(columnId);
    this.activeFilterTrigger.set(trigger);
    this.table.viewport.startScrollTracking();
    void this.ensureLazyFilterOptions(columnId, filter);
    this.requestFilterPositionUpdate();
  }

  onFilterMenuClosed(columnId: string): void {
    if (this.activeFilterColumnId() === columnId) {
      this.activeFilterColumnId.set(null);
      this.activeFilterTrigger.set(null);
      this.table.viewport.stopScrollTracking();
    }
  }

  isFilterOptionsLoading(columnId: string): boolean {
    return this.lazyFilterLoading()[columnId] ?? false;
  }

  shouldRenderInlineFilter(column: NgTableColumn<T>): boolean {
    if (!this.table.inlineFilters() || !column.filter) {
      return false;
    }
    const allowedColumns = this.table.inlineFilterColumnIds();
    if (!allowedColumns || allowedColumns.length === 0) {
      return true;
    }
    return allowedColumns.includes(column.id);
  }

  closeFilterMenuOnEnter(event: Event, trigger: NgTableMenuTriggerDirective): void {
    const target = event.target as HTMLElement | null;
    // Entrée sur un bouton, une liste ou une case du panneau active ce contrôle : seul un champ de saisie valide le filtre.
    if (!target || target.tagName !== 'INPUT' || ['checkbox', 'radio', 'button'].includes((target as HTMLInputElement).type)) {
      return;
    }
    event.stopPropagation();
    // Sans cela, la suite de la frappe (keypress) arrive sur le bouton qui vient de reprendre le focus, et rouvre le menu.
    event.preventDefault();
    queueMicrotask(() => trigger.closeMenu(true)); // le focus revient sur le bouton de filtre (WCAG 2.4.3)
  }

  /** Message d'erreur à afficher pour les options de filtre de cette colonne (vide = pas d'erreur). */
  filterOptionsError(columnId: string): string {
    const labels = this.table.effectiveLabels();
    if (this.lazyFilterLoadError()[columnId]) {
      return labels.refOptionsLoadError;
    }
    if (this.lazyFilterEmptyError()[columnId]) {
      return labels.refOptionsEmpty;
    }
    return '';
  }

  private readonly setValuesCache = new Map<string, {source: readonly T[] | NgTableFilterOption[]; blank: string; result: {values: SetFilterValue[]; truncated: boolean}}>();

  /**
   * Valeurs distinctes d'une colonne pour son filtre `set`, avec leurs effectifs. En mode local elles viennent des
   * lignes (recalculées quand les données changent) ; en mode `remote` la table n'a qu'une page : elles viennent de
   * `filter.options` / `optionsLoader`, sans effectifs.
   */
  setFilterValues(columnId: string, filter: NgTableFilterConfig): readonly SetFilterValue[] {
    if (filter.type !== 'set') {
      return [];
    }
    const blank = this.table.effectiveLabels().blanks;
    const remote = this.table.dataMode() !== 'local';
    const source = remote ? this.resolvedFilterOptions(columnId, filter) : this.table.data.sourceRows();
    const cached = this.setValuesCache.get(columnId);
    if (cached && cached.source === source && cached.blank === blank) {
      return cached.result.values;
    }
    let result: {values: SetFilterValue[]; truncated: boolean};
    if (remote) {
      result = {values: (source as NgTableFilterOption[]).map((option) => ({key: option.value, label: option.label, count: 0})), truncated: false};
    } else {
      const column = untracked(() => this.table.columns()).find((candidate) => candidate.id === columnId);
      result = column ? distinctSetValues(source as readonly T[], column.valueAccessor, this.table.collator, blank) : {values: [], truncated: false};
    }
    this.setValuesCache.set(columnId, {source, blank, result});
    return result.values;
  }

  setFilterTruncated(columnId: string): boolean {
    return this.setValuesCache.get(columnId)?.result.truncated ?? false;
  }

  resolvedFilterOptions(columnId: string, filter: NgTableFilterConfig): NgTableFilterOption[] {
    const lazyOptions = this.lazyFilterOptions()[columnId];
    if (lazyOptions) {
      return lazyOptions;
    }
    return filter.options ?? [];
  }

  /**
   * Saisie libre (clavier) = debouncée ; choix discret (select, booléen, date
   * choisie au calendrier) = appliqué tout de suite. Avant, seul `text` était
   * debouncé : un filtre `number` ou `search` refiltrait à chaque touche.
   */
  private isFreeTypedFilter(columnId: string): boolean {
    const column = this.table.columns().find((c) => c.id === columnId);
    const type = column?.filter?.type ?? 'text';
    return !DISCRETE_FILTER_TYPES.has(type);
  }

  private filterEpoch(columnId: string): number {
    return this.filterEpochByColumn.get(columnId) ?? 0;
  }

  bumpFilterEpoch(columnId: string): void {
    this.filterEpochByColumn.set(columnId, this.filterEpoch(columnId) + 1);
  }

  commitFilterValue(columnId: string, value: string): void {
    this.columnFilters.update((current) => {
      const next = {...current, [columnId]: value ?? ''};
      this.table.filtersChange.emit(next);
      return next;
    });
    this.table.query.onQueryStateChanged();
  }

  /**
   * Completes a filters map with a `''` entry for every column of `columns()` that
   * has a `filter`/`filterPredicate`, and drops entries for columns no longer present.
   * Used both when mirroring the controlled `[filters]` input and when `columns()`
   * itself changes, so the component's filters set is always self-built from its own
   * column definitions — no consumer needs to know/repeat the filterable column list.
   */
  withDefaultFilterKeys(source: Record<string, string>): Record<string, string> {
    const filterableIds = new Set(
      this.table.columns().filter((column) => !!column.filter || !!column.filterPredicate).map((column) => column.id),
    );
    let changed = false;
    const next: Record<string, string> = {};
    for (const id of filterableIds) {
      next[id] = source[id] ?? '';
      if (source[id] === undefined) {
        changed = true;
      }
    }
    for (const key of Object.keys(source)) {
      if (!filterableIds.has(key)) {
        changed = true;
      }
    }
    return changed ? next : source;
  }

  requestFilterPositionUpdate(): void {
    const trigger = this.activeFilterTrigger();
    if (!trigger?.menuOpen) {
      return;
    }
    requestAnimationFrame(() => {
      if (trigger.menuOpen) {
        trigger.updatePosition();
      }
    });
  }

  /** Human readable value for the active filters bar (resolves enum option labels). */
  private formatFilterValueForDisplay(column: NgTableColumn<T>, rawValue: string): string {
    const filter = column.filter;
    if (!filter) {
      return rawValue;
    }

    if ((filter.type === 'range' || filter.type === 'numberRange') && rawValue.includes('..')) {
      return formatRangeValue(rawValue);
    }

    // Même libellé que dans la liste du filtre, et non la valeur technique « true ».
    if (filter.type === 'boolean' && !filter.options?.length) {
      const labels = this.table.effectiveLabels();
      if (rawValue === 'true') {
        return labels.yes;
      }
      if (rawValue === 'false') {
        return labels.no;
      }
    }

    if (filter.type === 'set') {
      const keys = parseSetFilter(rawValue);
      if (!keys) {
        return rawValue;
      }
      const blank = this.table.effectiveLabels().blanks;
      const labels = keys.map((key) => (key === '' ? blank : key));
      return labels.length > 3 ? `${labels.slice(0, 3).join(', ')} +${labels.length - 3}` : labels.join(', ');
    }

    const options = this.resolvedFilterOptions(column.id, filter);
    if (options.length === 0) {
      return rawValue;
    }

    return rawValue
      .split(',')
      .map((part) => part.trim())
      .filter((part) => !!part)
      .map((part) => options.find((option) => option.value === part)?.label ?? part)
      .join(', ');
  }

  private async ensureLazyFilterOptions(columnId: string, filter: NgTableFilterConfig): Promise<void> {
    // Evite les doubles chargements; memoization par colonne.
    if (!filter.optionsLoader) {
      return;
    }

    const loaded = this.lazyFilterOptions()[columnId];
    const loading = this.lazyFilterLoading()[columnId];
    if (loaded || loading) {
      return;
    }

    this.lazyFilterLoading.update((current) => ({
      ...current,
      [columnId]: true,
    }));
    this.lazyFilterEmptyError.update((current) => ({...current, [columnId]: false}));
    this.lazyFilterLoadError.update((current) => ({...current, [columnId]: false}));

    try {
      const source = filter.optionsLoader();
      const options = this.isObservableSource(source)
        ? await firstValueFrom(source)
        : await source;

      if (!options || options.length === 0) {
        this.lazyFilterOptions.update((current) => ({
          ...current,
          [columnId]: [],
        }));
        this.lazyFilterEmptyError.update((current) => ({...current, [columnId]: true}));
        return;
      }

      this.lazyFilterOptions.update((current) => ({
        ...current,
        [columnId]: options,
      }));
    } catch {
      this.lazyFilterOptions.update((current) => ({
        ...current,
        [columnId]: [],
      }));
      this.lazyFilterLoadError.update((current) => ({...current, [columnId]: true}));
    } finally {
      this.lazyFilterLoading.update((current) => ({
        ...current,
        [columnId]: false,
      }));
      this.requestFilterPositionUpdate();
    }
  }

  private isObservableSource(
    value: Observable<NgTableFilterOption[]> | Promise<NgTableFilterOption[]>,
  ): value is Observable<NgTableFilterOption[]> {
    return typeof (value as Observable<NgTableFilterOption[]>)?.subscribe === 'function';
  }

  /** Applique les valeurs saisies dans les filtres après le délai `[filterDebounceMs]`, colonne par colonne. */
  debounceTypedFilters(): void {
    this.filterInputSubject
      .pipe(
        groupBy((entry) => entry.columnId),
        // `debounce(() => timer(...))` plutôt que `debounceTime(...)` : le délai est relu
        // à chaque frappe, donc `[filterDebounceMs]` reste modifiable à chaud (et peut
        // être mis à 0 dans les tests).
        mergeMap((group) => group.pipe(debounce(() => timer(this.table.filterDebounceMs())))),
        takeUntilDestroyed(),
      )
      .subscribe((entry) => {
        if (entry.epoch !== this.filterEpoch(entry.columnId)) {
          return; // superseded by a clear/reset that happened while this keystroke was debouncing
        }
        if (entry.columnId === GLOBAL_SEARCH_KEY) {
          this.commitGlobalSearch(entry.value);
          return;
        }
        this.commitFilterValue(entry.columnId, entry.value);
      });
  }

  /** Suit l'entrée `[globalSearch]`. */
  followGlobalSearchInput(): void {
    effect(() => {
      const external = this.table.globalSearch();
      if (external === null) {
        return;
      }
      this.globalSearchTerm.set(external);
      this.globalSearchDraft.set(external);
    });
  }

  /** Suit l'entrée `[filters]`. */
  followFiltersInput(): void {
    effect(() => {
      const externalFilters = this.table.filters();
      if (!externalFilters) {
        return;
      }
      this.columnFilters.set(this.withDefaultFilterKeys(externalFilters));
      this.requestFilterPositionUpdate();
    });
  }

  /** Replace le menu de filtre ouvert quand les lignes affichées changent. */
  repositionOpenMenuOnRowsChange(): void {
    effect(() => {
      this.table.paging.displayedRows(); // dépendance seule : repositionner le menu de filtre ouvert
      this.requestFilterPositionUpdate();
    });
  }

  /** Applique le filtre avancé quand il change, comme un filtre de colonne. */
  followAdvancedFilter(): void {
    // Filtre avancé modifié (par l'application ou le constructeur de filtres) : même effet qu'un filtre de colonne,
    // retour en page 0 et nouvelle requête en mode `remote`. Pas au premier passage.
    effect(() => {
      const filter = this.table.advancedFilter();
      untracked(() => {
        if (filter !== this.advancedFilterApplied && this.advancedFilterApplied !== undefined) {
          this.table.query.onQueryStateChanged();
        }
        this.advancedFilterApplied = filter;
      });
    });
  }

  /** Charge d'avance les options des filtres en ligne (aucun menu ne s'ouvre pour le déclencher). */
  preloadInlineFilterOptions(): void {
    // Inline mode: lazy filter options must be loaded eagerly since there is no menu-open event.
    // `visibleColumnsUnordered` : quelles colonnes sont visibles importe, leur ordre non —
    // évite de repasser sur toutes les colonnes (déjà chargées, donc no-op, mais pas gratuit
    // sur beaucoup de colonnes) à chaque réordonnancement.
    effect(() => {
      if (!this.table.inlineFilters()) {
        return;
      }
      for (const column of this.table.columnLayout.visibleColumnsUnordered()) {
        if (column.filter?.optionsLoader) {
          void this.ensureLazyFilterOptions(column.id, column.filter);
        }
      }
    });
  }
}
