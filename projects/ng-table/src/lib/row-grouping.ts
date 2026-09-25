/**
 * Regroupement de lignes et agrégats (mode local), en fonctions pures : constitution
 * des groupes, découpage en pages (un groupe replié compte pour une ligne), et calcul
 * des agrégats par colonne.
 */
import type {NgTableAggregate, NgTableColumn} from './ng-table.component';
import {toIsoDay} from './filter-matching';
import {compareSortValues, getSortValue} from './row-pipeline';

export interface RowGroup<T> {
  /** Clé stable du groupe (valeur de la colonne, en texte). */
  key: string;
  /** Valeur de regroupement (valeur de la cellule). */
  value: unknown;
  /** Toutes les lignes du groupe (après filtres), pour le compte et les agrégats. */
  rows: T[];
}

/**
 * Élément « en-tête de groupe » inséré dans la source de données de la table, entre
 * les lignes. Classe (et non simple objet) pour que `instanceof` le distingue sans
 * ambiguïté des lignes de l'application.
 */
export class NgTableGroupRow<T> {
  constructor(
    readonly group: RowGroup<T>,
    readonly collapsed: boolean,
  ) {}
}

/** Unité de pagination : une ligne d'un groupe déplié, ou un groupe replié entier. */
export type GroupedUnit<T> = { kind: 'row'; row: T; group: RowGroup<T> } | { kind: 'collapsed'; group: RowGroup<T> };

/** Clé de regroupement d'une valeur : jour ISO pour une date, texte sinon, `''` si vide. */
export function groupKeyOf(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  return value instanceof Date ? toIsoDay(value) : `${value}`;
}

/**
 * Regroupe les lignes (déjà filtrées et triées) par la valeur de `column`. Les groupes
 * sont triés par leur valeur (décroissant si `descending`), le groupe « vide » en
 * dernier ; dans un groupe, les lignes gardent leur ordre d'entrée (donc le tri courant).
 */
export function buildGroups<T>(rows: T[], column: NgTableColumn<T>, descending: boolean, collator: Intl.Collator): RowGroup<T>[] {
  const byKey = new Map<string, RowGroup<T>>();
  for (const row of rows) {
    const value = column.valueAccessor(row);
    const key = groupKeyOf(value);
    let group = byKey.get(key);
    if (!group) {
      group = {key, value, rows: []};
      byKey.set(key, group);
    }
    group.rows.push(row);
  }
  const factor = descending ? -1 : 1;
  return [...byKey.values()].sort((left, right) => {
    if ((left.key === '') !== (right.key === '')) {
      return left.key === '' ? 1 : -1;
    }
    return compareSortValues(getSortValue(left.rows[0], column), getSortValue(right.rows[0], column), collator) * factor;
  });
}

/** Unités paginables : les lignes des groupes dépliés, et une unité par groupe replié. */
export function groupedUnits<T>(groups: RowGroup<T>[], collapsedKeys: ReadonlySet<string>): GroupedUnit<T>[] {
  const units: GroupedUnit<T>[] = [];
  for (const group of groups) {
    if (collapsedKeys.has(group.key)) {
      units.push({kind: 'collapsed', group});
    } else {
      for (const row of group.rows) {
        units.push({kind: 'row', row, group});
      }
    }
  }
  return units;
}

/**
 * Source de données de la table pour une page d'unités : un en-tête avant la première
 * ligne de chaque groupe présent sur la page (y compris un groupe commencé à la page
 * précédente), et l'en-tête seul pour un groupe replié.
 */
export function withGroupHeaders<T>(units: GroupedUnit<T>[]): (T | NgTableGroupRow<T>)[] {
  const items: (T | NgTableGroupRow<T>)[] = [];
  let current: RowGroup<T> | null = null;
  for (const unit of units) {
    if (unit.kind === 'collapsed') {
      items.push(new NgTableGroupRow(unit.group, true));
      current = null;
      continue;
    }
    if (unit.group !== current) {
      items.push(new NgTableGroupRow(unit.group, false));
      current = unit.group;
    }
    items.push(unit.row);
  }
  return items;
}

/** Agrégat d'une colonne sur des lignes ; `null` si la colonne n'en déclare pas ou s'il n'y a rien à agréger. */
export function computeAggregate<T>(column: NgTableColumn<T>, rows: readonly T[]): unknown {
  const aggregate: NgTableAggregate<T> | undefined = column.aggregate;
  if (!aggregate) {
    return null;
  }
  if (typeof aggregate === 'function') {
    return aggregate(rows);
  }
  if (aggregate === 'count') {
    return rows.length;
  }
  const numbers: number[] = [];
  for (const row of rows) {
    const raw = column.valueAccessor(row);
    const value = typeof raw === 'number' ? raw : Number.parseFloat(`${raw ?? ''}`.replace(',', '.'));
    if (Number.isFinite(value)) {
      numbers.push(value);
    }
  }
  if (numbers.length === 0) {
    return null;
  }
  switch (aggregate) {
    case 'sum':
      return numbers.reduce((total, value) => total + value, 0);
    case 'avg':
      return numbers.reduce((total, value) => total + value, 0) / numbers.length;
    case 'min':
      return numbers.reduce((min, value) => Math.min(min, value));
    case 'max':
      return numbers.reduce((max, value) => Math.max(max, value));
  }
}
