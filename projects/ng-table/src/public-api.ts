/*
 * Public API Surface of ng-table
 */

export * from './lib/ng-table.component';
export * from './lib/ng-table-labels';
export * from './lib/ng-table-paginator-intl';
// Apparaît dans l'API publique (`NgTableFilterConfig.type`) : doit être importable.
export type {ColumnFilterType} from './lib/column-filter-renderer.component';
export type {NgTableTextOperator} from './lib/filter-matching';
export type {NgTableExportFormat} from './lib/export-writers';
