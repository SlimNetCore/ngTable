import {computed, effect, signal} from '@angular/core';
import {
    generateViewId,
    loadViewsStore,
    mergeViewsStores,
    parseViewsStore,
    saveViewsStore,
    serializeViewsStore
} from '../views-storage';
import {sanitizeFilterGroup} from '../advanced-filter';
import {downloadFile} from '../export-writers';
import type {NgTableView, NgTableViewsStore, NgTableViewState} from '../ng-table.models';
import {GLOBAL_SEARCH_KEY} from './internals';
import type {NgTableComponent} from '../ng-table.component';

/** Vues enregistrées : création, application, import et export. */
export class TableViews<T> {
  constructor(private readonly table: NgTableComponent<T>) {}

  /** Voir `NgTableComponent.viewsList`. */
  readonly viewsList = computed(() => this.effectiveViewsStore().views);

  /** Voir `NgTableComponent.activeViewId`. */
  readonly activeViewId = computed(() => this.effectiveViewsStore().activeViewId);

  /** Voir `NgTableComponent.activeView`. */
  readonly activeView = computed(() => this.viewsList().find((v) => v.id === this.activeViewId()) ?? null);

  /** Id de la vue venant d'être mise à jour — pilote la coche transitoire du bouton. */
  private readonly updatedViewId = signal<string | null>(null);

  readonly newViewName = signal('');

  /** Message affiché dans le menu des vues après un import (succès ou fichier invalide). */
  readonly viewsImportFeedback = signal('');

  private readonly internalViewsStore = signal<NgTableViewsStore>({views: [], activeViewId: null});
  private hasLoadedInitialViewsStore = false;

  /** Voir `NgTableComponent.saveCurrentAsView`. */
  saveCurrentAsView(name: string): void {
    const trimmed = name.trim();
    if (!trimmed) {
      return;
    }

    const state = this.captureCurrentViewState();
    const store = this.effectiveViewsStore();
    const now = new Date().toISOString();
    const existing = store.views.find((v) => v.name === trimmed);

    let nextViews: NgTableView[];
    let activeViewId: string;
    if (existing) {
      activeViewId = existing.id;
      nextViews = store.views.map((v) => (v.id === existing.id ? {...v, state, updatedAt: now} : v));
    } else {
      const created: NgTableView = {id: generateViewId(), name: trimmed, createdAt: now, updatedAt: now, state};
      activeViewId = created.id;
      nextViews = [...store.views, created];
    }

    this.commitViewsStore({...store, views: nextViews, activeViewId});
    this.newViewName.set('');
    this.table.announce([this.table.effectiveLabels().announceViewSaved.replace('{name}', trimmed)]);
  }

  /** Voir `NgTableComponent.updateView`. */
  updateView(view: NgTableView): void {
    const state = this.captureCurrentViewState();
    const store = this.effectiveViewsStore();
    const now = new Date().toISOString();
    const nextViews = store.views.map((v) => (v.id === view.id ? {...v, state, updatedAt: now} : v));
    this.commitViewsStore({...store, views: nextViews, activeViewId: view.id});
    this.table.announce([this.table.effectiveLabels().announceViewSaved.replace('{name}', view.name)]);

    // Feedback transitoire (icône -> check) — même mécanisme que la copie de
    // cellule. Pas de notification/toast : la librairie n'a pas de dépendance
    // UI pour ça, et un swap d'icône reste visible même si le menu est resté ouvert.
    this.updatedViewId.set(view.id);
    setTimeout(() => {
      if (this.updatedViewId() === view.id) {
        this.updatedViewId.set(null);
      }
    }, 1400);
  }

  /** Icône du bouton "mettre à jour" d'une vue — coche transitoire juste après l'action. */
  viewUpdateIconName(view: NgTableView): string {
    return this.updatedViewId() === view.id ? 'check' : 'sync';
  }

  private captureCurrentViewState(): NgTableViewState {
    return {
      columnVisibility: {...this.table.columnLayout.effectiveColumnVisibility()},
      columnOrder: [...this.table.columnLayout.effectiveColumnOrder()],
      sort: {...this.table.sorting.sortState()},
      ...(this.table.sorting.sortStates().length > 1 ? {sorts: this.table.sorting.sortStates().map((sort) => ({...sort}))} : {}),
      filters: {...this.table.filtering.columnFilters()},
      columnWidths: {...this.table.columnLayout.columnWidths()},
      ...(this.table.filtering.globalSearchTerm() ? {search: this.table.filtering.globalSearchTerm()} : {}),
      ...(this.table.advancedFilter() ? {advancedFilter: this.table.advancedFilter()!} : {}),
      ...(this.table.referenceColumn() !== undefined ? {referenceColumnId: this.table.referenceColumn()} : {}),
      ...(this.table.groupBy() ? {groupBy: this.table.groupBy()} : {}),
      ...(this.table.groupBy() && this.table.grouping.groupColumns().length > 1 ? {groupLevels: this.table.grouping.groupColumns().slice(1).map((column) => column.id)} : {}),
      ...(this.table.paging.pagingActive() ? {pageIndex: this.table.pageIndex(), pageSize: this.table.pageSize()} : {}),
    };
  }

  /** Voir `NgTableComponent.activateView`. */
  activateView(view: NgTableView): void {
    const store = this.effectiveViewsStore();
    this.commitViewsStore({...store, activeViewId: view.id});
    this.applyViewState(view);
    this.table.announce([this.table.effectiveLabels().announceViewApplied.replace('{name}', view.name)]);
  }

  /** Voir `NgTableComponent.deleteView`. */
  deleteView(view: NgTableView): void {
    const store = this.effectiveViewsStore();
    const nextViews = store.views.filter((v) => v.id !== view.id);
    const defaultViewId = store.defaultViewId === view.id ? null : (store.defaultViewId ?? null);
    const nextActiveId = store.activeViewId === view.id ? (defaultViewId ?? nextViews[0]?.id ?? null) : store.activeViewId;
    this.commitViewsStore({...store, views: nextViews, activeViewId: nextActiveId, defaultViewId});
    this.table.announce([this.table.effectiveLabels().announceViewDeleted.replace('{name}', view.name)]);
  }

  /** Voir `NgTableComponent.toggleDefaultView`. */
  toggleDefaultView(view: NgTableView): void {
    const store = this.effectiveViewsStore();
    this.commitViewsStore({...store, defaultViewId: store.defaultViewId === view.id ? null : view.id});
  }

  /** Voir `NgTableComponent.isDefaultView`. */
  isDefaultView(view: NgTableView): boolean {
    return this.effectiveViewsStore().defaultViewId === view.id;
  }

  /** Voir `NgTableComponent.exportViews`. */
  exportViews(): string {
    return serializeViewsStore(this.effectiveViewsStore());
  }

  /** Voir `NgTableComponent.importViews`. */
  importViews(json: string, mode: 'merge' | 'replace' = 'merge'): number {
    const imported = parseViewsStore(json);
    const count = imported.views.length;
    if (count > 0) {
      if (mode === 'replace') {
        this.commitViewsStore(imported);
        this.applyActiveView(imported);
      } else {
        this.commitViewsStore(mergeViewsStores(this.effectiveViewsStore(), imported));
      }
    }
    this.viewsImportFeedback.set(
      count > 0 ? this.table.effectiveLabels().viewsImported.replace('{count}', `${count}`) : this.table.effectiveLabels().viewsImportInvalid,
    );
    this.table.viewsImported.emit({imported: count, mode});
    return count;
  }

  /** Voir `NgTableComponent.downloadViews`. */
  downloadViews(): void {
    const name = this.table.viewsStorageKey() ?? 'ng-table';
    downloadFile(this.exportViews(), `${name}-vues.json`, 'application/json');
  }

  /** Fichier choisi via le bouton « Importer » du menu des vues (fusion). */
  async onViewsFileSelected(input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0];
    input.value = ''; // permet de réimporter le même fichier
    if (!file) {
      return;
    }
    this.importViews(await file.text(), 'merge');
  }

  effectiveViewsStore(): NgTableViewsStore {
    return this.table.viewsStore() ?? this.internalViewsStore();
  }

  /**
   * À l'ouverture : la vue par défaut si elle est définie, sinon la dernière vue active.
   * Si la vue par défaut n'était pas la vue active, le store est mis à jour (et donc
   * persisté / remonté au parent) pour que le menu reflète la vue réellement affichée.
   */
  private applyInitialView(store: NgTableViewsStore): void {
    const defaultId = store.defaultViewId;
    if (defaultId && defaultId !== store.activeViewId && store.views.some((v) => v.id === defaultId)) {
      const next = {...store, activeViewId: defaultId};
      this.commitViewsStore(next);
      this.applyActiveView(next);
      return;
    }
    this.applyActiveView(store);
  }

  private applyActiveView(store: NgTableViewsStore): void {
    const active = store.views.find((v) => v.id === store.activeViewId);
    if (active) {
      this.applyViewState(active);
    }
  }

  private applyViewState(view: NgTableView): void {
    const state = view.state;
    this.table.columnLayout.internalColumnVisibility.set({...state.columnVisibility});
    this.table.columnLayout.internalColumnOrder.set([...state.columnOrder]);
    this.table.referenceColumn.set(state.referenceColumnId);
    this.table.groupBy.set(state.groupBy ?? null);
    this.table.groupLevels.set([...(state.groupLevels ?? [])]);
    const savedSorts = state.sorts?.length ? state.sorts : [state.sort];
    this.table.sorting.sortStates.set(savedSorts.filter((sort) => sort.columnId && sort.direction).map((sort) => ({...sort})));
    this.table.filtering.columnFilters.set({...state.filters});
    // Vue enregistrée avant l'ajout des largeurs : on laisse celles en cours
    // plutôt que de tout réinitialiser à l'activation.
    if (state.columnWidths) {
      this.table.columnLayout.columnWidths.set({...state.columnWidths});
    }
    this.table.filtersChange.emit(this.table.filtering.columnFilters());

    // Une vue enregistrée avant l'ajout du filtre avancé n'en a pas : elle le retire, comme elle retire la recherche.
    this.table.filtering.setAdvancedFilterSilently(sanitizeFilterGroup(state.advancedFilter));

    const search = state.search ?? '';
    this.table.filtering.bumpFilterEpoch(GLOBAL_SEARCH_KEY);
    this.table.filtering.globalSearchDraft.set(search);
    if (search !== this.table.filtering.globalSearchTerm()) {
      this.table.filtering.globalSearchTerm.set(search);
      this.table.globalSearchChange.emit(search);
    }

    // `onQueryStateChanged()` remettrait la page à 0 (comportement normal pour un
    // simple changement de filtre) — mais ici la vue a potentiellement sa PROPRE
    // page à restaurer. L'appeler quand même, puis corriger juste après avec
    // `viewPaginationRestore`, marchait "par chance" en mode local (le dernier
    // événement gagne) mais PAS en mode remote : `remoteQueryChange` partait avec
    // `page.index: 0` et rien ne le rattrapait ensuite, donc la taille/page
    // sauvegardées de la vue n'atteignaient jamais le serveur.
    const hasSavedPagination = state.pageIndex !== undefined && state.pageSize !== undefined;
    if (!hasSavedPagination) {
      this.table.query.onQueryStateChanged();
    } else if (this.table.dataMode() === 'remote') {
      this.table.query.emitRemoteQuery({
        ...this.table.query.buildRemoteQuery(state.pageIndex!, state.pageSize!),
        page: {index: state.pageIndex!, size: state.pageSize!},
      });
    }

    if (hasSavedPagination) {
      // Appliquée directement (mode non contrôlé, paginateur intégré) ET signalée,
      // pour un parent qui tient la pagination dans ses propres signaux.
      this.table.pageSize.set(state.pageSize!);
      this.table.pageIndex.set(state.pageIndex!);
      this.table.viewPaginationRestore.emit({pageIndex: state.pageIndex!, pageSize: state.pageSize!});
    }
    this.table.viewActivated.emit(view);
  }

  /** Central write path: updates in-memory state, persists to localStorage in uncontrolled mode, and always reports out. */
  private commitViewsStore(next: NgTableViewsStore): void {
    this.internalViewsStore.set(next);
    const key = this.table.viewsStorageKey();
    if (key && !this.table.viewsStore()) {
      saveViewsStore(key, next);
    }
    this.table.viewsStoreChange.emit(next);
  }

  /** Applique la vue active une seule fois, au premier magasin de vues disponible. */
  applyInitialViewOnce(): void {
    // Views: the active view is auto-applied exactly once, on the first time a store
    // becomes available (controlled: parent-supplied input; uncontrolled: localStorage
    // read) — never again afterwards, so the user's later edits are never silently
    // reverted by a stale re-read or an echoed store update from the parent.
    effect(() => {
      if (!this.table.viewsEnabled()) {
        return;
      }
      const external = this.table.viewsStore();
      if (external) {
        this.internalViewsStore.set(external);
        if (!this.hasLoadedInitialViewsStore) {
          this.hasLoadedInitialViewsStore = true;
          this.applyInitialView(external);
        }
        return;
      }
      if (this.hasLoadedInitialViewsStore) {
        return;
      }
      const key = this.table.viewsStorageKey();
      if (!key) {
        return;
      }
      this.hasLoadedInitialViewsStore = true;
      const loaded = loadViewsStore(key);
      this.internalViewsStore.set(loaded);
      this.applyInitialView(loaded);
    });
  }
}
