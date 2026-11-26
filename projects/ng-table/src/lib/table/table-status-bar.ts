import {computed} from '@angular/core';
import {chartDataFromRange, NgTableChartData} from '../chart';
import {computeRangeStats, RangeStats} from '../range-stats';
import type {NgTableComponent} from '../ng-table.component';

/** Barre d'état : décomptes et statistiques de la plage sélectionnée. */
export class TableStatusBar<T> {
  constructor(private readonly table: NgTableComponent<T>) {}

  private readonly statusNumberFormat = new Intl.NumberFormat(undefined, {maximumFractionDigits: 2});

  /** Lignes affichées après filtres, et lignes au total (hors lignes épinglées). */
  private readonly statusCounts = computed(() => {
    if (this.table.remote.blockMode()) {
      this.table.remote.blockVersion();
      const total = this.table.remote.blockCache.totalCount ?? 0;
      return {shown: total, total};
    }
    if (this.table.dataMode() === 'remote') {
      const total = this.table.totalCount() ?? this.table.rows().length;
      return {shown: total, total};
    }
    return {shown: this.table.data.filteredSortedRows().length, total: this.table.data.syncedStore().size};
  });

  readonly statusRowsText = computed(() => {
    const {shown, total} = this.statusCounts();
    const labels = this.table.effectiveLabels();
    const format = (n: number) => this.statusNumberFormat.format(n);
    return shown === total
      ? labels.statusRows.replace('{count}', format(shown))
      : labels.statusRowsOf.replace('{count}', format(shown)).replace('{total}', format(total));
  });

  /** Statistiques de la plage sélectionnée (barre d'état) : `null` sans plage. */
  readonly rangeStats = computed<RangeStats | null>(() => {
    const bounds = this.table.statusBar() ? this.table.range.rangeBounds() : null;
    if (!bounds) {
      return null;
    }
    const rows = this.table.paging.displayedRows().slice(bounds.row1, bounds.row2 + 1);
    const columns = this.table.columnLayout.visibleColumns().slice(bounds.col1, bounds.col2 + 1);
    const values: unknown[] = [];
    for (const row of rows) {
      for (const column of columns) {
        values.push(column.valueAccessor(row));
      }
    }
    return computeRangeStats(values);
  });

  /** Voir `NgTableComponent.rangeChartData`. */
  readonly rangeChartData = computed<NgTableChartData | null>(() => {
    const bounds = this.table.range.rangeBounds();
    if (!bounds) {
      return null;
    }
    const rows = this.table.paging.displayedRows().slice(bounds.row1, bounds.row2 + 1);
    return chartDataFromRange(rows, this.table.columnLayout.visibleColumns().slice(bounds.col1, bounds.col2 + 1));
  });

  formatStat(value: number | null): string {
    return value === null ? '' : this.statusNumberFormat.format(value);
  }

  statusText(template: string, count: number): string {
    return template.replace('{count}', this.statusNumberFormat.format(count));
  }
}
