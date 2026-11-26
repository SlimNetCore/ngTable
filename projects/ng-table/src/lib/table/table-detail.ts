import {signal} from '@angular/core';
import {isDataItem, TableItem} from './internals';
import type {NgTableComponent} from '../ng-table.component';

/** Ligne détail : dépli, repli, accordéon. */
export class TableDetail<T> {
  constructor(private readonly table: NgTableComponent<T>) {}

  /** Uncontrolled expansion state (row keys currently expanded). */
  private readonly internalExpandedKeys = signal<ReadonlySet<unknown>>(new Set());

  /** Voir `NgTableComponent.toggleDetail`. */
  toggleDetail(row: T): void {
    if (!this.table.detailRowTemplate() || !this.rowCanExpand(row)) {
      return;
    }

    const key = this.table.data.rowKey(row);
    const current = new Set(this.internalExpandedKeys());
    const expanded = !current.has(key);

    if (expanded) {
      if (this.table.detailRowAccordion()) {
        current.clear();
      }
      current.add(key);
    } else {
      current.delete(key);
    }

    this.internalExpandedKeys.set(current);
    this.table.detailToggle.emit({row, expanded, expandedKeys: [...current]});
  }

  /**
   * Clic sur le bouton natif. Mode non contrôlé : bascule le détail. Mode contrôlé : n'écrit aucun état et émet
   * `(detailToggle)` avec l'état demandé (et les clés qui en résultent pour `expandedRowKeys`).
   */
  onDetailToggleClick(event: Event, rowIndex: number, row: T): void {
    event.stopPropagation(); // sinon le clic remonte à la ligne, qui basculerait une seconde fois
    if (this.isUncontrolledDetailMode()) {
      this.toggleDetail(row);
      return;
    }
    const expanded = !this.isDetailExpanded(rowIndex, row);
    const external = this.table.expandedRowKeys();
    const key = this.table.data.rowKey(row);
    const others = external ? external.filter((candidate) => candidate !== key) : [];
    const expandedKeys = !external ? [] : expanded ? [...(this.table.detailRowAccordion() ? [] : others), key] : others;
    this.table.detailToggle.emit({row, expanded, expandedKeys});
  }

  /** Une ligne a le bouton : elle peut se déplier (`detailRowCanExpand`) et n'est pas épinglée. */
  hasDetailToggle(row: T): boolean {
    return this.rowCanExpand(row) && !this.table.render.pinnedInfo().has(row);
  }

  /** Voir `NgTableComponent.collapseAllDetails`. */
  collapseAllDetails(): void {
    if (this.internalExpandedKeys().size === 0) {
      return;
    }
    this.internalExpandedKeys.set(new Set());
    this.table.detailToggle.emit({row: null, expanded: false, expandedKeys: []});
    this.table.announce([this.table.effectiveLabels().announceAllCollapsed]);
  }

  /** Voir `NgTableComponent.expandedDetailCount`. */
  expandedDetailCount(): number {
    return this.internalExpandedKeys().size;
  }

  private rowCanExpand(row: T): boolean {
    const guard = this.table.detailRowCanExpand();
    return guard ? guard(row) : true;
  }

  /** Voir `NgTableComponent.isRowExpanded`. */
  isRowExpanded(row: T): boolean {
    return this.isDetailExpanded(0, row);
  }

  /**
   * La ligne détail est rendue dès qu'un gabarit est fourni : c'est `isDetailExpanded()` qui la montre ou la
   * cache, pas ce prédicat.
   */
  detailRowRenderWhen = (_index: number, row: TableItem<T>): boolean =>
    !!this.table.detailRowTemplate() && isDataItem(row) && !this.table.render.pinnedInfo().has(row);

  isDetailExpanded(index: number, row: T): boolean {
    if (!this.table.detailRowTemplate()) {
      return false;
    }

    const when = this.table.detailRowWhen();
    if (when) {
      return when(index, row);
    }

    if (!this.rowCanExpand(row)) {
      return false;
    }

    const key = this.table.data.rowKey(row);
    const externalKeys = this.table.expandedRowKeys();
    if (externalKeys) {
      return externalKeys.includes(key);
    }

    return this.internalExpandedKeys().has(key);
  }

  detailRowColspan(): number {
    return Math.max(1, this.table.columnLayout.displayedColumnIds().length || 1);
  }

  /** Uncontrolled mode = no external predicate nor external keys provided. */
  isUncontrolledDetailMode(): boolean {
    return !!this.table.detailRowTemplate() && !this.table.detailRowWhen() && !this.table.expandedRowKeys();
  }
}
