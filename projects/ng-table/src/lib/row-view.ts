import type {NgTableColumn} from './ng-table.component';

/** Ce que le template affiche pour une cellule, calculé une fois par ligne et par colonne. */
export interface NgTableCellView<T> {
  /** `column.valueAccessor(row)`. */
  value: unknown;
  /** La valeur en texte (tooltip de troncature) : `''` si nulle. */
  text: string;
  /** Texte copié par le bouton de copie ; `''` = pas de bouton. */
  copyText: string;
  /** Contexte de `column.cellTemplate`, avec une référence stable d'un rendu à l'autre. */
  context: { $implicit: T; row: T; value: unknown; column: NgTableColumn<T> };
}

export type NgTableRowClasses = string | string[] | Record<string, boolean>;

/** Valeur copiée par le bouton de copie d'une cellule (`''` si la colonne n'en a pas). */
export function copyText<T>(column: NgTableColumn<T>, row: T): string {
  if (!column.copy) {
    return '';
  }
  const accessor = typeof column.copy === 'object' && column.copy.valueAccessor ? column.copy.valueAccessor : column.valueAccessor;
  return `${accessor(row) ?? ''}`.trim();
}

export function buildCellView<T>(row: T, column: NgTableColumn<T>): NgTableCellView<T> {
  const value = column.valueAccessor(row);
  return {
    value,
    text: value === null || value === undefined ? '' : String(value),
    copyText: copyText(column, row),
    context: {$implicit: row, row, value, column},
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
): Map<T, NgTableRowView<T>> {
  const views = new Map<T, NgTableRowView<T>>();
  for (const row of rows) {
    if (views.has(row)) {
      continue;
    }
    const cells = new Map<string, NgTableCellView<T>>();
    for (const column of columns) {
      cells.set(column.id, buildCellView(row, column));
    }
    views.set(row, {cells, classes: rowClassFn?.(row) ?? ''});
  }
  return views;
}
