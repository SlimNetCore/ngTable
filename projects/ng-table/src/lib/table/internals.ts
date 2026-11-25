import {NgTableGroupRow} from '../row-grouping';
import {NgTableSpacerRow} from '../virtual-window';
import {NgTableLoadingRow} from '../block-cache';
import {ExportCell} from '../export-writers';

export type TableItem<T> = T | NgTableGroupRow<T> | NgTableSpacerRow | NgTableLoadingRow;

export function toExportCell(value: unknown): ExportCell {
  if (value === null || value === undefined) {
    return null;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  return typeof value === 'number' || typeof value === 'boolean' ? value : String(value);
}

/**
 * Clé d'une ligne quand aucun `rowKeyAccessor` n'est fourni : `row.id`, sinon
 * `row.ID`, sinon la ligne elle-même (référence d'objet).
 */
export function defaultRowKey(row: unknown): unknown {
  const record = typeof row === 'object' && row !== null ? (row as { id?: unknown; ID?: unknown }) : null;
  return record?.id ?? record?.ID ?? row;
}

/** Largeur mini d'une colonne sans `minWidthPx` : redimensionnement, et largeur mini du tableau. */
export const DEFAULT_MIN_COLUMN_WIDTH_PX = 120;

export function isDataItem<T>(item: TableItem<T>): item is T {
  return !(item instanceof NgTableGroupRow) && !(item instanceof NgTableSpacerRow) && !(item instanceof NgTableLoadingRow);
}

/** Jointure des niveaux de regroupement pour détecter un changement. */
export const GROUP_LEVELS_JOIN = '\u001f';

/** Clé de la recherche globale dans le flux debouncé des saisies et dans la barre des filtres actifs. */
export const GLOBAL_SEARCH_KEY = '__global_search__';
