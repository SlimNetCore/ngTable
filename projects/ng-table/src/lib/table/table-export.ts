import {computed, signal} from '@angular/core';
import {downloadFile, ExportCell, toCsv, XLSX_MIME} from '../export-writers';
import type {StyledXlsxCell, StyledXlsxOptions} from '../xlsx-styled';
import {toExportCell} from './internals';
import type {NgTableComponent} from '../ng-table.component';

/** Export : dialogue, plage de pages, matrices CSV et Excel. */
export class TableExport<T> {
  constructor(private readonly table: NgTableComponent<T>) {}

  readonly exportFromPage = signal(1);
  readonly exportToPage = signal(1);

  /**
   * Total number of locally-exportable "pages" (>= 1). Based on the filtered/sorted
   * row count and `pageSize()`; always `1` when pagination isn't tracked (there is
   * only one "page": everything), so the export dialog only asks for a page range
   * when it's actually meaningful.
   */
  readonly exportTotalPages = computed(() => {
    if (!this.table.paging.pagingActive()) {
      return 1;
    }
    const size = this.table.pageSize();
    if (!size || size <= 0) {
      return 1;
    }
    return Math.max(1, Math.ceil(this.table.data.filteredSortedRows().length / size));
  });

  /** Voir `NgTableComponent.openExportDialog`. */
  openExportDialog(): void {
    if (this.table.exportMode() === 'remote') {
      this.table.remoteExportRequested.emit({
        ...this.table.query.buildRemoteQuery(this.table.pageIndex(), this.table.pageSize()),
        columns: this.exportColumns().map((column) => ({id: column.id, header: column.header})),
        format: this.table.exportFormat(),
        filename: this.table.exportFilename(),
      });
      return;
    }

    const total = this.exportTotalPages();
    if (total <= 1) {
      this.exportLocalRange(1, 1);
      return;
    }
    this.exportFromPage.set(1);
    this.exportToPage.set(total);
  }

  /** Confirms the page-range dialog and triggers the local CSV export. */
  confirmExportDialog(): void {
    const total = this.exportTotalPages();
    const from = Math.min(Math.max(1, Math.round(this.exportFromPage()) || 1), total);
    const to = Math.min(Math.max(from, Math.round(this.exportToPage()) || from), total);
    this.exportLocalRange(from, to);
    this.table.announce([this.table.effectiveLabels().announceExportStarted]);
  }

  private exportLocalRange(fromPage: number, toPage: number): void {
    const allRows = this.table.data.filteredSortedRows();
    const size = this.table.paging.pagingActive() && this.table.pageSize() > 0 ? this.table.pageSize() : allRows.length || 1;
    const rows = this.table.paging.pagingActive() ? allRows.slice((fromPage - 1) * size, toPage * size) : allRows;

    const matrix = this.buildExportMatrix(rows);
    const filename = this.table.exportFilename();
    if (this.table.exportFormat() === 'xlsx') {
      // L'écriture Excel est chargée à la demande : elle ne pèse pas sur une application qui n'exporte pas en `.xlsx`.
      // Les données sont figées ici ; le fichier part dès que le module est là.
      const plain = this.table.exportXlsxStyle() === 'plain';
      const styled = plain ? null : {cells: this.buildStyledExportMatrix(rows), options: this.styledXlsxOptions()};
      void import('../xlsx-export').then(({toXlsx, toStyledXlsx}) => {
        const content = styled ? toStyledXlsx(styled.cells, styled.options) : toXlsx(matrix);
        downloadFile(content as BlobPart, `${filename}.xlsx`, XLSX_MIME);
        this.table.localExportCompleted.emit({fromPage, toPage, rowCount: rows.length});
      });
      return;
    }
    // BOM UTF-8 : sans lui, Excel interprète le CSV en Latin-1 et corrompt les accents.
    downloadFile('﻿' + toCsv(matrix), `${filename}.csv`, 'text/csv;charset=utf-8;');
    this.table.localExportCompleted.emit({fromPage, toPage, rowCount: rows.length});
  }

  /** Colonnes exportées (local et remote) : visibles, dans l'ordre affiché, hors `exportable: false`. */
  private readonly exportColumns = computed(() => this.table.columnLayout.visibleColumns().filter((column) => column.exportable !== false));

  /** Comme `buildExportMatrix`, mais les dates restent des dates (écrites en vraies dates Excel). */
  private buildStyledExportMatrix(rows: readonly T[]): StyledXlsxCell[][] {
    const exportColumns = this.exportColumns();
    const matrix: StyledXlsxCell[][] = [exportColumns.map((column) => column.header)];
    for (const row of rows) {
      matrix.push(
        exportColumns.map((column) => {
          const value = column.exportValueAccessor ? column.exportValueAccessor(row) : column.valueAccessor(row);
          return value instanceof Date && !Number.isNaN(value.getTime()) ? value : toExportCell(value);
        }),
      );
    }
    return matrix;
  }

  /** Options du classeur stylé : celles du parent, l'accent du thème pour l'en-tête, la mise en forme propre à chaque colonne. */
  private styledXlsxOptions(): StyledXlsxOptions {
    const given = this.table.exportXlsxOptions() ?? {};
    const accent = getComputedStyle(this.table.hostElement.nativeElement).getPropertyValue('--ngt-primary').trim();
    return {
      sheetName: this.table.exportFilename(),
      ...(accent && !given.headerFill ? {headerFill: accent} : {}),
      ...given,
      columns: this.exportColumns().map((column) => column.excel),
    };
  }

  /** En-têtes puis une ligne par enregistrement ; valeurs typées (le CSV les convertit en texte). */
  private buildExportMatrix(rows: readonly T[]): ExportCell[][] {
    const exportColumns = this.exportColumns();
    const matrix: ExportCell[][] = [exportColumns.map((column) => column.header)];
    for (const row of rows) {
      matrix.push(
        exportColumns.map((column) =>
          toExportCell(column.exportValueAccessor ? column.exportValueAccessor(row) : column.valueAccessor(row)),
        ),
      );
    }
    return matrix;
  }
}
