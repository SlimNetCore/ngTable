/**
 * Pipeline local des lignes (mode `dataMode='local'`) : filtre par colonne, texte de
 * recherche globale et tri multi-niveaux, en fonctions pures sans dépendance Angular.
 * Le composant se contente d'enchaîner ces fonctions dans ses `computed`.
 */
import type {NgTableColumn} from './ng-table.component';
import {
  matchesBoolean,
  matchesDate,
  matchesNumberExpression,
  matchesNumberRange,
  matchesText,
  normalizeSearchText,
  toIsoDay,
} from './filter-matching';

/** Valeur comparable d'une cellule pour le tri. */
export type SortValue = string | number | Date | boolean | null;

/** Un niveau de tri résolu : la colonne, et 1 (croissant) ou -1 (décroissant). */
export interface SortLevel<T> {
  column: NgTableColumn<T>;
  factor: number;
}

/** La ligne passe-t-elle tous les filtres non vides des colonnes données ? */
export function matchesAllFilters<T>(row: T, columns: readonly NgTableColumn<T>[], filters: Record<string, string>): boolean {
  for (const column of columns) {
    const filterValue = (filters[column.id] ?? '').trim();
    if (filterValue && !matchesColumnFilter(row, column, filterValue)) {
      return false;
    }
  }
  return true;
}

/** Filtre par défaut d'une colonne (ou son `filterPredicate`), selon le type de filtre et la valeur. */
export function matchesColumnFilter<T>(row: T, column: NgTableColumn<T>, filterValue: string): boolean {
  if (column.filterPredicate) {
    return column.filterPredicate(row, filterValue);
  }

  const raw = column.valueAccessor(row);
  if (raw === null || raw === undefined) {
    return false;
  }

  const filterType = column.filter?.type;
  if (filterType === 'date' || filterType === 'range') {
    return matchesDate(raw, filterValue, filterType);
  }
  if (typeof raw === 'boolean') {
    return matchesBoolean(raw, filterValue);
  }
  if (filterType === 'enum') {
    // Le filtre `enum` est un multi-select sérialisé en CSV ("A,B") : la cellule
    // doit égaler l'UNE des valeurs cochées — pas "contenir" la chaîne entière,
    // ce qui ne matchait plus aucune ligne dès 2 valeurs cochées.
    const cell = `${raw}`.toLowerCase();
    return filterValue.split(',').some((value) => value.trim().toLowerCase() === cell);
  }
  if (filterType === 'numberRange') {
    return matchesNumberRange(raw, filterValue) ?? true;
  }
  if (filterType === 'number' || typeof raw === 'number') {
    const numeric = matchesNumberExpression(raw, filterValue);
    if (numeric !== null) {
      return numeric;
    }
  }
  return matchesText(raw, filterValue, column.filter?.operator);
}

/** Texte normalisé d'une ligne pour la recherche globale (colonnes données, séparées par un saut de ligne). */
export function searchText<T>(row: T, columns: readonly NgTableColumn<T>[]): string {
  return columns
    .map((column) => {
      const value = typeof column.searchable === 'function' ? column.searchable(row) : column.valueAccessor(row);
      return normalizeSearchText(value instanceof Date ? toIsoDay(value) : value);
    })
    .join('\n');
}

export function getSortValue<T>(row: T, column: NgTableColumn<T>): SortValue {
  if (column.sortValueAccessor) {
    return column.sortValueAccessor(row) ?? null;
  }
  const raw = column.valueAccessor(row);
  if (raw instanceof Date || typeof raw === 'boolean' || typeof raw === 'number' || typeof raw === 'string') {
    return raw;
  }
  return raw === null || raw === undefined ? null : `${raw}`;
}

/**
 * Ordre croissant de deux valeurs de tri : les vides en dernier, les dates par
 * horodatage, les nombres numériquement, le texte avec `collator` (tri « naturel »).
 */
export function compareSortValues(left: SortValue, right: SortValue, collator: Intl.Collator): number {
  if (left === right) {
    return 0;
  }
  if (left === null || left === undefined) {
    return 1;
  }
  if (right === null || right === undefined) {
    return -1;
  }

  if (left instanceof Date || right instanceof Date) {
    const leftTime = toComparableDateValue(left);
    const rightTime = toComparableDateValue(right);
    if (Number.isNaN(leftTime) && Number.isNaN(rightTime)) {
      return 0;
    }
    if (Number.isNaN(leftTime)) {
      return 1;
    }
    if (Number.isNaN(rightTime)) {
      return -1;
    }
    return leftTime - rightTime;
  }

  if (typeof left === 'boolean' || typeof right === 'boolean') {
    return Number(left) - Number(right);
  }
  if (typeof left === 'number' && typeof right === 'number') {
    return left - right;
  }
  return collator.compare(`${left}`, `${right}`);
}

/**
 * Tri multi-niveaux, stable (à égalité, l'ordre d'origine est conservé), cellules vides
 * toujours en dernier quel que soit le sens. Les clés de
 * tri sont calculées une fois par ligne, et non à chaque comparaison (~n·log n appels
 * aux accessors sinon). Renvoie un nouveau tableau ; sans niveau, le tableau d'entrée.
 */
export function sortRows<T>(rows: T[], levels: readonly SortLevel<T>[], collator: Intl.Collator): T[] {
  if (levels.length === 0) {
    return rows;
  }
  const keyed = rows.map((row, index) => ({row, index, keys: levels.map((level) => getSortValue(row, level.column))}));
  keyed.sort((left, right) => {
    for (let i = 0; i < levels.length; i++) {
      const leftEmpty = isEmpty(left.keys[i]);
      const rightEmpty = isEmpty(right.keys[i]);
      // Les cellules vides restent en fin de liste dans les deux sens de tri : inverser
      // la comparaison les ferait remonter en tête d'un tri décroissant.
      if (leftEmpty !== rightEmpty) {
        return leftEmpty ? 1 : -1;
      }
      const result = compareSortValues(left.keys[i], right.keys[i], collator);
      if (result !== 0) {
        return result * levels[i].factor;
      }
    }
    return left.index - right.index;
  });
  return keyed.map((entry) => entry.row);
}

function isEmpty(value: SortValue): boolean {
  return value === null || value === undefined;
}

function toComparableDateValue(value: string | number | Date | boolean): number {
  if (value instanceof Date) {
    return value.getTime();
  }
  if (typeof value === 'string' || typeof value === 'number') {
    return new Date(value).getTime();
  }
  return Number.NaN;
}
