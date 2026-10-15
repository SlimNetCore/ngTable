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
export type {NgTableRowTransaction, NgTableTransactionResult} from './lib/live-rows';
export type {NgTableEditorKind} from './lib/cell-edit';
export type {RowDropPosition} from './lib/row-drag';
export {NgTableSparklineComponent} from './lib/ng-table-sparkline.component';
export type {NgTableSparklineOptions, SparklineType} from './lib/sparkline';
export {buildPivotModel, NgTablePivotComponent} from './lib/ng-table-pivot.component';
export type {NgTablePivotModel, NgTablePivotRow} from './lib/ng-table-pivot.component';
export {computePivot} from './lib/pivot';
export type {PivotAggregate, PivotConfig, PivotField, PivotResult, PivotRow, PivotValue} from './lib/pivot';
export {NgTableChartComponent} from './lib/ng-table-chart.component';
export {chartDataFromRange} from './lib/chart';
export type {NgTableChartData, NgTableChartSeries, NgTableChartType} from './lib/chart';
export {flattenNested, buildTreeIndex} from './lib/tree-data';
export type {TreeIndex} from './lib/tree-data';
export {buildPivotModelFromResult, NG_TABLE_PIVOT_LABELS_EN, NG_TABLE_PIVOT_LABELS_FR} from './lib/ng-table-pivot.component';
export type {NgTablePivotLabels} from './lib/ng-table-pivot.component';
export {configFromLayout, pivotFromServer, pivotRequestFor, pivotToServerResult, placeInLayout, removeFromLayout, setLayoutAggregate} from './lib/pivot';
export type {PivotDatasource, PivotLayout, PivotServerRequest, PivotServerResult, PivotServerRow, PivotZone} from './lib/pivot';
export {decimateIndices, panRange, rangeFromBrush, zoomRange} from './lib/chart-zoom';
export type {ViewRange} from './lib/chart-zoom';
export type {ZoomLabels} from './lib/ng-table-chart.component';
export {PIVOT_PATH_SEPARATOR, pivotCellKey, pivotColumnFields, pivotTotalKey} from './lib/pivot';
export {NG_TABLE_COLUMN_DRAG_TYPE} from './lib/column-drag';
export {NG_TABLE_MATERIAL_BRIDGE, NG_TABLE_THEME_DARK, NG_TABLE_THEME_LIGHT, NG_TABLE_TOKENS} from './lib/theme';
export type {NgTableTheme, NgTableToken} from './lib/theme';
