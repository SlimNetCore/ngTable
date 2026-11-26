import {computed, effect, signal, untracked} from '@angular/core';
import {ColumnStore} from '../column-store';
import {compileAdvancedFilter, filterColumnIds, NgTableFilterGroup} from '../advanced-filter';
import {compileFilters, compileIndexFilters, filtersNarrow, searchNarrows} from '../filter-compile';
import {searchText, SortLevel} from '../row-pipeline';
import {IncrementalPipeline, RowsDelta, rowsPatch, RowStore} from '../live-rows';
import {layoutTree, withAncestors} from '../tree-data';
import {ComputeWorkerClient, createDefaultComputeWorker} from '../compute-worker-client';
import {matchesSearchTerms, searchTerms} from '../filter-matching';
import type {NgTableColumn} from '../ng-table.models';
import {defaultRowKey} from './internals';
import type {NgTableComponent} from '../ng-table.component';

/** Données : magasin de lignes, filtrage et tri (dans la page ou en Web Worker), recherche. */
export class TableData<T> {
  constructor(private readonly table: NgTableComponent<T>) {}

  /**
   * Local mode pipeline: rows source -> filtres -> tri (sans pagination).
   * Dépend de `visibleColumnsUnordered()`, PAS de `visibleColumns()` — le
   * filtrage/tri ne dépend en rien de l'ORDRE des colonnes, seulement de
   * lesquelles sont visibles et de leurs valeurs de filtre. Voir le
   * commentaire de `visibleColumnsUnordered`.
   */

  private computeClient: ComputeWorkerClient | null = null;

  /** Dernier jeu de réglages envoyé au worker : un calcul identique n'est pas redemandé (sinon chaque résultat en relancerait un). */
  private workerRequested: {
    source: readonly T[];
    filters: Record<string, string>;
    filterColumns: readonly NgTableColumn<T>[];
    levels: readonly SortLevel<T>[];
    haystacks: unknown;
    advanced: NgTableFilterGroup | null;
  } | null = null;

  /** Lignes (et leur ordre d'arrivée) vues au dernier passage : une transaction se décrit par rapport à elles. */
  private workerBase: {rows: readonly T[]; seqs: readonly number[]} | null = null;

  private readonly workerResult = signal<{rows: T[]} | null>(null);
  readonly workerBusy = signal(false);

  /** Le worker a échoué (CSP, plantage) : le tri et les filtres reviennent sur le fil principal. */
  private readonly workerFailed = signal(false);

  /** Le magasin a été lu sans le pipeline incrémental : celui-ci repart de zéro quand on y revient. */
  private pipelineStale = false;

  private readonly workerEligible = computed(
    () =>
      this.table.workerCompute() &&
      !this.workerFailed() &&
      this.table.dataMode() === 'local' &&
      !this.table.tree.treeActive() &&
      (!!this.table.computeWorkerFactory() || typeof Worker !== 'undefined') &&
      this.sourceRows().length >= this.table.workerThreshold(),
  );

  /** Indicateur d'attente : chargement demandé par l'application, ou calcul en worker en cours. */
  readonly busy = computed(() => this.table.loading() || this.workerBusy());

  /**
   * Résultat du dernier calcul en worker, et demande du suivant si les réglages ont changé. Appelé par `pipelineRows` :
   * il ne peut pas écrire de signal, la demande part donc dans une micro-tâche.
   */
  private workerRows(
    store: RowStore<T>,
    filterColumns: NgTableColumn<T>[],
    filters: Record<string, string>,
    levels: SortLevel<T>[],
    terms: string[],
    haystacks: {columns: NgTableColumn<T>[]; cache: WeakMap<object, string>} | null,
    advanced: {filter: NgTableFilterGroup; columns: NgTableColumn<T>[]} | null,
  ): T[] {
    const source = this.sourceRows();
    const result = this.workerResult();
    // Le pipeline incrémental n'est pas lu. Ses changements en attente servent à décrire au worker ce qui a changé
    // depuis le tableau précédent (transaction du mode live), pour qu'il retouche ses colonnes au lieu de tout recevoir.
    const changes = store.drain();
    const base = this.workerBase;
    const delta = base && base.rows !== source && !changes.reset && changes.keys.size > 0 ? rowsPatch(store, changes.keys, base.seqs) : null;
    const patch = base && delta ? {from: base.rows, ...delta} : undefined;
    this.workerBase = {rows: source, seqs: store.seqs()};
    this.pipelineStale = true;
    if (filterColumns.length === 0 && levels.length === 0 && !haystacks && !advanced) {
      return source; // rien à calculer : l'ordre d'arrivée
    }
    const last = this.workerRequested;
    const same =
      !!last &&
      last.source === source &&
      last.filters === filters &&
      last.haystacks === haystacks &&
      last.advanced === (advanced?.filter ?? null) &&
      last.filterColumns.length === filterColumns.length &&
      last.filterColumns.every((column, index) => column === filterColumns[index]) &&
      last.levels.length === levels.length &&
      last.levels.every((level, index) => level.column === levels[index].column && level.factor === levels[index].factor);
    if (!same) {
      this.workerRequested = {source, filters, filterColumns, levels, haystacks, advanced: advanced?.filter ?? null};
      queueMicrotask(() => this.startWorkerJob(source, filterColumns, filters, levels, terms, haystacks, advanced, patch));
    }
    return result?.rows ?? [];
  }

  private startWorkerJob(
    source: readonly T[],
    filterColumns: NgTableColumn<T>[],
    filters: Record<string, string>,
    levels: SortLevel<T>[],
    terms: string[],
    haystacks: {columns: NgTableColumn<T>[]; cache: WeakMap<object, string>} | null,
    advanced: {filter: NgTableFilterGroup; columns: NgTableColumn<T>[]} | null,
    patch?: RowsDelta<T> & {from: readonly T[]},
  ): void {
    const client = (this.computeClient ??= new ComputeWorkerClient(this.table.computeWorkerFactory() ?? createDefaultComputeWorker));
    this.workerBusy.set(true);
    client
      .compute(source, {
        filterColumns,
        filters: Object.fromEntries(filterColumns.map((column) => [column.id, (filters[column.id] ?? '').trim()])),
        levels,
        advanced,
        search: haystacks ? {terms, source: haystacks, read: (row: T) => this.searchHaystack(row, haystacks)} : null,
        collator: {options: {numeric: true, sensitivity: 'base'}},
      }, patch)
      .then(({order, job}) => {
        if (!client.isLatest(job)) {
          return; // une demande plus récente est en cours
        }
        const rows = new Array<T>(order.length);
        for (let i = 0; i < order.length; i++) {
          rows[i] = source[order[i]];
        }
        this.workerResult.set({rows});
        this.workerBusy.set(false);
      })
      .catch((error: unknown) => {
        this.workerBusy.set(false);
        this.workerFailed.set(true);
        this.computeClient?.dispose();
        this.computeClient = null;
        console.warn('ng-table : le calcul en worker a échoué, retour au fil principal.', error);
      });
  }

  private readonly pipelineRows = computed(() => {
    const store = this.syncedStore();
    this.dataVersion();
    const activeColumns = this.table.columnLayout.visibleColumnsUnordered();
    const filters = this.table.filtering.columnFilters();
    const sorts = this.table.sorting.sortStates();
    const search = this.table.filtering.globalSearchTerm();
    const sums = this.runningSums();
    const terms = searchTerms(search);
    const haystacks = terms.length > 0 ? this.searchHaystacks() : null;
    const advanced = this.table.advancedFilter();
    // Toutes les colonnes, masquées comprises : une condition peut porter sur une colonne qu'on n'affiche pas.
    const advancedMatch = compileAdvancedFilter(advanced, this.table.columns());

    const levels: SortLevel<T>[] = [];
    for (const sort of sorts) {
      const column = activeColumns.find((candidate) => candidate.id === sort.columnId);
      if (column) {
        levels.push({column, factor: sort.direction === 'desc' ? -1 : 1});
      }
    }
    // Grand jeu de données : filtres, recherche et tri se calculent dans un Web Worker.
    // Grand jeu de données : filtres, filtre avancé, recherche et tri se calculent dans un Web Worker. Seul un
    // `filterPredicate` (une fonction de l'application) oblige à rester sur le fil principal.
    if (this.workerEligible()) {
      const filterColumns = activeColumns.filter((column) => (filters[column.id] ?? '').trim() !== '');
      const advancedColumns = advancedMatch ? filterColumnIds(advanced).map((id) => this.table.columns().find((column) => column.id === id)).filter((column): column is NgTableColumn<T> => !!column) : [];
      if (![...filterColumns, ...advancedColumns].some((column) => column.filterPredicate)) {
        return this.workerRows(store, filterColumns, filters, levels, terms, haystacks, advancedMatch && advanced ? {filter: advanced, columns: advancedColumns} : null);
      }
    }
    if (this.pipelineStale) {
      this.pipelineStale = false;
      this.pipeline = new IncrementalPipeline<T>();
    }

    // Les saisies de filtre sont lues une fois ici ; chaque ligne n'a plus qu'une comparaison à faire.
    const columnFilter = compileFilters(activeColumns, filters);
    const baseMatches = (row: T) =>
      (!columnFilter || columnFilter(row)) &&
      (!advancedMatch || advancedMatch(row)) &&
      (!haystacks || matchesSearchTerms(this.searchHaystack(row, haystacks), terms));

    // Arbre : une ligne reste affichée si elle correspond ou si un de ses descendants correspond.
    // L'ensemble est recalculé à chaque changement de données ou de filtre, donc le pipeline
    // repart de zéro (`deps`) : le mode arbre n'est pas incrémental.
    const index = this.table.tree.treeIndex();
    let treeInclude: Set<unknown> | null = null;
    if (index && this.table.tree.treeFilterActive()) {
      const matched: unknown[] = [];
      for (const row of this.sourceRows()) {
        if (baseMatches(row)) {
          matched.push(this.rowKey(row));
        }
      }
      treeInclude = withAncestors(matched, index);
    }
    const included = treeInclude;

    // Seules les lignes modifiées depuis le dernier passage sont refiltrées puis fusionnées
    // dans le résultat déjà trié ; tout est recalculé si filtres, tri ou colonnes changent.
    return this.pipeline.compute(store, {
      matches: included ? (row) => included.has(this.rowKey(row)) : baseMatches,
      levels,
      collator: this.table.collator,
      sums,
      columnStore: this.columnStore,
      // Recalcul complet : filtres par les colonnes en dictionnaire quand elles existent (valeurs répétées).
      matchesAt: included
        ? undefined
        : (all) => {
            const at = compileIndexFilters(all, activeColumns, filters, (column) => this.columnStore.dictionary(all, column));
            return (i) =>
              (!at || at(i)) &&
              (!advancedMatch || advancedMatch(all[i])) &&
              (!haystacks || matchesSearchTerms(this.searchHaystack(all[i], haystacks), terms));
          },
      // Saisie prolongée (« dup » → « dupo ») ou filtre ajouté : seul le résultat précédent est refiltré, sans retri.
      narrowing: index
        ? undefined
        : {
            base: [store, activeColumns, sorts, haystacks?.columns, sums, advanced],
            state: {filters, terms},
            narrows: (previous: {filters: Record<string, string>; terms: string[]}) =>
              filtersNarrow(activeColumns, previous.filters, filters) && searchNarrows(previous.terms, terms),
          },
      deps: [store, activeColumns, filters, sorts, search, haystacks?.columns, sums, included, advanced],
    });
  });

  /** Lignes affichables : le résultat du pipeline, ou, en mode arbre, ses nœuds visibles dans l'ordre de l'arbre. */
  readonly filteredSortedRows = computed(() => {
    const rows = this.pipelineRows();
    const index = this.table.tree.treeIndex();
    if (!index) {
      return rows;
    }
    return layoutTree(rows, (row) => this.rowKey(row), index, this.table.tree.treeExpansion());
  });

  /**
   * Colonnes `sum` / `avg` de la ligne de totaux : leurs sommes sont tenues par le
   * pipeline, par différence à chaque lot, au lieu de relire toutes les lignes.
   */
  private readonly runningSums = computed(() =>
    this.table.showTotals() && this.table.dataMode() === 'local'
      ? this.table.columns()
          .filter((column) => column.aggregate === 'sum' || column.aggregate === 'avg')
          .map((column) => ({id: column.id, value: column.valueAccessor}))
      : [],
  );

  /**
   * Lignes de la table indexées par clé (mode local) : alimentées par `[rows]` (comparé
   * à la version précédente, clé par clé) et par les transactions.
   */
  private rowStore = new RowStore<T>((row) => this.rowKey(row));

  pipeline = new IncrementalPipeline<T>();

  /** Valeurs de tri gardées en colonnes tant que les lignes ne changent pas : un nouveau tri ne rappelle pas les accesseurs. */
  private readonly columnStore = new ColumnStore<T>();

  /** Incrémenté à chaque transaction appliquée. */
  readonly dataVersion = signal(0);

  /**
   * Reporte `[rows]` dans le store à chaque nouveau tableau. Lu avant toute transaction,
   * pour qu'une transaction s'applique toujours après le dernier `[rows]` reçu.
   */
  readonly syncedStore = computed(() => {
    const rows = this.table.tree.treeNested()?.rows ?? this.table.rows();
    const keyAccessor = this.table.rowKeyAccessor();
    if (keyAccessor !== this.storeKeyAccessor) {
      this.storeKeyAccessor = keyAccessor;
      // L'accesseur est lu une fois ici (pas un signal par ligne) : le magasin est recréé s'il change.
      const keyOf = keyAccessor ?? defaultRowKey;
      this.rowStore = new RowStore<T>(keyOf);
      this.pipeline = new IncrementalPipeline<T>();
      this.storeFilled = false;
    }
    // En pause (`liveUpdatesPaused`), le magasin garde son contenu : le dernier `[rows]` sera reporté à la reprise.
    if (!this.table.liveUpdatesPaused() || !this.storeFilled) {
      this.storeFilled = true;
      untracked(() => this.table.live.recordFlashes(this.rowStore.replaceAll(rows)));
    }
    return this.rowStore;
  }, {equal: () => false});

  private storeFilled = false;
  private storeKeyAccessor: ((row: T) => unknown) | null | undefined = undefined;

  /** Toutes les lignes en mode local, transactions comprises (ordre d'arrivée). */
  readonly sourceRows = computed(() => {
    this.dataVersion();
    return this.syncedStore().rows();
  });

  private readonly searchableColumns = computed(() =>
    this.table.columnLayout.visibleColumnsUnordered().filter((column) => column.searchable !== false),
  );

  /**
   * Texte normalisé de chaque ligne pour la recherche globale : calculé une fois par
   * ligne, puis réutilisé à chaque nouvelle saisie (seule la comparaison est refaite).
   * Le cache est recréé quand les lignes ou les colonnes cherchables changent.
   */
  readonly searchHaystacks = computed(() => {
    // Mis en cache par objet ligne : une ligne modifiée (nouvel objet) est recalculée à la
    // demande, les autres gardent leur texte. Un changement de colonnes vide le cache, ainsi
    // qu'une recherche restée vide 30 secondes (voir `releaseSearchCache`).
    this.searchCacheEpoch();
    return {columns: this.searchableColumns(), cache: new WeakMap<object, string>()};
  });

  private readonly searchCacheEpoch = signal(0);
  searchCacheTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * Rend la mémoire des textes de recherche (mesuré : environ 250 octets par ligne, soit 250 Mo pour un million de
   * lignes). Ils restaient en mémoire après l'effacement de la recherche ; ils seront recalculés à la prochaine saisie.
   */
  releaseSearchCache(): void {
    this.searchCacheTimer = null;
    if (this.table.filtering.globalSearchTerm() === '') {
      this.searchCacheEpoch.update((epoch) => epoch + 1);
    }
  }

  private searchHaystack(
    row: T,
    haystacks: { columns: NgTableColumn<T>[]; cache: WeakMap<object, string> },
  ): string {
    const cacheable = typeof row === 'object' && row !== null;
    const cached = cacheable ? haystacks.cache.get(row) : undefined;
    if (cached !== undefined) {
      return cached;
    }
    const text = searchText(row, haystacks.columns);
    if (cacheable) {
      haystacks.cache.set(row, text);
    }
    return text;
  }

  rowKey(row: T): unknown {
    // Cle metier stable: rowKeyAccessor > heuristique id > reference de la ligne.
    // Volontairement PAS `rowTrackBy` ici : c'est un trackBy de rendu (perf),
    // qui incorpore souvent l'index — un index n'est pas stable au tri/filtre/
    // pagination, ce qui ferait migrer silencieusement la sélection d'une ligne
    // vers une autre au lieu de rester attachée à la bonne (bug corrigé : cette
    // branche appelait aussi `rowTrackBy` avec un index toujours à `0`).
    const accessor = this.table.rowKeyAccessor();
    if (accessor) {
      return accessor(row);
    }
    return defaultRowKey(row);
  }

  /** Prévient l'application quand le calcul en worker commence et se termine (`(computing)`). */
  reportComputing(): void {
    // Le calcul en worker prévient l'application quand il commence et quand il se termine.
    effect(() => {
      const busy = this.workerBusy();
      untracked(() => this.table.computing.emit(busy));
    });
  }

  /** Arrête le worker de calcul. */
  dispose(): void {
    this.computeClient?.dispose();
    this.computeClient = null;
  }
}
