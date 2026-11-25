import {computed} from '@angular/core';
import {NgTableGroupRow} from '../row-grouping';
import {isDataItem} from './internals';
import type {NgTableComponent} from '../ng-table.component';

/** Rangs ARIA des lignes et des colonnes. */
export class TableAria<T> {
  constructor(private readonly table: NgTableComponent<T>) {}

  /** Lignes d'en-têtes : un niveau par regroupement de colonnes, plus la ligne des colonnes. */
  readonly headerRowCount = computed(() => this.table.columnLayout.headerGroupLevels().length + 1);

  /**
   * `aria-rowcount` : nombre total de lignes de la table (en-têtes et totaux compris) quand le défilement virtuel n'en
   * rend qu'une tranche. Sans lui, un lecteur d'écran annonce « 21 lignes » pour 100 000. `null` hors virtualisation :
   * le DOM est complet, le navigateur compte lui-même.
   */
  readonly ariaRowCount = computed<number | null>(() =>
    this.table.viewport.virtualActive() ? this.headerRowCount() + this.table.viewport.virtualCount() + (this.table.render.totals() ? 1 : 0) : null,
  );

  /** `aria-rowindex` (à partir de 1) des lignes de la tranche rendue, en défilement virtuel. */
  private readonly ariaRowIndexes = computed(() => {
    const indexes = new Map<unknown, number>();
    const range = this.table.viewport.virtualRange();
    if (!range) {
      return indexes;
    }
    const body = this.table.render.bodyRows();
    const base = this.headerRowCount() + range.start;
    for (let i = 1; i < body.length - 1; i++) {
      indexes.set(body[i], base + i);
    }
    return indexes;
  });

  ariaRowIndex(item: unknown): number | null {
    return this.ariaRowCount() === null ? null : (this.ariaRowIndexes().get(item) ?? null);
  }

  /** Index (dans `displayedRows()`) de la première ligne de données rendue : tranche virtuelle et groupes. */
  private readonly renderedRowBase = computed(() => {
    const range = this.table.viewport.virtualRange();
    if (!range || this.table.remote.blockMode()) {
      return 0;
    }
    if (!this.table.grouping.groupUnits()) {
      return range.start;
    }
    const items = this.table.paging.pageItems();
    let count = 0;
    for (let i = 0; i < range.start; i++) {
      if (!(items[i] instanceof NgTableGroupRow)) {
        count++;
      }
    }
    return count;
  });

  /** Index dans `displayedRows()` de chaque ligne rendue (les lignes épinglées n'en ont pas). */
  readonly renderedRowIndexes = computed(() => {
    const indexes = new Map<T, number>();
    if (!this.table.rangeSelection() && !this.table.striped()) {
      return indexes;
    }
    const pinned = this.table.render.pinnedInfo();
    let index = this.renderedRowBase();
    for (const item of this.table.render.tableRows()) {
      if (isDataItem(item) && !pinned.has(item)) {
        indexes.set(item, index++);
      }
    }
    return indexes;
  });

  /** `aria-colindex` d'un en-tête groupé : celui de sa première colonne (virtualisation horizontale). */
  headerRunColIndex(level: {runs: {span: number}[]}, runIndex: number): number | null {
    if (!this.table.columnLayout.columnVirtualization()) {
      return null;
    }
    let offset = 0;
    for (let i = 0; i < runIndex; i++) {
      offset += level.runs[i].span;
    }
    const id = this.table.columnLayout.displayedColumnIds()[offset];
    return id === undefined ? null : this.table.columnLayout.ariaColIndex(id);
  }
}
