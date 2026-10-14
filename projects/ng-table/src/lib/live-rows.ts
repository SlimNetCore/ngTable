/**
 * Mode « live » : données qui changent en continu (cotations, supervision, files de
 * messages...). Deux briques pures, sans dépendance Angular :
 *
 * - `RowStore` : les lignes indexées par clé. Il reçoit soit un nouveau tableau complet
 *   (`replaceAll`, données immuables), soit des transactions (`applyTransaction`), et
 *   retient les clés modifiées depuis la dernière lecture.
 * - `IncrementalPipeline` : le résultat filtré et trié. Quand seules les données ont
 *   changé, il ne filtre que les lignes modifiées et les fusionne dans le résultat déjà
 *   trié, en O(n + k·log k) au lieu de O(n·log n) avec un appel aux accessors par
 *   comparaison. Il recalcule tout quand les filtres, le tri ou les colonnes changent.
 */
import {compareSortKeys, numericValue, SortLevel, sortKeysOf, SortValue} from './row-pipeline';

/** Transaction sur les lignes (même forme que la `RowDataTransaction` d'AG Grid). */
export interface NgTableRowTransaction<T> {
  /** Lignes ajoutées, à la fin. Une clé déjà présente vaut mise à jour. */
  add?: readonly T[];
  /** Nouvelles versions de lignes existantes, retrouvées par leur clé. */
  update?: readonly T[];
  /** Lignes retirées ; seule leur clé compte (un objet `{id}` suffit). */
  remove?: readonly T[];
}

/** Ce qui a réellement été appliqué (les clés inconnues sont ignorées). */
export interface NgTableTransactionResult<T> {
  add: T[];
  update: T[];
  remove: T[];
}

/** Ancienne et nouvelle version d'une ligne mise à jour. */
export interface RowUpdate<T> {
  key: unknown;
  previous: T;
  current: T;
}

interface StoreEntry<T> {
  row: T;
  /** Ordre d'arrivée : départage les égalités de tri, et donne l'ordre sans tri. */
  seq: number;
}

/** Clés modifiées depuis la dernière lecture, ou `reset` quand tout est à recalculer. */
export interface PendingChanges {
  reset: boolean;
  keys: ReadonlySet<unknown>;
}

export class RowStore<T> {
  private entries = new Map<unknown, StoreEntry<T>>();
  private nextSeq = 0;
  private pendingKeys = new Set<unknown>();
  private pendingReset = true;
  private cachedRows: T[] | null = [];

  constructor(private readonly keyOf: (row: T) => unknown) {}

  get size(): number {
    return this.entries.size;
  }

  /** Les lignes, dans l'ordre d'arrivée (tableau mis en cache jusqu'au prochain changement). */
  rows(): T[] {
    if (!this.cachedRows) {
      this.cachedRows = Array.from(this.entries.values(), (entry) => entry.row);
    }
    return this.cachedRows;
  }

  get(key: unknown): T | undefined {
    return this.entries.get(key)?.row;
  }

  seqOf(key: unknown): number {
    return this.entries.get(key)?.seq ?? -1;
  }

  /**
   * Remplace toutes les lignes par celles du tableau (données immuables : chaque
   * modification produit un nouvel objet). Les lignes dont l'objet n'a pas changé ne
   * comptent pas comme modifiées. Si l'ordre relatif des lignes existantes change, ou
   * qu'une ligne est insérée ailleurs qu'à la fin, tout est recalculé (l'ordre du
   * tableau fait foi quand il n'y a pas de tri). Renvoie les mises à jour.
   */
  replaceAll(rows: readonly T[]): RowUpdate<T>[] {
    const next = new Map<unknown, StoreEntry<T>>();
    const updates: RowUpdate<T>[] = [];
    const changed: unknown[] = [];
    let ordered = true;
    let lastSeq = -1;
    let sawAdded = false;
    let seq = this.nextSeq;
    for (const row of rows) {
      const key = this.keyOf(row);
      if (next.has(key)) {
        ordered = false; // clé en double : on se rabat sur un recalcul complet
      }
      const previous = this.entries.get(key);
      if (previous) {
        if (sawAdded || previous.seq < lastSeq) {
          ordered = false;
        }
        lastSeq = previous.seq;
        if (previous.row !== row) {
          updates.push({key, previous: previous.row, current: row});
          changed.push(key);
          next.set(key, {row, seq: previous.seq});
        } else {
          next.set(key, previous);
        }
      } else {
        sawAdded = true;
        changed.push(key);
        next.set(key, {row, seq: seq++});
      }
    }
    for (const key of this.entries.keys()) {
      if (!next.has(key)) {
        changed.push(key);
      }
    }

    if (!ordered) {
      let index = 0;
      for (const entry of next.values()) {
        entry.seq = index++;
      }
      seq = index;
      this.pendingReset = true;
    } else {
      for (const key of changed) {
        this.pendingKeys.add(key);
      }
    }
    this.entries = next;
    this.nextSeq = seq;
    this.markChanged(changed.length > 0 || !ordered);
    return updates;
  }

  /** Applique une transaction ; renvoie ce qui a été appliqué et les mises à jour. */
  applyTransaction(transaction: NgTableRowTransaction<T>): {result: NgTableTransactionResult<T>; updates: RowUpdate<T>[]} {
    const result: NgTableTransactionResult<T> = {add: [], update: [], remove: []};
    const updates: RowUpdate<T>[] = [];
    for (const row of transaction.remove ?? []) {
      const key = this.keyOf(row);
      const entry = this.entries.get(key);
      if (entry) {
        this.entries.delete(key);
        this.pendingKeys.add(key);
        result.remove.push(entry.row);
      }
    }
    const upsert = (row: T, asAdd: boolean) => {
      const key = this.keyOf(row);
      const entry = this.entries.get(key);
      if (entry) {
        // `Map.set` sur une clé existante garde sa position : l'ordre d'arrivée ne bouge pas.
        this.entries.set(key, {row, seq: entry.seq});
        updates.push({key, previous: entry.row, current: row});
        result.update.push(row);
      } else if (asAdd) {
        this.entries.set(key, {row, seq: this.nextSeq++});
        result.add.push(row);
      } else {
        return;
      }
      this.pendingKeys.add(key);
    };
    for (const row of transaction.update ?? []) {
      upsert(row, false);
    }
    for (const row of transaction.add ?? []) {
      upsert(row, true);
    }
    this.markChanged(result.add.length + result.update.length + result.remove.length > 0);
    return {result, updates};
  }

  /**
   * Changements depuis le dernier appel (un seul lecteur : le pipeline). Quand plus d'un
   * quart des lignes a changé, un recalcul complet coûte moins cher que la fusion.
   */
  drain(): PendingChanges {
    const reset = this.pendingReset || this.pendingKeys.size > Math.max(64, this.entries.size / 4);
    const keys = this.pendingKeys;
    this.pendingKeys = new Set();
    this.pendingReset = false;
    return {reset, keys};
  }

  private markChanged(changed: boolean): void {
    if (changed) {
      this.cachedRows = null;
    }
  }
}

/** Ce que le pipeline doit savoir de la configuration (filtres, tri...). */
export interface PipelineConfig<T> {
  /** La ligne passe-t-elle les filtres et la recherche ? */
  matches: (row: T) => boolean;
  levels: readonly SortLevel<T>[];
  collator: Intl.Collator;
  /**
   * Dépendances de la configuration : si l'une change (comparaison par référence),
   * tout est recalculé.
   */
  deps: readonly unknown[];
  /**
   * Colonnes dont il faut tenir la somme et le nombre de valeurs numériques sur le
   * résultat : mis à jour par différence à chaque fusion (totaux en direct).
   * À inclure dans `deps` (une nouvelle liste recalcule tout).
   */
  sums?: readonly {id: string; value: (row: T) => unknown}[];
}

/** Somme et nombre de valeurs numériques d'une colonne sur le résultat. */
export interface RunningTotal {
  sum: number;
  count: number;
}

/** Fusions entre deux recalculs complets des sommes (limite la dérive des additions flottantes). */
const SUMS_RESYNC_EVERY = 200;

interface ResultEntry<T> {
  key: unknown;
  row: T;
  seq: number;
  sortKeys: SortValue[];
}

export class IncrementalPipeline<T> {
  /** Résultat trié (ordre total : clés de tri puis `seq`), et ses lignes en parallèle. */
  private entries: ResultEntry<T>[] = [];
  private result: T[] = [];
  /** Entrée de chaque clé présente dans le résultat. */
  private index = new Map<unknown, ResultEntry<T>>();
  private deps: readonly unknown[] | null = null;
  /** Nombre de recalculs complets / de fusions : pour les tests et le diagnostic. */
  readonly stats = {rebuilds: 0, merges: 0};
  private totals = new Map<string, RunningTotal>();
  private mergesSinceSums = 0;

  constructor(private readonly keyOf: (row: T) => unknown) {}

  /** Résultat filtré et trié, mis à jour depuis les changements du store. */
  compute(store: RowStore<T>, config: PipelineConfig<T>): T[] {
    const changes = store.drain();
    const sameConfig = !!this.deps && this.deps.length === config.deps.length && this.deps.every((dep, i) => dep === config.deps[i]);
    if (!sameConfig || changes.reset) {
      this.rebuild(store, config);
    } else if (changes.keys.size > 0) {
      this.merge(store, config, changes.keys);
      if (++this.mergesSinceSums >= SUMS_RESYNC_EVERY) {
        this.resyncTotals(config);
      }
    }
    this.deps = config.deps;
    return this.result;
  }

  /** Somme et nombre de valeurs de la colonne `id` (déclarée dans `config.sums`) sur le résultat. */
  total(id: string): RunningTotal | undefined {
    return this.totals.get(id);
  }

  private resyncTotals(config: PipelineConfig<T>): void {
    this.totals = new Map();
    this.mergesSinceSums = 0;
    for (const {id, value} of config.sums ?? []) {
      const total = {sum: 0, count: 0};
      for (const row of this.result) {
        const number = numericValue(value(row));
        if (number !== null) {
          total.sum += number;
          total.count++;
        }
      }
      this.totals.set(id, total);
    }
  }

  /** Ajoute (`sign = 1`) ou retire (`-1`) une ligne des sommes courantes. */
  private applyToTotals(row: T, sign: 1 | -1, config: PipelineConfig<T>): void {
    for (const {id, value} of config.sums ?? []) {
      const number = numericValue(value(row));
      const total = this.totals.get(id);
      if (number !== null && total) {
        total.sum += sign * number;
        total.count += sign;
      }
    }
  }

  private rebuild(store: RowStore<T>, config: PipelineConfig<T>): void {
    this.stats.rebuilds++;
    const entries: ResultEntry<T>[] = [];
    for (const row of store.rows()) {
      if (config.matches(row)) {
        const key = this.keyOf(row);
        entries.push({key, row, seq: store.seqOf(key), sortKeys: sortKeysOf(row, config.levels)});
      }
    }
    if (config.levels.length > 0) {
      entries.sort((a, b) => this.compare(a, b, config));
    }
    this.entries = entries;
    this.result = entries.map((entry) => entry.row);
    this.index = new Map(entries.map((entry) => [entry.key, entry]));
    this.resyncTotals(config);
  }

  /**
   * Fusion des lignes modifiées. Le travail en JavaScript est en O(k·log n) : recherche
   * dichotomique de l'ancienne position de chaque ligne modifiée, puis de la nouvelle.
   * Le reste (O(n)) n'est que de la copie de tranches de tableaux (`slice` / `concat`,
   * natives), sans comparaison ni appel d'accessor pour les lignes inchangées.
   */
  private merge(store: RowStore<T>, config: PipelineConfig<T>, keys: ReadonlySet<unknown>): void {
    this.stats.merges++;
    // 1. Positions des anciennes versions, à retirer.
    const removed: number[] = [];
    for (const key of keys) {
      const previous = this.index.get(key);
      if (previous) {
        removed.push(this.positionOf(previous, config));
        this.index.delete(key);
        this.applyToTotals(previous.row, -1, config);
      }
    }
    removed.sort((a, b) => a - b);
    const keptEntries: ResultEntry<T>[][] = [];
    const keptRows: T[][] = [];
    let from = 0;
    for (const position of removed) {
      keptEntries.push(this.entries.slice(from, position));
      keptRows.push(this.result.slice(from, position));
      from = position + 1;
    }
    keptEntries.push(this.entries.slice(from));
    keptRows.push(this.result.slice(from));
    const entries = ([] as ResultEntry<T>[]).concat(...keptEntries);
    const rows = ([] as T[]).concat(...keptRows);

    // 2. Nouvelles versions qui passent les filtres, triées entre elles.
    const candidates: ResultEntry<T>[] = [];
    for (const key of keys) {
      const row = store.get(key);
      if (row !== undefined && config.matches(row)) {
        candidates.push({key, row, seq: store.seqOf(key), sortKeys: sortKeysOf(row, config.levels)});
        this.applyToTotals(row, 1, config);
      }
    }
    if (candidates.length === 0) {
      this.entries = entries;
      this.result = rows;
      return;
    }
    candidates.sort((a, b) => this.compare(a, b, config));

    // 3. Insertion : position de chaque candidat par dichotomie, puis assemblage par tranches.
    const mergedEntries: ResultEntry<T>[][] = [];
    const mergedRows: T[][] = [];
    let start = 0;
    let low = 0;
    for (let c = 0; c < candidates.length; c++) {
      const candidate = candidates[c];
      let high = entries.length;
      while (low < high) {
        const mid = (low + high) >>> 1;
        if (this.compare(entries[mid], candidate, config) < 0) {
          low = mid + 1;
        } else {
          high = mid;
        }
      }
      // Les candidats suivants consécutifs à la même position partent dans la même tranche.
      let end = c;
      while (end + 1 < candidates.length && (low === entries.length || this.compare(candidates[end + 1], entries[low], config) < 0)) {
        end++;
      }
      mergedEntries.push(entries.slice(start, low), candidates.slice(c, end + 1));
      mergedRows.push(rows.slice(start, low), candidates.slice(c, end + 1).map((entry) => entry.row));
      start = low;
      c = end;
    }
    for (const candidate of candidates) {
      this.index.set(candidate.key, candidate);
    }
    mergedEntries.push(entries.slice(start));
    mergedRows.push(rows.slice(start));
    this.entries = ([] as ResultEntry<T>[]).concat(...mergedEntries);
    this.result = ([] as T[]).concat(...mergedRows);
  }

  /** Position d'une entrée du résultat (ordre total : elle y est à un seul endroit). */
  private positionOf(entry: ResultEntry<T>, config: PipelineConfig<T>): number {
    let low = 0;
    let high = this.entries.length;
    while (low < high) {
      const mid = (low + high) >>> 1;
      if (this.compare(this.entries[mid], entry, config) < 0) {
        low = mid + 1;
      } else {
        high = mid;
      }
    }
    return this.entries[low] === entry ? low : this.entries.indexOf(entry);
  }

  private compare(a: ResultEntry<T>, b: ResultEntry<T>, config: PipelineConfig<T>): number {
    return compareSortKeys(a.sortKeys, b.sortKeys, config.levels, config.collator) || a.seq - b.seq;
  }
}
