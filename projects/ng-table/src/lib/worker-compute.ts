/**
 * Tri, filtres et recherche dans un Web Worker, pour les grands jeux de données (plusieurs centaines de milliers de
 * lignes) : le fil principal reste libre pendant le calcul.
 *
 * Un worker ne reçoit pas de fonctions : le fil principal lui envoie donc des COLONNES de valeurs (les résultats des
 * accesseurs, en tableaux de nombres transférés sans copie quand c'est possible), une fois par jeu de données. Le worker
 * y applique les mêmes modules que le fil principal (`compileFilters`, `buildSortOrder`, `sortRows`, recherche) sur des
 * « lignes » qui sont de simples indices, et renvoie l'ordre des indices retenus (`Uint32Array`, transféré). Les filtres
 * et tris suivants sur les mêmes données n'envoient plus que ces quelques réglages.
 *
 * Ce fichier ne dépend pas d'Angular : il est aussi compilé dans le worker (`ng-table.worker.ts`).
 */
import {compileFilters} from './filter-compile';
import {matchesSearchTerms} from './filter-matching';
import {buildSortOrder} from './fast-sort';
import {getSortValue, SortLevel, sortRows} from './row-pipeline';
import type {NgTableColumn} from './ng-table.component';

/**
 * Valeurs d'une colonne, une par ligne : des nombres compacts quand tout est numérique, du texte encodé en un seul tampon quand
 * tout est du texte, sinon un tableau. Le tampon se transfère sans copie, alors que copier un million de chaînes bloque le fil
 * principal plusieurs centaines de millisecondes.
 */
export type WorkerValues = Float64Array | PackedStrings | unknown[];

/** Chaînes séparées par un caractère nul, encodées en UTF-8. */
export interface PackedStrings {
  packedStrings: Uint8Array;
}

const STRING_SEPARATOR = '\u0000';

/** Préfixes des colonnes envoyées : `v:id` valeurs brutes (filtre), `s:id` valeurs de tri, `h` textes de recherche. */
export const RAW_PREFIX = 'v:';
export const SORT_PREFIX = 's:';
export const SEARCH_KEY = 'h';

export interface WorkerRequest {
  /** Filtres non vides, par id de colonne. */
  filters: Record<string, string>;
  /** Réglages sérialisables du filtre de chaque colonne filtrée (`type`, `operator`). */
  filterSpecs: Record<string, {type?: string; operator?: string}>;
  /** Niveaux de tri, du principal au dernier. */
  levels: {columnId: string; factor: 1 | -1}[];
  /** Termes de la recherche globale (vide : pas de recherche). */
  terms: string[];
  collator: {locale?: string; options?: Intl.CollatorOptions};
}

/**
 * Retouche d'un jeu de données déjà envoyé (transaction du mode live) : au lieu de renvoyer toutes les colonnes, le fil
 * principal n'envoie que ce qui a changé. Les indices sont ceux d'AVANT la retouche ; l'ordre d'application est :
 * mises à jour sur place, retraits (les lignes suivantes remontent), puis ajouts en fin de liste.
 */
export interface WorkerPatch {
  /** Nombre de lignes après la retouche (contrôle de cohérence). */
  count: number;
  /** Indices des lignes mises à jour. */
  updated: Uint32Array;
  /** Indices des lignes retirées, croissants. */
  removed: Uint32Array;
  /** Par colonne envoyée : nouvelles valeurs des lignes mises à jour (même ordre que `updated`) et valeurs des lignes ajoutées. */
  entries: Record<string, {updates: unknown[]; appended: unknown[]}>;
}

/** Messages du fil principal vers le worker. */
export type ToWorker =
  | {type: 'data'; dataset: number; count: number; entries: Record<string, WorkerValues>}
  | {type: 'patch'; dataset: number; patch: WorkerPatch}
  | {type: 'run'; dataset: number; job: number; request: WorkerRequest}
  | {type: 'drop'; dataset: number};

/** Messages du worker vers le fil principal. */
export type FromWorker = {type: 'done'; job: number; order: Uint32Array} | {type: 'error'; job: number; message: string};

/** Colonnes d'un jeu de données et calcul de l'ordre des lignes retenues. */
export class WorkerComputeCore {
  private datasets = new Map<number, {count: number; columns: Map<string, Float64Array | unknown[]>}>();

  addData(dataset: number, count: number, entries: Record<string, WorkerValues>): void {
    const decoder = new TextDecoder();
    let data = this.datasets.get(dataset);
    if (!data) {
      data = {count, columns: new Map()};
      this.datasets.set(dataset, data);
    }
    for (const [key, values] of Object.entries(entries)) {
      data.columns.set(key, isPackedStrings(values) ? decoder.decode(values.packedStrings).split(STRING_SEPARATOR) : values);
    }
  }

  drop(dataset: number): void {
    this.datasets.delete(dataset);
  }

  /** Applique une retouche (voir `WorkerPatch`) à toutes les colonnes du jeu de données. */
  patch(dataset: number, patch: WorkerPatch): void {
    const data = this.datasets.get(dataset);
    if (!data) {
      throw new Error(`Jeu de données inconnu : ${dataset}`);
    }
    for (const [key, column] of data.columns) {
      const entry = patch.entries[key];
      if (!entry) {
        throw new Error(`Retouche sans la colonne ${key}`);
      }
      data.columns.set(key, patchColumn(column, patch, entry));
    }
    data.count = patch.count;
  }

  /** Indices des lignes retenues par les filtres et la recherche, triés selon les niveaux ; dans l'ordre d'origine sans tri. */
  run(dataset: number, request: WorkerRequest): Uint32Array {
    const data = this.datasets.get(dataset);
    if (!data) {
      throw new Error(`Jeu de données inconnu : ${dataset}`);
    }
    const column = (key: string): Float64Array | unknown[] => {
      const values = data.columns.get(key);
      if (!values) {
        throw new Error(`Colonne non envoyée : ${key}`);
      }
      return values;
    };
    const count = data.count;

    const filterColumns: NgTableColumn<number>[] = Object.keys(request.filters).map((id) => {
      const values = column(RAW_PREFIX + id);
      const spec = request.filterSpecs[id] ?? {};
      return {
        id,
        header: id,
        valueAccessor: (index: number) => values[index],
        filter: {type: spec.type, operator: spec.operator},
      } as NgTableColumn<number>;
    });
    const predicate = compileFilters(filterColumns, request.filters);
    const haystacks = request.terms.length > 0 ? (column(SEARCH_KEY) as string[]) : null;

    const matched: number[] = [];
    for (let index = 0; index < count; index++) {
      if ((!predicate || predicate(index)) && (!haystacks || matchesSearchTerms(haystacks[index], request.terms))) {
        matched.push(index);
      }
    }

    if (request.levels.length === 0) {
      return Uint32Array.from(matched);
    }

    const collator = new Intl.Collator(request.collator.locale, request.collator.options);
    const levels: SortLevel<number>[] = request.levels.map((level) => {
      const values = column(SORT_PREFIX + level.columnId);
      return {
        column: {id: level.columnId, header: level.columnId, valueAccessor: (index: number) => values[index]} as NgTableColumn<number>,
        factor: level.factor,
      };
    });
    const order = buildSortOrder(matched, levels, collator);
    if (order) {
      const sorted = new Uint32Array(order.length);
      for (let i = 0; i < order.length; i++) {
        sorted[i] = matched[order[i]];
      }
      return sorted;
    }
    // Niveau qu'on ne sait pas ranger en nombres (types mêlés...) : tri générique, comme sur le fil principal.
    return Uint32Array.from(sortRows(matched, levels, collator));
  }
}

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/** Colonne après une retouche. Une colonne de nombres qui reçoit autre chose qu'un nombre devient un tableau ordinaire. */
function patchColumn(
  column: Float64Array | unknown[],
  patch: WorkerPatch,
  entry: {updates: unknown[]; appended: unknown[]},
): Float64Array | unknown[] {
  const {updated, removed} = patch;
  const kept = column.length - removed.length;
  const numeric = column instanceof Float64Array && entry.updates.every(isFiniteNumber) && entry.appended.every(isFiniteNumber);
  const source: Float64Array | unknown[] = column instanceof Float64Array && !numeric ? Array.from(column) : column;
  for (let i = 0; i < updated.length; i++) {
    source[updated[i]] = entry.updates[i] as number;
  }
  const result: Float64Array | unknown[] = numeric ? new Float64Array(kept + entry.appended.length) : new Array<unknown>(kept + entry.appended.length);
  let write = 0;
  let nextRemoved = 0;
  for (let read = 0; read < source.length; read++) {
    if (nextRemoved < removed.length && removed[nextRemoved] === read) {
      nextRemoved++;
      continue;
    }
    result[write++] = source[read] as number;
  }
  for (const value of entry.appended) {
    result[write++] = value as number;
  }
  if (write !== patch.count) {
    throw new Error(`Retouche incohérente : ${write} lignes au lieu de ${patch.count}`);
  }
  return result;
}

/** Valeurs d'une colonne : `Float64Array` quand toutes sont des nombres finis, sinon tableau tel quel. */
export function packValues(rows: readonly unknown[], read: (row: never) => unknown): WorkerValues {
  const count = rows.length;
  const values = new Array<unknown>(count);
  let numeric = true;
  for (let i = 0; i < count; i++) {
    const value = read(rows[i] as never);
    values[i] = value;
    if (numeric && !(typeof value === 'number' && Number.isFinite(value))) {
      numeric = false;
    }
  }
  if (numeric) {
    return Float64Array.from(values as number[]);
  }
  if (count > 1000 && values.every((value) => typeof value === 'string' && !value.includes(STRING_SEPARATOR))) {
    return {packedStrings: new TextEncoder().encode((values as string[]).join(STRING_SEPARATOR))};
  }
  return values;
}

export function isPackedStrings(values: WorkerValues): values is PackedStrings {
  return !Array.isArray(values) && !(values instanceof Float64Array);
}

/** Valeur de tri d'une ligne pour un niveau : celle que calculerait le fil principal. */
export function sortValueReader<T>(column: NgTableColumn<T>): (row: T) => unknown {
  return (row) => getSortValue(row, column);
}
