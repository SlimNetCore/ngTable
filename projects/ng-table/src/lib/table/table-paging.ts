import {computed, effect, Signal} from '@angular/core';
import {NgTablePageEvent} from '../ng-table-paginator.component';
import {NgTableGroupRow, remoteGroupedPage, withGroupHeaders} from '../row-grouping';
import type {NgTableComponent} from '../ng-table.component';

/** Pagination : lignes de la page courante. */
export class TablePaging<T> {
  constructor(private readonly table: NgTableComponent<T>) {}

  /** Pagination active : suivie par le parent (`pageTrackingEnabled`) ou paginateur intégré. */
  readonly pagingActive = computed(() => this.table.pageTrackingEnabled() || this.table.paginator());

  /** `[length]` du paginateur intégré. */
  readonly paginatorLength = computed(() =>
    this.table.dataMode() === 'remote' ? (this.table.totalCount() ?? this.table.rows().length) : this.pageableCount(),
  );

  /** Nombre d'éléments paginés : lignes filtrées, ou unités quand les lignes sont regroupées. */
  private readonly pageableCount = computed(() => this.table.grouping.groupUnits()?.length ?? this.table.data.filteredSortedRows().length);

  /** Voir `NgTableComponent.displayedRows`. */
  readonly displayedRows: Signal<T[]> = computed<T[]>(() => {
    if (this.table.remote.blockMode()) {
      // Lignes chargées de la zone rendue : ce que l'utilisateur voit (sélection, clavier).
      this.table.remote.blockVersion();
      const range = this.table.viewport.virtualRange();
      return range ? this.table.remote.blockCache.loadedRows(range.start, range.end) : [];
    }
    if (this.table.dataMode() === 'remote') {
      // Regroupées ou non, les lignes restent dans l'ordre renvoyé par le serveur.
      // Le serveur a déjà filtré/trié/paginé — on affiche tel quel.
      return this.table.rows();
    }
    const units = this.table.grouping.groupUnits();
    if (units) {
      return this.currentPage(units).flatMap((unit) => (unit.kind === 'row' ? [unit.row] : []));
    }
    return this.currentPage(this.table.data.filteredSortedRows());
  });

  /** Éléments de la page : les lignes affichées, avec les en-têtes de groupe intercalés. */
  readonly pageItems = computed<(T | NgTableGroupRow<T>)[]>(() => {
    const units = this.table.grouping.groupUnits();
    if (!units) {
      return this.displayedRows();
    }
    if (this.table.dataMode() === 'local') {
      return withGroupHeaders(this.currentPage(units));
    }
    // En remote, `rows()` EST déjà la page. Avec les résumés serveur, on y replace
    // aussi les en-têtes des groupes repliés (dont le serveur ne renvoie aucune ligne).
    const column = this.table.grouping.groupColumn();
    const summaries = this.table.groupSummaries();
    if (!column || !summaries) {
      return withGroupHeaders(units);
    }
    const size = this.table.pageSize();
    const paged = this.pagingActive() && size > 0;
    const start = paged ? this.table.pageIndex() * size : 0;
    return remoteGroupedPage(this.table.rows(), column, summaries, this.table.grouping.collapsedGroups(), start, paged ? start + size : Infinity);
  });

  /** Page courante d'une liste (lignes ou unités de regroupement), si la pagination est active. */
  private currentPage<U>(items: U[]): U[] {
    const size = this.table.pageSize();
    if (!this.pagingActive() || !size || size <= 0) {
      return items;
    }
    const start = this.table.pageIndex() * size;
    return items.slice(start, start + size);
  }

  /** Paginateur intégré : change de page ; en mode `remote`, relance la requête serveur. */
  onPage(event: NgTablePageEvent): void {
    this.table.pageSize.set(event.pageSize);
    this.table.pageIndex.set(event.pageIndex);
    if (this.table.dataMode() === 'remote') {
      this.table.query.emitRemoteQuery(this.table.query.buildRemoteQuery(event.pageIndex, event.pageSize));
    }
  }

  /** Émet `(filteredCountChange)` en mode local. */
  reportFilteredCount(): void {
    effect(() => {
      if (this.table.dataMode() !== 'local' || !this.pagingActive()) {
        return;
      }
      this.table.filteredCountChange.emit(this.pageableCount());
    });
  }

  /** Revient à la dernière page existante quand les données rétrécissent (paginateur intégré, mode local). */
  clampPageIndex(): void {
    // Paginateur intégré, mode local : si les données rétrécissent (rechargement),
    // ne pas rester sur une page devenue vide au-delà de la dernière.
    effect(() => {
      if (!this.table.paginator() || this.table.dataMode() !== 'local') {
        return;
      }
      const size = this.table.pageSize();
      const lastPage = size > 0 ? Math.max(0, Math.ceil(this.pageableCount() / size) - 1) : 0;
      if (this.table.pageIndex() > lastPage) {
        this.table.pageIndex.set(lastPage);
      }
    });
  }
}
