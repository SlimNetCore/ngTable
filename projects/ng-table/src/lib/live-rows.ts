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
import type {ColumnStore} from './column-store';
import {buildSortOrder, radixSortByDigits, SortDigits} from './fast-sort';
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
  /** Version (ligne et seq) de chaque clé touchée avant sa première modification depuis la dernière lecture ; 
ull : clé nouvelle. */
  private pendingPrevious = new Map<unknown, {row: T; seq: number} | null>();
  private drainedPrevious = new Map<unknown, {row: T; seq: number} | null>();
  private pendingReset = true;
  private cachedRows: T[] | null = [];
  private cachedSeqs: number[] = [];

  constructor(private readonly keyOf: (row: T) => unknown) {}

  get size(): number {
    return this.entries.size;
  }

  /** Les lignes, dans l'ordre d'arrivée (tableau mis en cache jusqu'au prochain changement). */
  rows(): T[] {
    this.fillCache();
    return this.cachedRows!;
  }

  /** Ordre d'arrivée de chaque ligne de `rows()`, dans le même ordre. */
  seqs(): number[] {
    this.fillCache();
    return this.cachedSeqs;
  }

  private fillCache(): void {
    if (this.cachedRows) {
      return;
    }
    const rows = new Array<T>(this.entries.size);
    const seqs = new Array<number>(this.entries.size);
    let index = 0;
    for (const entry of this.entries.values()) {
      rows[index] = entry.row;
      seqs[index++] = entry.seq;
    }
    this.cachedRows = rows;
    this.cachedSeqs = seqs;
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
        this.remember(key, this.entries.get(key));
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
        this.remember(key, entry);
        this.entries.delete(key);
        this.pendingKeys.add(key);
        result.remove.push(entry.row);
      }
    }
    const upsert = (row: T, asAdd: boolean) => {
      const key = this.keyOf(row);
      const entry = this.entries.get(key);
      this.remember(key, entry);
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
    this.drainedPrevious = this.pendingPrevious;
    this.pendingPrevious = new Map();
    this.pendingKeys = new Set();
    this.pendingReset = false;
    return {reset, keys};
  }

  /** Retient la version d'une clé avant sa première modification depuis la dernière lecture. */
  private remember(key: unknown, entry: StoreEntry<T> | undefined): void {
    if (!this.pendingPrevious.has(key)) {
      this.pendingPrevious.set(key, entry ? {row: entry.row, seq: entry.seq} : null);
    }
  }

  /**
   * Version de la clé avant le lot lu par le dernier drain() : la ligne que le pipeline avait alors, avec son seq.
   * 
ull : la clé est nouvelle dans ce lot ; undefined : la clé n'a pas été touchée.
   */
  previous(key: unknown): {row: T; seq: number} | null | undefined {
    return this.drainedPrevious.get(key);
  }

  private markChanged(changed: boolean): void {
    if (changed) {
      this.cachedRows = null;
    }
  }
}

/** Retouche d'un tableau de lignes : voir `rowsPatch`. Les indices sont ceux du tableau précédent. */
export interface RowsDelta<T> {
  updated: {index: number; row: T}[];
  removed: number[];
  appended: T[];
}

/**
 * Ce qui sépare le tableau de lignes précédent (dont `previousSeqs` donne l'ordre d'arrivée, croissant) de l'état
 * actuel du magasin, d'après les clés modifiées du dernier `drain()` : lignes mises à jour sur place, retirées, et
 * ajoutées en fin de liste. Coût : une recherche dichotomique par clé modifiée, sans parcourir toutes les lignes.
 * Sert à retoucher une copie des données (le worker de calcul) au lieu de la renvoyer en entier.
 */
export function rowsPatch<T>(store: RowStore<T>, keys: ReadonlySet<unknown>, previousSeqs: readonly number[]): RowsDelta<T> | null {
  const delta: RowsDelta<T> = {updated: [], removed: [], appended: []};
  const appended: {seq: number; row: T}[] = [];
  for (const key of keys) {
    const before = store.previous(key);
    const row = store.get(key);
    const seq = store.seqOf(key);
    if (before) {
      let low = 0;
      let high = previousSeqs.length;
      while (low < high) {
        const mid = (low + high) >>> 1;
        if (previousSeqs[mid] < before.seq) {
          low = mid + 1;
        } else {
          high = mid;
        }
      }
      if (previousSeqs[low] !== before.seq) {
        return null; // l'ancienne version n'est pas dans le tableau précédent : état inconnu, tout renvoyer
      }
      if (row !== undefined && seq === before.seq) {
        delta.updated.push({index: low, row});
        continue;
      }
      delta.removed.push(low);
    }
    if (row !== undefined) {
      appended.push({seq, row}); // clé nouvelle, ou retirée puis rajoutée : en fin de liste
    }
  }
  appended.sort((a, b) => a.seq - b.seq);
  delta.appended = appended.map((entry) => entry.row);
  return delta;
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
  /**
   * Colonnes de tri mises en cache d'un recalcul à l'autre (voir `ColumnStore`). Sans lui, les
   * valeurs de tri sont relues à chaque recalcul complet.
   */
  columnStore?: ColumnStore<T>;
  /**
   * Variante de `matches` pour un recalcul complet : reçoit toutes les lignes et renvoie un test par INDICE, ce qui
   * permet de filtrer par les colonnes en dictionnaire. Doit retenir exactement les mêmes lignes que `matches`.
   */
  matchesAt?: (rows: readonly T[]) => (index: number) => boolean;
  /**
   * Filtre plus strict que le précédent : quand `base` est inchangé (comparaison par référence, comme `deps`) et que
   * `narrows(état précédent)` répond vrai, le résultat précédent, déjà trié, est seulement refiltré.
   * `base` doit contenir tout `deps` sauf ce que décrit `state` (les saisies de filtre et de recherche).
   */
  narrowing?: {base: readonly unknown[]; state: unknown; narrows: (previousState: never) => boolean};
}

/** Somme et nombre de valeurs numériques d'une colonne sur le résultat. */
export interface RunningTotal {
  sum: number;
  count: number;
}

/** Fusions entre deux recalculs complets des sommes (limite la dérive des additions flottantes). */
const SUMS_RESYNC_EVERY = 200;

interface ResultEntry<T> {
  row: T;
  seq: number;
  sortKeys: SortValue[];
}

export class IncrementalPipeline<T> {
  /** Résultat trié (ordre total : clés de tri puis `seq`) et `seq` de chacune de ses lignes, dans le même ordre. */
  private result: T[] = [];
  private seqs: number[] = [];
  private deps: readonly unknown[] | null = null;
  /** Nombre de recalculs complets / de fusions : pour les tests et le diagnostic. */
  readonly stats = {rebuilds: 0, merges: 0, narrows: 0};
  private narrowBase: readonly unknown[] | null = null;
  private narrowState: unknown = undefined;
  private totals = new Map<string, RunningTotal>();
  private mergesSinceSums = 0;

  /**
   * Le pipeline ne garde que `result` et `seqs` : ni entrée par ligne, ni index par clé. Les clés de tri d'une ligne
   * se recalculent à la demande, pour les O(log n) lignes qu'une recherche dichotomique examine, et la version
   * précédente d'une ligne modifiée vient du `RowStore`. Avec un million de lignes, une première fusion ne construit
   * donc plus rien en O(n) : elle copie seulement des tranches de tableaux.
   */

  /** Résultat filtré et trié, mis à jour depuis les changements du store. */
  compute(store: RowStore<T>, config: PipelineConfig<T>): T[] {
    const changes = store.drain();
    const sameConfig = !!this.deps && this.deps.length === config.deps.length && this.deps.every((dep, i) => dep === config.deps[i]);
    if (!sameConfig && !changes.reset && changes.keys.size === 0 && this.canNarrow(store, config)) {
      this.narrow(config);
    } else if (!sameConfig || changes.reset) {
      this.rebuild(store, config);
    } else if (changes.keys.size > 0) {
      this.merge(store, config, changes.keys);
      if (++this.mergesSinceSums >= SUMS_RESYNC_EVERY) {
        this.resyncTotals(config);
      }
    }
    this.deps = config.deps;
    this.narrowBase = config.narrowing?.base ?? null;
    this.narrowState = config.narrowing?.state;
    return this.result;
  }

  private canNarrow(store: RowStore<T>, config: PipelineConfig<T>): boolean {
    const narrowing = config.narrowing;
    const base = this.narrowBase;
    if (!narrowing || !base || base.length !== narrowing.base.length || !base.every((dep, i) => dep === narrowing.base[i])) {
      return false;
    }
    // Le résultat précédent est dans l'ordre du tri : ses lignes sont éparpillées en mémoire, et les relire coûte
    // environ trois fois plus cher par ligne que de parcourir toutes les lignes dans l'ordre. Le raccourci vaut donc
    // quand il reste peu de lignes à tester, ou quand retrier coûterait cher (colonnes de tri pas encore en cache).
    const columns = config.columnStore;
    const cheapSort =
      config.levels.length === 0 ||
      (!!columns && config.levels.every((level) => columns.has(store.rows(), level.column, config.collator)));
    if (cheapSort && this.result.length * 3 > store.size) {
      return false;
    }
    return narrowing.narrows(this.narrowState as never);
  }

  /** Filtre plus strict : seules les lignes du résultat précédent sont testées ; leur ordre (le tri) ne change pas. */
  private narrow(config: PipelineConfig<T>): void {
    this.stats.narrows++;
    const previousRows = this.result;
    const previousSeqs = this.seqs;
    const matches = config.matches;
    const count = previousRows.length;
    const kept = new Uint32Array(count);
    let size = 0;
    for (let i = 0; i < count; i++) {
      if (matches(previousRows[i])) {
        kept[size++] = i;
      }
    }
    const rows = new Array<T>(size);
    const seqs = new Array<number>(size);
    for (let i = 0; i < size; i++) {
      rows[i] = previousRows[kept[i]];
      seqs[i] = previousSeqs[kept[i]];
    }
    this.setResult(rows, seqs);
    this.resyncTotals(config);
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
    const all = store.rows();
    const allSeqs = store.seqs();
    // Indices des lignes retenues : les lignes elles-mêmes ne sont copiées qu'une fois, dans l'ordre final.
    const matchedIndex: number[] = [];
    const matchesAt = config.matchesAt?.(all);
    if (matchesAt) {
      for (let i = 0; i < all.length; i++) {
        if (matchesAt(i)) {
          matchedIndex.push(i);
        }
      }
    } else {
      for (let i = 0; i < all.length; i++) {
        if (config.matches(all[i])) {
          matchedIndex.push(i);
        }
      }
    }
    const pick = (order: ArrayLike<number>): void => {
      const rows = new Array<T>(order.length);
      const seqs = new Array<number>(order.length);
      for (let i = 0; i < order.length; i++) {
        rows[i] = all[order[i]];
        seqs[i] = allSeqs[order[i]];
      }
      this.setResult(rows, seqs);
    };
    if (config.levels.length === 0) {
      pick(matchedIndex);
    } else if (!this.sortByColumns(all, matchedIndex, config, pick)) {
      const matched = new Array<T>(matchedIndex.length);
      for (let i = 0; i < matchedIndex.length; i++) {
        matched[i] = all[matchedIndex[i]];
      }
      const order = buildSortOrder(matched, config.levels, config.collator);
      if (order) {
        for (let i = 0; i < order.length; i++) {
          order[i] = matchedIndex[order[i]];
        }
        pick(order);
      } else {
        // Niveau qu'on ne sait pas ranger en nombres (types mêlés...) : tri par comparaisons.
        const entries = matched.map((row, i) => ({row, seq: allSeqs[matchedIndex[i]], sortKeys: sortKeysOf(row, config.levels)}));
        entries.sort((a, b) => this.compare(a, b, config));
        this.setResult(entries.map((entry) => entry.row), entries.map((entry) => entry.seq));
      }
    }
    this.resyncTotals(config);
  }

  /**
   * Tri par les colonnes en cache (`config.columnStore`) : les valeurs de tri ne sont lues qu'une fois par jeu de
   * lignes, puis chaque tri ne coûte que les passes du tri par base sur les indices retenus. Renvoie `false` quand ce
   * chemin ne s'applique pas ; l'appelant trie alors comme avant.
   *
   * Une colonne absente du cache se construit pour TOUTES les lignes : quand les filtres n'en retiennent qu'une petite
   * part, lire les seules lignes retenues coûte moins, et le cache n'est pas rempli.
   */
  private sortByColumns(all: readonly T[], matchedIndex: readonly number[], config: PipelineConfig<T>, pick: (order: ArrayLike<number>) => void): boolean {
    const store = config.columnStore;
    if (!store || matchedIndex.length < 2) {
      return false;
    }
    const worthBuilding = matchedIndex.length * 2 >= all.length;
    if (!worthBuilding && !config.levels.every((level) => store.has(all, level.column, config.collator))) {
      return false;
    }
    const digits: SortDigits[] = [];
    for (const level of config.levels) {
      const column = store.sortDigits(all, level.column, config.collator);
      if (!column) {
        return false;
      }
      digits.push(column);
    }
    // Du niveau le moins important au plus important : chaque passe est stable.
    let order: Uint32Array = Uint32Array.from(matchedIndex);
    for (let level = digits.length - 1; level >= 0; level--) {
      order = radixSortByDigits(order, digits[level], config.levels[level].factor < 0);
    }
    pick(order);
    return true;
  }

  private setResult(rows: T[], seqs: number[]): void {
    this.result = rows;
    this.seqs = seqs;
  }

  /** Entrée du résultat à la position `i`, avec ses clés de tri recalculées. */
  private entryAt(i: number, config: PipelineConfig<T>): ResultEntry<T> {
    const row = this.result[i];
    return {row, seq: this.seqs[i], sortKeys: sortKeysOf(row, config.levels)};
  }

  /** Première position dont l'entrée n'est pas avant `target` (ordre total : clés de tri puis `seq`). */
  private lowerBound(target: ResultEntry<T>, from: number, config: PipelineConfig<T>): number {
    let low = from;
    let high = this.result.length;
    while (low < high) {
      const mid = (low + high) >>> 1;
      if (this.compare(this.entryAt(mid, config), target, config) < 0) {
        low = mid + 1;
      } else {
        high = mid;
      }
    }
    return low;
  }

  /**
   * Fusion des lignes modifiées. Le travail en JavaScript est en O(k·log n) : recherche dichotomique de l'ancienne
   * position de chaque ligne modifiée, puis de la nouvelle. Le reste (O(n)) n'est que de la copie de tranches de
   * tableaux (`slice` / `concat`, natives), sans comparaison ni appel d'accessor pour les lignes inchangées.
   *
   * Sans tri, le résultat est dans l'ordre d'arrivée et une mise à jour garde sa place : si toutes les lignes
   * touchées restent dans le résultat, elles sont remplacées sur place (une seule copie native du tableau).
   */
  private merge(store: RowStore<T>, config: PipelineConfig<T>, keys: ReadonlySet<unknown>): void {
    this.stats.merges++;

    // 1. Anciennes versions présentes dans le résultat : positions à retirer.
    const removed: number[] = [];
    for (const key of keys) {
      const previous = store.previous(key);
      if (!previous) {
        continue; // clé nouvelle dans ce lot, ou jamais connue du pipeline
      }
      const position = this.lowerBound({row: previous.row, seq: previous.seq, sortKeys: sortKeysOf(previous.row, config.levels)}, 0, config);
      if (this.result[position] === previous.row) {
        removed.push(position);
        this.applyToTotals(previous.row, -1, config);
      }
    }

    // 2. Nouvelles versions qui passent les filtres, triées entre elles.
    const candidates: ResultEntry<T>[] = [];
    for (const key of keys) {
      const row = store.get(key);
      if (row !== undefined && config.matches(row)) {
        candidates.push({row, seq: store.seqOf(key), sortKeys: sortKeysOf(row, config.levels)});
        this.applyToTotals(row, 1, config);
      }
    }

    if (config.levels.length === 0 && removed.length === candidates.length && this.replacesInPlace(removed, candidates)) {
      return;
    }

    removed.sort((a, b) => a - b);
    const keptRows: T[][] = [];
    const keptSeqs: number[][] = [];
    let from = 0;
    for (const position of removed) {
      keptRows.push(this.result.slice(from, position));
      keptSeqs.push(this.seqs.slice(from, position));
      from = position + 1;
    }
    keptRows.push(this.result.slice(from));
    keptSeqs.push(this.seqs.slice(from));
    const rows = ([] as T[]).concat(...keptRows);
    const seqs = ([] as number[]).concat(...keptSeqs);
    if (candidates.length === 0) {
      this.setResult(rows, seqs);
      return;
    }
    candidates.sort((a, b) => this.compare(a, b, config));

    // 3. Insertion : position de chaque candidat par dichotomie, puis assemblage par tranches.
    this.setResult(rows, seqs); // `lowerBound` lit le résultat privé de ses lignes retirées
    const mergedRows: T[][] = [];
    const mergedSeqs: number[][] = [];
    let start = 0;
    let low = 0;
    for (let c = 0; c < candidates.length; c++) {
      low = this.lowerBound(candidates[c], low, config);
      // Les candidats suivants consécutifs à la même position partent dans la même tranche.
      let end = c;
      while (end + 1 < candidates.length && (low === rows.length || this.compare(candidates[end + 1], this.entryAt(low, config), config) < 0)) {
        end++;
      }
      const group = candidates.slice(c, end + 1);
      mergedRows.push(rows.slice(start, low), group.map((entry) => entry.row));
      mergedSeqs.push(seqs.slice(start, low), group.map((entry) => entry.seq));
      start = low;
      c = end;
    }
    mergedRows.push(rows.slice(start));
    mergedSeqs.push(seqs.slice(start));
    this.setResult(([] as T[]).concat(...mergedRows), ([] as number[]).concat(...mergedSeqs));
  }

  /**
   * Remplace sur place les lignes retirées par les candidats quand chacune retrouve exactement sa place (même `seq`,
   * donc même position sans tri). Le tableau précédent n'est pas modifié : un lecteur qui le garde le retrouve intact.
   */
  private replacesInPlace(removed: readonly number[], candidates: readonly ResultEntry<T>[]): boolean {
    if (removed.length === 0) {
      return true;
    }
    const byPosition = new Map<number, ResultEntry<T>>();
    for (const position of removed) {
      byPosition.set(position, undefined as never);
    }
    for (const candidate of candidates) {
      // La position d'un candidat est celle du `seq` qu'il porte : on la retrouve dans le résultat actuel.
      let low = 0;
      let high = this.seqs.length;
      while (low < high) {
        const mid = (low + high) >>> 1;
        if (this.seqs[mid] < candidate.seq) {
          low = mid + 1;
        } else {
          high = mid;
        }
      }
      if (!byPosition.has(low) || this.seqs[low] !== candidate.seq || byPosition.get(low) !== undefined) {
        return false;
      }
      byPosition.set(low, candidate);
    }
    const result = this.result.slice();
    for (const [position, candidate] of byPosition) {
      result[position] = candidate.row;
    }
    this.result = result;
    return true;
  }

  private compare(a: ResultEntry<T>, b: ResultEntry<T>, config: PipelineConfig<T>): number {
    return compareSortKeys(a.sortKeys, b.sortKeys, config.levels, config.collator) || a.seq - b.seq;
  }
}