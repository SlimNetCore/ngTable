/**
 * Côté fil principal du calcul en Web Worker (voir `worker-compute.ts`) : envoie les colonnes de valeurs une seule fois par
 * jeu de données, puis ne transmet plus que les réglages de chaque calcul.
 */
import {FromWorker, packValues, RAW_PREFIX, SEARCH_KEY, SORT_PREFIX, sortValueReader, ToWorker, WorkerRequest, WorkerValues} from './worker-compute';
import type {NgTableColumn} from './ng-table.component';
import type {SortLevel} from './row-pipeline';
import {NG_TABLE_WORKER_SOURCE} from './worker-source.generated';

/** Ce que la table utilise d'un `Worker` : on peut donc fournir le sien (ou un double en test). */
export interface ComputeWorkerLike {
  postMessage(message: ToWorker, transfer?: Transferable[]): void;
  terminate(): void;
  onmessage: ((event: {data: FromWorker}) => void) | null;
  onerror: ((event: {message?: string}) => void) | null;
}

/** Worker de calcul livré avec la bibliothèque : sa source est chargée dans un `Blob` (voir `scripts/bundle-worker.mjs`). */
export function createDefaultComputeWorker(): ComputeWorkerLike {
  const url = URL.createObjectURL(new Blob([NG_TABLE_WORKER_SOURCE], {type: 'text/javascript'}));
  const worker = new Worker(url);
  const terminate = worker.terminate.bind(worker);
  worker.terminate = () => {
    terminate();
    URL.revokeObjectURL(url);
  };
  return worker as unknown as ComputeWorkerLike;
}

export interface ComputeInput<T> {
  /** Colonnes dont le filtre est actif. */
  filterColumns: readonly NgTableColumn<T>[];
  filters: Record<string, string>;
  levels: readonly SortLevel<T>[];
  /** Recherche globale : termes et lecture du texte d'une ligne ; source change quand les colonnes cherchées changent (textes à renvoyer). */
  search: {terms: string[]; source: unknown; read: (row: T) => string} | null;
  collator: WorkerRequest['collator'];
}

export class ComputeWorkerClient {
  private worker: ComputeWorkerLike | null = null;
  private dataset = 0;
  private rows: readonly unknown[] | null = null;
  /** Colonnes déjà envoyées, avec l'accesseur qui les a produites : un autre accesseur les fait renvoyer. */
  private readonly loaded = new Map<string, unknown>();
  private searchSource: unknown = null;
  /** Le worker connaît ce jeu de données (même sans colonne, il en retient le nombre de lignes). */
  private announced = false;
  private job = 0;
  private readonly pending = new Map<number, {resolve: (order: Uint32Array) => void; reject: (error: Error) => void}>();

  constructor(private readonly factory: () => ComputeWorkerLike) {}

  /**
   * Indices (dans `rows`) des lignes retenues, triées. Une réponse peut arriver après une demande plus récente : à
   * l'appelant de l'ignorer (`isLatest`).
   */
  compute<T>(rows: readonly T[], input: ComputeInput<T>): Promise<{order: Uint32Array; job: number}> {
    const worker = this.ensureWorker();
    if (rows !== this.rows) {
      if (this.dataset > 0) {
        worker.postMessage({type: 'drop', dataset: this.dataset});
      }
      this.dataset++;
      this.rows = rows;
      this.loaded.clear();
      this.searchSource = null;
      this.announced = false;
    }

    const entries: Record<string, WorkerValues> = {};
    const add = (key: string, accessor: unknown, make: () => WorkerValues) => {
      if (this.loaded.get(key) !== accessor) {
        entries[key] = make();
        this.loaded.set(key, accessor);
      }
    };
    for (const column of input.filterColumns) {
      add(RAW_PREFIX + column.id, column.valueAccessor, () => packValues(rows, column.valueAccessor as (row: never) => unknown));
    }
    for (const level of input.levels) {
      add(SORT_PREFIX + level.column.id, level.column.sortValueAccessor ?? level.column.valueAccessor, () => packValues(rows, sortValueReader(level.column) as (row: never) => unknown));
    }
    if (input.search && this.searchSource !== input.search.source) {
      entries[SEARCH_KEY] = packValues(rows, input.search.read as (row: never) => unknown);
      this.searchSource = input.search.source;
    }
    if (Object.keys(entries).length > 0 || !this.announced) {
      this.announced = true;
      const transfer = Object.values(entries).flatMap((values) => (values instanceof Float64Array ? [values.buffer] : []));
      worker.postMessage({type: 'data', dataset: this.dataset, count: rows.length, entries}, transfer);
    }

    const job = ++this.job;
    const request: WorkerRequest = {
      filters: input.filters,
      filterSpecs: Object.fromEntries(input.filterColumns.map((column) => [column.id, {type: column.filter?.type, operator: column.filter?.operator}])),
      levels: input.levels.map((level) => ({columnId: level.column.id, factor: level.factor as 1 | -1})),
      terms: input.search?.terms ?? [],
      collator: input.collator,
    };
    return new Promise((resolve, reject) => {
      this.pending.set(job, {resolve: (order) => resolve({order, job}), reject});
      worker.postMessage({type: 'run', dataset: this.dataset, job, request});
    });
  }

  /** La réponse `job` est-elle encore celle de la dernière demande ? */
  isLatest(job: number): boolean {
    return job === this.job;
  }

  dispose(): void {
    this.worker?.terminate();
    this.worker = null;
    for (const {reject} of this.pending.values()) {
      reject(new Error('Calcul interrompu.'));
    }
    this.pending.clear();
    this.rows = null;
    this.loaded.clear();
    this.announced = false;
  }

  private ensureWorker(): ComputeWorkerLike {
    if (this.worker) {
      return this.worker;
    }
    const worker = this.factory();
    worker.onmessage = ({data}) => {
      const entry = this.pending.get(data.job);
      this.pending.delete(data.job);
      if (!entry) {
        return;
      }
      if (data.type === 'done') {
        entry.resolve(data.order);
      } else {
        entry.reject(new Error(data.message));
      }
    };
    worker.onerror = (event) => {
      // Le worker est perdu (plantage, CSP...) : demandes en attente rejetées, un nouveau sera créé à la prochaine.
      const error = new Error(event.message ?? 'Le worker de calcul a échoué.');
      for (const {reject} of this.pending.values()) {
        reject(error);
      }
      this.pending.clear();
      this.worker?.terminate();
      this.worker = null;
      this.rows = null;
      this.loaded.clear();
      this.announced = false;
    };
    this.worker = worker;
    return worker;
  }
}
