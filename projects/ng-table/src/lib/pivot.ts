/**
 * Tableau croisé dynamique (pivot) : regroupe des lignes par une ou plusieurs colonnes,
 * étale les valeurs d'une colonne en colonnes, et agrège. Fonctions pures, sans Angular.
 */
import {numericCellValue} from './range-stats';

export type PivotAggregate = 'sum' | 'avg' | 'min' | 'max' | 'count';

export interface PivotField<T> {
  id: string;
  header: string;
  /** Lit la valeur d'une ligne. Inutile quand le pivot est calculé par le serveur (`datasource`). */
  accessor?: (row: T) => unknown;
}

export interface PivotValue<T> extends PivotField<T> {
  /** `sum` par défaut. `count` compte les lignes, les autres lisent la valeur comme un nombre. */
  aggregate?: PivotAggregate;
}

export interface PivotConfig<T> {
  /** Colonnes qui définissent les lignes du pivot (une ou plusieurs, de la plus externe à la plus interne). */
  rows: PivotField<T>[];
  /** Colonne dont chaque valeur distincte devient une colonne du pivot. Sans elle : une colonne par valeur agrégée. */
  columns?: PivotField<T> | null;
  /** Valeurs à agréger. */
  values: PivotValue<T>[];
  /** Colonne « Total » à droite (avec `columns`). `true` par défaut. */
  rowTotals?: boolean;
  /** Ligne « Total » en bas. `true` par défaut. */
  grandTotal?: boolean;
  /** Libellé des totaux. */
  totalLabel?: string;
  /** Ordre des valeurs de `columns`. `asc` par défaut. */
  columnSort?: 'asc' | 'desc';
}

export interface PivotRow {
  key: string;
  /** Une valeur par champ de `rows`. */
  labels: string[];
  /** Valeur agrégée par cellule : voir `pivotCellKey`. `null` quand aucune ligne ne correspond. */
  cells: Record<string, number | null>;
}

export interface PivotResult {
  /** Valeurs distinctes de la colonne pivot, triées ; `['']` sans colonne pivot. */
  columnKeys: string[];
  rows: PivotRow[];
  grandTotal: PivotRow | null;
}

/** Clé d'une cellule de valeur : colonne pivot + valeur agrégée. */
export function pivotCellKey(columnKey: string, valueId: string): string {
  return `${columnKey}\u0000${valueId}`;
}

/** Clé d'un total de ligne (toutes les colonnes pivot) pour une valeur agrégée. */
export function pivotTotalKey(valueId: string): string {
  return `\u0001total\u0001${valueId}`;
}

class Accumulator {
  rows = 0;
  count = 0;
  sum = 0;
  min = Infinity;
  max = -Infinity;

  add(value: unknown): void {
    this.rows++;
    const number = typeof value === 'number' ? (Number.isFinite(value) ? value : null) : numericCellValue(value);
    if (number !== null) {
      this.count++;
      this.sum += number;
      if (number < this.min) {
        this.min = number;
      }
      if (number > this.max) {
        this.max = number;
      }
    }
  }

  /** Ajoute tout ce qu'a vu `other` : sommes, nombres, extrêmes. */
  merge(other: Accumulator): void {
    this.rows += other.rows;
    this.count += other.count;
    this.sum += other.sum;
    if (other.min < this.min) {
      this.min = other.min;
    }
    if (other.max > this.max) {
      this.max = other.max;
    }
  }

  result(aggregate: PivotAggregate): number | null {
    switch (aggregate) {
      case 'count':
        return this.rows;
      case 'sum':
        return this.count === 0 ? null : this.sum;
      case 'avg':
        return this.count === 0 ? null : this.sum / this.count;
      case 'min':
        return this.count === 0 ? null : this.min;
      case 'max':
        return this.count === 0 ? null : this.max;
    }
  }
}

const labelOf = (value: unknown): string => (value === null || value === undefined ? '' : String(value));

/**
 * Calcule le pivot. Chaque ligne est lue une seule fois et ne touche qu'un accumulateur par valeur :
 * les totaux de ligne et le total général se déduisent ensuite des accumulateurs (une moyenne est
 * recombinée à partir de sommes et de nombres, jamais de moyennes). Un million de lignes en
 * moins d'une seconde.
 */
export function computePivot<T>(rows: readonly T[], config: PivotConfig<T>): PivotResult {
  const collator = new Intl.Collator(undefined, {numeric: true, sensitivity: 'base'});
  const columnField = config.columns ?? null;
  const valueCount = config.values.length;

  interface Group {
    labels: string[];
    /** Accumulateur de chaque cellule : `cells[colonne * valueCount + valeur]` (éventuellement absent). */
    cells: (Accumulator | undefined)[];
  }
  const groups = new Map<string, Group>();
  const columnIndex = new Map<string, number>();
  const columnList: string[] = [];

  const rowAccessors = config.rows.map((field) => field.accessor ?? (() => undefined));
  const columnAccessor = columnField?.accessor ?? (() => undefined);
  const valueAccessors = config.values.map((value) => value.accessor ?? (() => undefined));
  const fieldCount = rowAccessors.length;
  const labelBuffer: string[] = new Array<string>(fieldCount);

  for (const row of rows) {
    let groupKey = '';
    if (fieldCount === 1) {
      groupKey = labelBuffer[0] = labelOf(rowAccessors[0](row));
    } else {
      for (let field = 0; field < fieldCount; field++) {
        const label = (labelBuffer[field] = labelOf(rowAccessors[field](row)));
        groupKey += field === 0 ? label : `\u0001${label}`;
      }
    }
    let group = groups.get(groupKey);
    if (!group) {
      group = {labels: labelBuffer.slice(), cells: []};
      groups.set(groupKey, group);
    }

    const columnKey = columnField ? labelOf(columnAccessor(row)) : '';
    let column = columnIndex.get(columnKey);
    if (column === undefined) {
      column = columnList.length;
      columnList.push(columnKey);
      columnIndex.set(columnKey, column);
    }
    const base = column * valueCount;
    for (let value = 0; value < valueCount; value++) {
      (group.cells[base + value] ??= new Accumulator()).add(valueAccessors[value](row));
    }
  }

  const direction = config.columnSort === 'desc' ? -1 : 1;
  const sortedColumns = [...columnList].sort((a, b) => direction * collator.compare(a, b));
  const aggregates = config.values.map((value) => value.aggregate ?? 'sum');

  /** Ligne du pivot : ses cellules, et ses totaux déduits des accumulateurs de toutes ses colonnes. */
  const toRow = (key: string, labels: string[], cells: (Accumulator | undefined)[]): PivotRow => {
    const out: Record<string, number | null> = {};
    const totals = config.values.map(() => new Accumulator());
    for (const columnKey of sortedColumns) {
      const base = columnIndex.get(columnKey)! * valueCount;
      for (let value = 0; value < valueCount; value++) {
        const accumulator = cells[base + value];
        out[pivotCellKey(columnKey, config.values[value].id)] = accumulator?.result(aggregates[value]) ?? null;
        if (accumulator) {
          totals[value].merge(accumulator);
        }
      }
    }
    for (let value = 0; value < valueCount; value++) {
      out[pivotTotalKey(config.values[value].id)] = totals[value].rows === 0 ? null : totals[value].result(aggregates[value]);
    }
    return {key, labels, cells: out};
  };

  const sortedGroups = [...groups.entries()].sort(([, a], [, b]) => {
    for (let index = 0; index < a.labels.length; index++) {
      const compared = collator.compare(a.labels[index], b.labels[index]);
      if (compared !== 0) {
        return compared;
      }
    }
    return 0;
  });
  const pivotRows = sortedGroups.map(([key, group]) => toRow(key, group.labels, group.cells));

  const totalLabel = config.totalLabel ?? 'Total';
  let grandTotal: PivotRow | null = null;
  if (config.grandTotal !== false && rows.length > 0) {
    // Total général : fusion, cellule par cellule, des accumulateurs de tous les groupes.
    const merged: (Accumulator | undefined)[] = [];
    for (const [, group] of sortedGroups) {
      group.cells.forEach((accumulator, position) => {
        if (accumulator) {
          (merged[position] ??= new Accumulator()).merge(accumulator);
        }
      });
    }
    grandTotal = toRow('\u0001grand-total', [totalLabel, ...config.rows.slice(1).map(() => '')], merged);
  }

  return {columnKeys: sortedColumns, rows: pivotRows, grandTotal};
}

// ---------------------------------------------------------------------------------------------
// Pivot calculé par le serveur
// ---------------------------------------------------------------------------------------------

/** Ce que la table demande au serveur : les champs en lignes, la colonne pivot et les valeurs à agréger. */
export interface PivotServerRequest {
  /** Identifiants des champs en lignes, du plus externe au plus interne. */
  rows: string[];
  /** Identifiant du champ dont chaque valeur devient une colonne, ou `null`. */
  column: string | null;
  values: { id: string; aggregate: PivotAggregate }[];
  columnSort: 'asc' | 'desc';
  /** Filtres de la table (colonne → valeur saisie), pour que le serveur pivote les mêmes lignes. */
  filters?: Record<string, string>;
}

/** Réponse du serveur : pour chaque ligne, une valeur par colonne pivot (`cells[colonne][valeur]`) et ses totaux. */
export interface PivotServerResult {
  /** Valeurs de la colonne pivot, dans l'ordre voulu. Déduites des lignes (triées) si absentes. */
  columnKeys?: string[];
  rows: PivotServerRow[];
  /** Ligne de total général. */
  grandTotal?: Omit<PivotServerRow, 'labels'>;
}

export interface PivotServerRow {
  labels: string[];
  cells: Record<string, Record<string, number | null>>;
  /** Total de la ligne pour chaque valeur (toutes colonnes pivot). */
  totals?: Record<string, number | null>;
}

/** Fonction qui calcule un pivot côté serveur. `signal` est annulé quand la requête est périmée. */
export type PivotDatasource = (request: PivotServerRequest, options: { signal: AbortSignal }) => Promise<PivotServerResult>;

/** Requête à envoyer au serveur pour une configuration. */
export function pivotRequestFor<T>(config: PivotConfig<T>, filters?: Record<string, string>): PivotServerRequest {
  return {
    rows: config.rows.map((field) => field.id),
    column: config.columns?.id ?? null,
    values: config.values.map((value) => ({id: value.id, aggregate: value.aggregate ?? 'sum'})),
    columnSort: config.columnSort ?? 'asc',
    ...(filters && Object.keys(filters).length > 0 ? {filters} : {}),
  };
}

const keyOfRow = (labels: readonly string[]): string => labels.join('\u0001');

/** Convertit la réponse d'un serveur au même format que `computePivot`, pour réutiliser le rendu. */
export function pivotFromServer<T>(server: PivotServerResult, config: PivotConfig<T>): PivotResult {
  const collator = new Intl.Collator(undefined, {numeric: true, sensitivity: 'base'});
  const direction = config.columnSort === 'desc' ? -1 : 1;
  const columnKeys = config.columns
    ? (server.columnKeys ?? [...new Set(server.rows.flatMap((row) => Object.keys(row.cells)))].sort((a, b) => direction * collator.compare(a, b)))
    : [''];

  const convert = (key: string, labels: string[], row: Omit<PivotServerRow, 'labels'>): PivotRow => {
    const cells: Record<string, number | null> = {};
    for (const columnKey of columnKeys) {
      for (const value of config.values) {
        cells[pivotCellKey(columnKey, value.id)] = row.cells[columnKey]?.[value.id] ?? null;
      }
    }
    for (const value of config.values) {
      cells[pivotTotalKey(value.id)] = row.totals?.[value.id] ?? (config.columns ? null : (row.cells[''] ?? {})[value.id] ?? null);
    }
    return {key, labels, cells};
  };

  return {
    columnKeys,
    rows: server.rows.map((row) => convert(keyOfRow(row.labels), row.labels, row)),
    grandTotal:
      config.grandTotal === false || !server.grandTotal
        ? null
        : convert('\u0001grand-total', [config.totalLabel ?? 'Total', ...config.rows.slice(1).map(() => '')], server.grandTotal),
  };
}

/** Met un `PivotResult` au format d'une réponse serveur : sert aux démos et aux tests (faux serveur). */
export function pivotToServerResult(result: PivotResult, config: PivotConfig<unknown>): PivotServerResult {
  const toRow = (row: PivotRow): Omit<PivotServerRow, 'labels'> => {
    const cells: Record<string, Record<string, number | null>> = {};
    for (const columnKey of result.columnKeys) {
      cells[columnKey] = {};
      for (const value of config.values) {
        cells[columnKey][value.id] = row.cells[pivotCellKey(columnKey, value.id)] ?? null;
      }
    }
    const totals: Record<string, number | null> = {};
    for (const value of config.values) {
      totals[value.id] = row.cells[pivotTotalKey(value.id)] ?? null;
    }
    return {cells, totals};
  };
  return {
    columnKeys: result.columnKeys,
    rows: result.rows.map((row) => ({labels: row.labels, ...toRow(row)})),
    ...(result.grandTotal ? {grandTotal: toRow(result.grandTotal)} : {}),
  };
}

// ---------------------------------------------------------------------------------------------
// Configuration par glisser-déposer des champs
// ---------------------------------------------------------------------------------------------

export type PivotZone = 'rows' | 'column' | 'values';

/** Ce que l'utilisateur a composé : champs en lignes, champ en colonne, valeurs avec leur agrégat. */
export interface PivotLayout {
  rows: string[];
  column: string | null;
  values: { id: string; aggregate: PivotAggregate }[];
}

/** Retire un champ de toutes les zones. */
export function removeFromLayout(layout: PivotLayout, fieldId: string): PivotLayout {
  return {
    rows: layout.rows.filter((id) => id !== fieldId),
    column: layout.column === fieldId ? null : layout.column,
    values: layout.values.filter((value) => value.id !== fieldId),
  };
}

/**
 * Place un champ dans une zone, à la position `index` (fin par défaut). Un champ n'est que dans une
 * zone à la fois ; une dimension ne va pas dans les valeurs, une mesure ne va pas en lignes ou en
 * colonne. La zone « colonne » n'a qu'un champ : le précédent est retiré. `null` si c'est interdit.
 */
export function placeInLayout(
  layout: PivotLayout,
  fieldId: string,
  zone: PivotZone,
  kind: 'dimension' | 'measure',
  index?: number,
  aggregate: PivotAggregate = 'sum',
): PivotLayout | null {
  if ((zone === 'values') !== (kind === 'measure')) {
    return null;
  }
  const base = removeFromLayout(layout, fieldId);
  if (zone === 'column') {
    return {...base, column: fieldId};
  }
  if (zone === 'rows') {
    const rows = [...base.rows];
    rows.splice(index ?? rows.length, 0, fieldId);
    return {...base, rows};
  }
  const values = [...base.values];
  values.splice(index ?? values.length, 0, {id: fieldId, aggregate});
  return {...base, values};
}

/** Change l'agrégat d'une valeur. */
export function setLayoutAggregate(layout: PivotLayout, valueId: string, aggregate: PivotAggregate): PivotLayout {
  return {...layout, values: layout.values.map((value) => (value.id === valueId ? {...value, aggregate} : value))};
}

/** Configuration de pivot correspondant à une composition, à partir des catalogues de champs. */
export function configFromLayout<T>(
  layout: PivotLayout,
  dimensions: readonly PivotField<T>[],
  measures: readonly PivotField<T>[],
  base: Pick<PivotConfig<T>, 'rowTotals' | 'grandTotal' | 'totalLabel' | 'columnSort'> = {},
): PivotConfig<T> {
  const dimension = (id: string) => dimensions.find((field) => field.id === id);
  return {
    ...base,
    rows: layout.rows.flatMap((id) => dimension(id) ?? []),
    columns: layout.column ? (dimension(layout.column) ?? null) : null,
    values: layout.values.flatMap((value) => {
      const field = measures.find((candidate) => candidate.id === value.id);
      return field ? [{...field, aggregate: value.aggregate}] : [];
    }),
  };
}