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

/** Valeurs d'une colonne, une par ligne : des nombres compacts quand tout est numérique, sinon un tableau. */
export type WorkerValues = Float64Array | unknown[];

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

/** Messages du fil principal vers le worker. */
export type ToWorker =
  | {type: 'data'; dataset: number; count: number; entries: Record<string, WorkerValues>}
  | {type: 'run'; dataset: number; job: number; request: WorkerRequest}
  | {type: 'drop'; dataset: number};

/** Messages du worker vers le fil principal. */
export type FromWorker = {type: 'done'; job: number; order: Uint32Array} | {type: 'error'; job: number; message: string};

/** Colonnes d'un jeu de données et calcul de l'ordre des lignes retenues. */
export class WorkerComputeCore {
  private datasets = new Map<number, {count: number; columns: Map<string, WorkerValues>}>();

  addData(dataset: number, count: number, entries: Record<string, WorkerValues>): void {
    let data = this.datasets.get(dataset);
    if (!data) {
      data = {count, columns: new Map()};
      this.datasets.set(dataset, data);
    }
    for (const [key, values] of Object.entries(entries)) {
      data.columns.set(key, values);
    }
  }

  drop(dataset: number): void {
    this.datasets.delete(dataset);
  }

  /** Indices des lignes retenues par les filtres et la recherche, triés selon les niveaux ; dans l'ordre d'origine sans tri. */
  run(dataset: number, request: WorkerRequest): Uint32Array {
    const data = this.datasets.get(dataset);
    if (!data) {
      throw new Error(`Jeu de données inconnu : ${dataset}`);
    }
    const column = (key: string): WorkerValues => {
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
  return numeric ? Float64Array.from(values as number[]) : values;
}

/** Valeur de tri d'une ligne pour un niveau : celle que calculerait le fil principal. */
export function sortValueReader<T>(column: NgTableColumn<T>): (row: T) => unknown {
  return (row) => getSortValue(row, column);
}
