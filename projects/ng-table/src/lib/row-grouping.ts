/**
 * Regroupement de lignes et agrégats (mode local), en fonctions pures : constitution
 * des groupes, découpage en pages (un groupe replié compte pour une ligne), et calcul
 * des agrégats par colonne.
 */
import type {NgTableAggregate, NgTableColumn} from './ng-table.component';
import {toIsoDay} from './filter-matching';
import {compareSortValues, getSortValue, numericValue} from './row-pipeline';

/** Séparateur des clés d'un groupe imbriqué : la clé d'un sous-groupe est celle de son parent, ce séparateur, puis sa valeur. */
export const GROUP_PATH_SEPARATOR = '\u001f';

export interface RowGroup<T> {
  /** Clé stable du groupe (valeur de la colonne, en texte ; chemin complet pour un sous-groupe). */
  key: string;
  /** Valeur du groupe seule, sans les groupes parents (égale à key au premier niveau). */
  rawKey?: string;
  /** Niveau d'imbrication : 0 pour le premier niveau de regroupement. */
  depth?: number;
  /** Colonne de regroupement de ce niveau. */
  column?: NgTableColumn<T>;
  /** Sous-groupes (niveau suivant) ; absents sur le dernier niveau, qui porte les lignes. */
  children?: RowGroup<T>[];
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

  /** Niveau d'imbrication de l'en-tête (0 : premier niveau). */
  get depth(): number {
    return this.group.depth ?? 0;
  }
}

/** Unité de pagination : une ligne d'un groupe déplié, ou un groupe replié entier. */
export type GroupedUnit<T> =
  | { kind: 'row'; row: T; group: RowGroup<T>; path: RowGroup<T>[] }
  | { kind: 'collapsed'; group: RowGroup<T>; path: RowGroup<T>[] };

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
      group = {key, rawKey: key, value, rows: [], depth: 0, column};
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

/**
 * Mode `remote` : groupes formés par les lignes CONSÉCUTIVES de même valeur, dans
 * l'ordre reçu. Le serveur trie d'abord par la colonne de regroupement ; un groupe
 * coupé entre deux pages apparaît ainsi sur chacune.
 */
export function buildConsecutiveGroups<T>(rows: T[], column: NgTableColumn<T>): RowGroup<T>[] {
  const groups: RowGroup<T>[] = [];
  let current: RowGroup<T> | null = null;
  for (const row of rows) {
    const value = column.valueAccessor(row);
    const key = groupKeyOf(value);
    if (!current || current.key !== key) {
      current = {key, value, rows: []};
      groups.push(current);
    }
    current.rows.push(row);
  }
  return groups;
}

/**
 * Regroupe sur plusieurs niveaux : le premier niveau comme `buildGroups`, puis chaque groupe est lui-même regroupé par la
 * colonne suivante (croissant). Les lignes d'un groupe gardent l'ordre d'entrée ; chaque groupe porte toutes ses lignes
 * (descendantes comprises) pour le compte et les agrégats, et ses sous-groupes dans `children`.
 */
export function buildGroupTree<T>(rows: T[], columns: readonly NgTableColumn<T>[], descending: boolean, collator: Intl.Collator): RowGroup<T>[] {
  const build = (items: T[], depth: number, parent: RowGroup<T> | null): RowGroup<T>[] => {
    const groups = buildGroups(items, columns[depth], depth === 0 ? descending : false, collator);
    for (const group of groups) {
      group.depth = depth;
      if (parent) {
        group.rawKey = group.key;
        group.key = parent.key + GROUP_PATH_SEPARATOR + group.key;
      }
      if (depth + 1 < columns.length) {
        group.children = build(group.rows, depth + 1, group);
      }
    }
    return groups;
  };
  return columns.length === 0 ? [] : build(rows, 0, null);
}

/** Tous les groupes de l'arbre, de tous les niveaux. */
export function flattenGroups<T>(groups: readonly RowGroup<T>[]): RowGroup<T>[] {
  const all: RowGroup<T>[] = [];
  const visit = (group: RowGroup<T>) => {
    all.push(group);
    group.children?.forEach(visit);
  };
  groups.forEach(visit);
  return all;
}

/** Unités paginables : les lignes des groupes dépliés (feuilles), et une unité par groupe replié, quel que soit son niveau. */
export function groupedUnits<T>(groups: RowGroup<T>[], collapsedKeys: ReadonlySet<string>): GroupedUnit<T>[] {
  const units: GroupedUnit<T>[] = [];
  const walk = (group: RowGroup<T>, ancestors: RowGroup<T>[]) => {
    const path = [...ancestors, group];
    if (collapsedKeys.has(group.key)) {
      units.push({kind: 'collapsed', group, path});
    } else if (group.children) {
      for (const child of group.children) {
        walk(child, path);
      }
    } else {
      for (const row of group.rows) {
        units.push({kind: 'row', row, group, path});
      }
    }
  };
  for (const group of groups) {
    walk(group, []);
  }
  return units;
}

/**
 * Source de données de la table pour une page d'unités : un en-tête avant la première
 * ligne de chaque groupe présent sur la page (y compris un groupe commencé à la page
 * précédente, et ses parents), et l'en-tête seul pour un groupe replié.
 */
export function withGroupHeaders<T>(units: GroupedUnit<T>[]): (T | NgTableGroupRow<T>)[] {
  const items: (T | NgTableGroupRow<T>)[] = [];
  let current: RowGroup<T>[] = [];
  for (const unit of units) {
    let common = 0;
    while (common < current.length && common < unit.path.length && current[common] === unit.path[common]) {
      common++;
    }
    const last = unit.path.length - 1;
    for (let level = common; level <= last; level++) {
      items.push(new NgTableGroupRow(unit.path[level], unit.kind === 'collapsed' && level === last));
    }
    if (unit.kind === 'collapsed') {
      current = unit.path.slice(0, -1);
      continue;
    }
    current = unit.path;
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
    const value = numericValue(raw);
    if (value !== null) {
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

/** Résumé serveur d'un groupe, réduit à ce que le placement utilise. */
export interface RemoteGroupSummaryLike {
  key: string;
  count?: number;
}

/**
 * Mode `remote` avec groupes repliables : éléments d'une page renvoyée par le serveur.
 *
 * Contrat : le serveur exclut de la pagination les lignes des groupes repliés (un groupe
 * replié n'occupe aucune ligne), et fournit la liste ORDONNÉE de tous les groupes avec
 * leur nombre de lignes. La position d'un groupe replié dans la liste complète est donc
 * connue : le nombre de lignes des groupes dépliés qui le précèdent. Il est affiché sur
 * la page qui contient cette position (la dernière page s'il est en fin de liste).
 *
 * `pageStart` / `pageEnd` : bornes de la page en lignes (`pageEnd` = Infinity sans pagination).
 */
export function remoteGroupedPage<T>(
  rows: T[],
  column: NgTableColumn<T>,
  summaries: readonly RemoteGroupSummaryLike[],
  collapsedKeys: ReadonlySet<string>,
  pageStart: number,
  pageEnd: number,
): (T | NgTableGroupRow<T>)[] {
  const totalExpanded = summaries.reduce((total, summary) => total + (collapsedKeys.has(summary.key) ? 0 : (summary.count ?? 0)), 0);

  // Groupes repliés de cette page, avec l'index (dans la page) de la ligne qu'ils précèdent.
  const placements: { index: number; group: RowGroup<T> }[] = [];
  let position = 0;
  for (const summary of summaries) {
    if (!collapsedKeys.has(summary.key)) {
      position += summary.count ?? 0;
      continue;
    }
    const onThisPage = position >= pageStart && (position < pageEnd || position === totalExpanded);
    if (onThisPage) {
      placements.push({index: position - pageStart, group: {key: summary.key, value: summary.key, rows: []}});
    }
  }

  const items: (T | NgTableGroupRow<T>)[] = [];
  let next = 0;
  const flushCollapsedBefore = (index: number) => {
    while (next < placements.length && placements[next].index <= index) {
      items.push(new NgTableGroupRow(placements[next].group, true));
      next++;
    }
  };

  let rowIndex = 0;
  for (const group of buildConsecutiveGroups(rows, column)) {
    flushCollapsedBefore(rowIndex);
    items.push(new NgTableGroupRow(group, false));
    for (const row of group.rows) {
      items.push(row);
      rowIndex++;
    }
  }
  flushCollapsedBefore(Number.POSITIVE_INFINITY);
  return items;
}
