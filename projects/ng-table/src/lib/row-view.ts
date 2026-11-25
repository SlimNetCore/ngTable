import type {NgTableColumn} from './ng-table.models';

/** Ce que le template affiche pour une cellule, calculé une fois par ligne et par colonne. */
export interface NgTableCellView<T> {
  /** `column.valueAccessor(row)`. */
  value: unknown;
  /** Le texte affiché (et celui de la bulle de troncature) : la valeur, mise en forme si la colonne le demande ; `''` si nulle. */
  text: string;
  /** Ce que la cellule affiche : la valeur brute, ou son texte mis en forme (`numberFormat`, `dateFormat`). */
  display: unknown;
  /** Texte copié par le bouton de copie ; `''` = pas de bouton. */
  copyText: string;
  /** Contexte de `column.cellTemplate`, avec une référence stable d'un rendu à l'autre. */
  context: { $implicit: T; row: T; value: unknown; column: NgTableColumn<T> };
  /** Surbrillance après un changement de valeur (mode live, ex. `up-0`), `''` sinon. */
  flash: string;
}

export type NgTableRowClasses = string | string[] | Record<string, boolean>;

/** Vue d'une cellule sans contenu (colonne d'espacement de la virtualisation horizontale). */
export const EMPTY_CELL_VIEW: NgTableCellView<unknown> = {
  value: null,
  display: null,
  text: '',
  copyText: '',
  context: {$implicit: null, row: null, value: null, column: {id: '', header: '', valueAccessor: () => null}},
  flash: '',
};

/** Valeur copiée par le bouton de copie d'une cellule (`''` si la colonne n'en a pas). */
export function copyText<T>(column: NgTableColumn<T>, row: T): string {
  if (!column.copy) {
    return '';
  }
  const accessor = typeof column.copy === 'object' && column.copy.valueAccessor ? column.copy.valueAccessor : column.valueAccessor;
  return `${accessor(row) ?? ''}`.trim();
}

const numberFormats = new WeakMap<object, Intl.NumberFormat>();
const dateFormats = new WeakMap<object, Intl.DateTimeFormat>();

/**
 * Texte affiché d'une valeur selon `column.numberFormat` / `column.dateFormat` (langue du navigateur). La valeur
 * elle-même n'est pas touchée : tri, filtres, export et copie continuent de la lire telle quelle.
 */
export function formatCellValue<T>(column: NgTableColumn<T>, value: unknown): unknown {
  if (column.numberFormat && typeof value === 'number' && Number.isFinite(value)) {
    let format = numberFormats.get(column);
    if (!format) {
      format = new Intl.NumberFormat(undefined, column.numberFormat === true ? {maximumFractionDigits: 2} : column.numberFormat);
      numberFormats.set(column, format);
    }
    return format.format(value);
  }
  if (column.dateFormat && value !== null && value !== undefined && value !== '') {
    const date = value instanceof Date ? value : typeof value === 'string' || typeof value === 'number' ? new Date(value) : null;
    if (date && !Number.isNaN(date.getTime())) {
      let format = dateFormats.get(column);
      if (!format) {
        format = new Intl.DateTimeFormat(undefined, column.dateFormat === true ? {dateStyle: 'medium'} : column.dateFormat);
        dateFormats.set(column, format);
      }
      return format.format(date);
    }
  }
  return value;
}

export function buildCellView<T>(row: T, column: NgTableColumn<T>, flash = ''): NgTableCellView<T> {
  const value = column.valueAccessor(row);
  const display = column.numberFormat || column.dateFormat ? formatCellValue(column, value) : value;
  return {
    value,
    display,
    text: display === null || display === undefined ? '' : String(display),
    copyText: copyText(column, row),
    context: {$implicit: row, row, value, column},
    flash,
  };
}

/** Modèle de vue d'une ligne : ses cellules (par id de colonne) et ses classes CSS. */
export interface NgTableRowView<T> {
  cells: Map<string, NgTableCellView<T>>;
  classes: NgTableRowClasses;
}

/**
 * Modèle de vue des lignes rendues, pour les colonnes visibles. Le composant l'appelle
 * dans un `computed` : les signaux lus par `valueAccessor` ou `rowClassFn` (langue,
 * ligne mise en évidence...) sont donc suivis et le recalculent. Une détection de
 * changements sans rapport (sélection, menu, bouton « copié »...) relit le résultat
 * sans rien rappeler.
 */
export function buildRowViews<T>(
  rows: readonly T[],
  columns: readonly NgTableColumn<T>[],
  rowClassFn: ((row: T) => NgTableRowClasses | null) | null,
  flashClass: ((row: T, column: NgTableColumn<T>) => string) | null = null,
): Map<T, NgTableRowView<T>> {
  const views = new Map<T, NgTableRowView<T>>();
  for (const row of rows) {
    if (views.has(row)) {
      continue;
    }
    const cells = new Map<string, NgTableCellView<T>>();
    for (const column of columns) {
      cells.set(column.id, buildCellView(row, column, flashClass ? flashClass(row, column) : ''));
    }
    views.set(row, {cells, classes: rowClassFn?.(row) ?? ''});
  }
  return views;
}
