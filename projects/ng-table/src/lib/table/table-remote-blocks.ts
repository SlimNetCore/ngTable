import {computed, effect, signal, untracked} from '@angular/core';
import {Observable} from 'rxjs';
import {take} from 'rxjs/operators';
import {VirtualRange} from '../virtual-window';
import {BlockCache, NgTableLoadingRow} from '../block-cache';
import type {NgTableBlockRequest, NgTableBlockResult} from '../ng-table.models';
import type {NgTableComponent} from '../ng-table.component';

/** Source distante par blocs : cache, requêtes, lignes en cours de chargement. */
export class TableRemoteBlocks<T> {
  constructor(private readonly table: NgTableComponent<T>) {}

  /** Hauteur max. de la zone de défilement : `[maxHeight]`, ou 70vh en défilement virtuel. */
  /** Modèle serveur par blocs actif (mode remote + `[remoteDatasource]`). */
  readonly blockMode = computed(() => this.table.dataMode() === 'remote' && !!this.table.remoteDatasource());

  blockCache = new BlockCache<T>(100, 50);

  /** Incrémenté quand un bloc arrive ou que le cache est purgé. */
  readonly blockVersion = signal(0);

  private blocksInFlight = 0;

  /** Demandes de blocs en cours, pour les annuler (`AbortSignal`) quand elles ne servent plus. */
  private blockRequests = new Map<number, {controller: AbortController; generation: number}>();

  /** Sens du dernier défilement vertical (1 vers le bas), pour le chargement d'avance. */
  private blockScrollDirection: 1 | -1 = 1;

  private lastBlockRangeStart = 0;

  /** Position d'une ligne chargée du modèle par blocs dans la tranche rendue, ou `undefined`. */
  blockRowIndex(row: unknown): number | undefined {
    const range = this.table.viewport.virtualRange();
    if (!range) {
      return undefined;
    }
    for (let index = range.start; index < range.end; index++) {
      if (this.blockCache.rowAt(index) === row) {
        return index;
      }
    }
    return undefined;
  }

  /** Ligne d'attente d'un bloc en échec plutôt qu'en chargement. */
  isFailedLoadingRow(row: NgTableLoadingRow): boolean {
    this.blockVersion();
    return this.blockCache.blockState(Math.floor(row.index / this.blockCache.blockSize)) === 'failed';
  }

  /** Hauteur des lignes d'attente : celle, mesurée, des lignes de données. */
  loadingRowHeight(): number {
    return this.table.viewport.rowHeight();
  }

  /** Voir `NgTableComponent.refreshRemoteDatasource`. */
  refreshRemoteDatasource(): void {
    this.resetBlocks(true);
  }

  /** Voir `NgTableComponent.remoteRowCount`. */
  remoteRowCount(): number | null {
    this.blockVersion();
    return this.blockCache.totalCount;
  }

  resetBlocks(keepPosition: boolean): void {
    this.abortBlockRequests();
    this.blockCache.purge(keepPosition);
    this.blocksInFlight = 0;
    if (!keepPosition) {
      const wrap = this.table.tableWrapElement()?.nativeElement;
      if (wrap) {
        wrap.scrollTop = 0;
      }
      this.table.viewport.scrollTop.set(0);
    }
    this.blockVersion.update((version) => version + 1);
  }

  /** Demande les blocs manquants de la zone rendue, sans dépasser le nombre de requêtes simultanées. */
  private loadVisibleBlocks(range: VirtualRange): void {
    const datasource = this.table.remoteDatasource();
    if (!datasource) {
      return;
    }
    const size = this.blockCache.blockSize;
    const prefetch = Math.max(0, Math.floor(this.table.prefetchBlocks()));
    if (range.start !== this.lastBlockRangeStart) {
      this.blockScrollDirection = range.start > this.lastBlockRangeStart ? 1 : -1;
      this.lastBlockRangeStart = range.start;
    }
    // Demandes parties pour une zone quittée depuis : signalées comme inutiles. La place n'est rendue qu'à la
    // réponse (ou au rejet d'une requête réellement annulée), pour ne jamais dépasser le nombre de requêtes simultanées.
    for (const blockIndex of this.blockCache.staleLoadingBlocks(range.start, range.end, prefetch + 1)) {
      this.blockRequests.get(blockIndex)?.controller.abort();
    }
    const visible = this.blockCache.missingBlocks(range.start, range.end);
    // D'avance, seulement quand toute la zone affichée est servie ou demandée.
    const ahead = prefetch > 0 ? this.blockCache.prefetchBlocks(range.start, range.end, this.blockScrollDirection, prefetch) : [];
    for (const blockIndex of [...visible, ...ahead]) {
      if (this.blocksInFlight >= Math.max(1, this.table.maxConcurrentBlockRequests())) {
        return; // la suite partira quand une réponse libérera une place
      }
      const generation = this.blockCache.generation;
      const controller = new AbortController();
      const request: NgTableBlockRequest<T> = {
        ...this.table.query.buildRemoteQuery(blockIndex, size),
        afterRow: blockIndex > 0 ? this.blockCache.rowAt(blockIndex * size - 1) : undefined,
        beforeRow: this.blockCache.rowAt((blockIndex + 1) * size),
        page: {index: blockIndex, size},
        groupBy: null,
        collapsedGroups: [],
        startRow: blockIndex * size,
        endRow: (blockIndex + 1) * size,
        signal: controller.signal,
      };
      this.blockCache.markLoading(blockIndex);
      this.blockRequests.set(blockIndex, {controller, generation});
      this.blocksInFlight++;
      const settled = (apply: () => boolean) => {
        if (this.blockRequests.get(blockIndex)?.controller === controller) {
          this.blockRequests.delete(blockIndex);
        }
        this.onBlockSettled(generation, apply);
      };
      this.blockResponse(datasource.getRows(request), controller.signal).then(
        (response) => settled(() => this.blockCache.resolve(generation, blockIndex, response.rows, response.totalCount)),
        (error: unknown) =>
          settled(() => {
            if (controller.signal.aborted) {
              // Annulée par la table : ni erreur ni bloc en échec, il sera redemandé s'il redevient utile.
              this.blockCache.forget(generation, blockIndex);
              return true;
            }
            this.blockCache.reject(generation, blockIndex);
            this.table.remoteBlockError.emit({request, error});
            return true;
          }),
      );
    }
  }

  /** Réponse d'un bloc en promesse ; un Observable est désabonné (requête HTTP annulée) quand `signal` est levé. */
  private blockResponse(result: Promise<NgTableBlockResult<T>> | Observable<NgTableBlockResult<T>>, signal: AbortSignal): Promise<NgTableBlockResult<T>> {
    if (result instanceof Promise) {
      return result;
    }
    return new Promise((resolve, reject) => {
      const subscription = result.pipe(take(1)).subscribe({
        next: resolve,
        error: reject,
        complete: () => reject(new Error('ng-table : getRows s’est terminé sans réponse.')),
      });
      signal.addEventListener('abort', () => {
        subscription.unsubscribe();
        reject(new Error('ng-table : demande de bloc annulée.'));
      });
    });
  }

  /** Signale aux demandes en cours qu'elles ne servent plus (purge du cache). */
  private abortBlockRequests(): void {
    for (const {controller} of this.blockRequests.values()) {
      controller.abort();
    }
    this.blockRequests.clear();
  }

  private onBlockSettled(generation: number, apply: () => boolean): void {
    if (generation !== this.blockCache.generation) {
      return; // réponse d'une requête périmée (tri, filtres... ont changé entre-temps)
    }
    this.blocksInFlight = Math.max(0, this.blocksInFlight - 1);
    if (apply()) {
      this.blockVersion.update((version) => version + 1);
    }
  }

  /** Repart d'un cache vide quand la source distante ou ses réglages changent. */
  resetOnDatasourceChange(): void {
    // Modèle par blocs : nouvelle source ou nouveaux réglages de cache → on repart de zéro.
    effect(() => {
      this.table.remoteDatasource();
      const size = Math.max(1, this.table.cacheBlockSize());
      const maxBlocks = Math.max(1, this.table.maxBlocksInCache());
      untracked(() => {
        this.abortBlockRequests();
        this.blockCache = new BlockCache<T>(size, maxBlocks);
        this.blocksInFlight = 0;
        this.blockVersion.update((version) => version + 1);
      });
    });
  }

  /** Demande les blocs que la zone rendue découvre. */
  loadBlocksOnScroll(): void {
    // Modèle par blocs : à chaque déplacement de la zone rendue ou arrivée d'un bloc,
    // on demande les blocs manquants de la zone.
    effect(() => {
      const range = this.table.viewport.virtualRange();
      this.blockVersion();
      if (!this.blockMode() || !range) {
        return;
      }
      untracked(() => this.loadVisibleBlocks(range));
    });
  }
}
