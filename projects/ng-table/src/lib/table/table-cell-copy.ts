import {signal} from '@angular/core';
import {copyText} from '../row-view';
import type {NgTableColumn} from '../ng-table.models';
import {defaultRowKey} from './internals';
import type {NgTableComponent} from '../ng-table.component';

/** Copie de la valeur d'une cellule. */
export class TableCellCopy<T> {
  constructor(private readonly table: NgTableComponent<T>) {}

  private readonly copiedCellKey = signal<string | null>(null);

  copyTooltip(column: NgTableColumn<T>): string {
    if (typeof column.copy === 'object' && column.copy.tooltip) {
      return column.copy.tooltip;
    }
    return this.table.effectiveLabels().copy;
  }

  copyIconName(column: NgTableColumn<T>, row: T, rowIndex: number): string {
    const key = this.copyCellKey(column, row, rowIndex);
    return this.copiedCellKey() === key ? 'check' : 'content_copy';
  }

  onCopyCellValue(event: MouseEvent, column: NgTableColumn<T>, row: T, rowIndex: number): void {
    event.stopPropagation();
    const value = copyText(column, row);
    if (!value) {
      return;
    }

    const key = this.copyCellKey(column, row, rowIndex);
    navigator.clipboard.writeText(value)
      .catch(() => undefined)
      .finally(() => {
        this.table.announce([this.table.effectiveLabels().announceCopied]);
        this.copiedCellKey.set(key);
        setTimeout(() => {
          if (this.copiedCellKey() === key) {
            this.copiedCellKey.set(null);
          }
        }, 1400);
      });

    this.table.cellCopied.emit({columnId: column.id, value, row});
  }

  private copyCellKey(column: NgTableColumn<T>, row: T, rowIndex: number): string {
    const key = defaultRowKey(row);
    // Pas d'id : l'index (la ligne elle-même donnerait "[object Object]" pour toutes).
    const rowId = key === row ? rowIndex : key;
    return `${column.id}:${rowId}`;
  }
}
