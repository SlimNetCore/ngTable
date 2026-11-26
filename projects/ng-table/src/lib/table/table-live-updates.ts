import {effect, untracked} from '@angular/core';
import {NgTableRowTransaction, NgTableTransactionResult, RowUpdate} from '../live-rows';
import type {NgTableColumn} from '../ng-table.models';
import type {NgTableComponent} from '../ng-table.component';

/** Mises à jour en direct : transactions, file d'attente, surbrillance des cellules modifiées. */
export class TableLiveUpdates<T> {
  constructor(private readonly table: NgTableComponent<T>) {}

  /** Voir `NgTableComponent.applyTransaction`. */
  applyTransaction(transaction: NgTableRowTransaction<T>): NgTableTransactionResult<T> {
    // Mises à jour suspendues par l'utilisateur : la transaction attend la reprise (le résultat est alors vide).
    if (this.table.liveUpdatesPaused()) {
      this.asyncQueue.push({transaction});
      return {add: [], update: [], remove: []};
    }
    return this.applyTransactionNow(transaction);
  }

  /** Applique une transaction tout de suite, même en pause : c'est le chemin de l'édition par l'utilisateur. */
  applyTransactionNow(transaction: NgTableRowTransaction<T>): NgTableTransactionResult<T> {
    const result = this.applyToStore(transaction);
    this.table.data.dataVersion.update((version) => version + 1);
    return result;
  }

  /** Bouton « Suspendre / Reprendre les mises à jour » de la barre d'outils. */
  toggleLivePause(): void {
    const paused = !this.table.liveUpdatesPaused();
    this.table.liveUpdatesPaused.set(paused);
    const labels = this.table.effectiveLabels();
    this.table.announce([paused ? labels.announceLivePaused : labels.announceLiveResumed]);
  }

  /** Voir `NgTableComponent.applyTransactionAsync`. */
  applyTransactionAsync(transaction: NgTableRowTransaction<T>, callback?: (result: NgTableTransactionResult<T>) => void): void {
    this.asyncQueue.push({transaction, callback});
    if (this.asyncTimer === null && !this.table.liveUpdatesPaused()) {
      this.asyncTimer = setTimeout(() => {
        this.asyncTimer = null;
        // Suspendu entre-temps : le lot déjà programmé attend lui aussi la reprise.
        if (!this.table.liveUpdatesPaused()) {
          this.flushAsyncTransactions();
        }
      }, this.table.asyncTransactionWaitMillis());
    }
  }

  /** Voir `NgTableComponent.flushAsyncTransactions`. */
  flushAsyncTransactions(): void {
    if (this.asyncTimer !== null) {
      clearTimeout(this.asyncTimer);
      this.asyncTimer = null;
    }
    const queue = this.asyncQueue;
    this.asyncQueue = [];
    if (queue.length === 0) {
      return;
    }
    const results = queue.map(({transaction, callback}) => {
      const result = this.applyToStore(transaction);
      callback?.(result);
      return result;
    });
    this.table.data.dataVersion.update((version) => version + 1);
    this.table.asyncTransactionsFlushed.emit(results);
  }

  private asyncQueue: { transaction: NgTableRowTransaction<T>; callback?: (result: NgTableTransactionResult<T>) => void }[] = [];
  private asyncTimer: ReturnType<typeof setTimeout> | null = null;

  private applyToStore(transaction: NgTableRowTransaction<T>): NgTableTransactionResult<T> {
    if (this.table.dataMode() !== 'local') {
      return {add: [], update: [], remove: []}; // en remote, le serveur est la source
    }
    const store = this.table.data.syncedStore(); // le dernier `[rows]` d'abord
    const {result, updates} = store.applyTransaction(transaction);
    this.recordFlashes(updates);
    return result;
  }

  private lastFlashPrune = 0;

  /** Cellules modifiées récemment, par clé de ligne puis id de colonne. */
  readonly flashes = new Map<unknown, Map<string, { direction: 'up' | 'down' | 'change'; at: number; parity: number }>>();

  /** Relève les cellules dont la valeur a changé, pour les colonnes en surbrillance. */
  recordFlashes(updates: readonly RowUpdate<T>[]): void {
    if (updates.length === 0) {
      return;
    }
    const columns = untracked(() => this.table.columns()).filter((column) => column.flashOnChange ?? untracked(() => this.table.flashCells()));
    if (columns.length === 0) {
      return;
    }
    const now = performance.now();
    for (const {key, previous, current} of updates) {
      for (const column of columns) {
        const before = column.valueAccessor(previous);
        const after = column.valueAccessor(current);
        if (Object.is(before, after) || (before instanceof Date && after instanceof Date && before.getTime() === after.getTime())) {
          continue;
        }
        let cells = this.flashes.get(key);
        if (!cells) {
          cells = new Map();
          this.flashes.set(key, cells);
        }
        const direction = typeof before === 'number' && typeof after === 'number' ? (after > before ? 'up' : 'down') : 'change';
        cells.set(column.id, {direction, at: now, parity: 1 - (cells.get(column.id)?.parity ?? 1)});
      }
    }
    // Ménage des surbrillances terminées : au plus une fois par durée de surbrillance,
    // pas à chaque lot (à haute fréquence, la table en compte vite des milliers).
    const duration = untracked(() => this.table.flashDurationMs());
    if (this.flashes.size > 2048 && now - this.lastFlashPrune > duration) {
      this.lastFlashPrune = now;
      const expired = now - duration;
      for (const [key, cells] of this.flashes) {
        for (const [columnId, flash] of cells) {
          if (flash.at < expired) {
            cells.delete(columnId);
          }
        }
        if (cells.size === 0) {
          this.flashes.delete(key);
        }
      }
    }
  }

  /**
   * Surbrillance d'une cellule à l'instant `now` (attribut `data-ngt-flash` : `up-0`,
   * `down-1`...). Deux valeurs en alternance (`-0` / `-1`) : un nouveau changement
   * redémarre l'animation CSS sur la même cellule. Un attribut plutôt qu'une classe :
   * une directive `NgClass` par cellule ralentissait nettement le rendu des pages.
   */
  flashClassFn(now: number): (row: T, column: NgTableColumn<T>) => string {
    const limit = now - this.table.flashDurationMs();
    return (row, column) => {
      const flash = this.flashes.get(this.table.data.rowKey(row))?.get(column.id);
      return flash && flash.at >= limit ? `${flash.direction}-${flash.parity}` : '';
    };
  }

  /** Applique les transactions mises en attente quand les mises à jour reprennent. */
  flushOnResume(): void {
    // Reprise des mises à jour en direct : les transactions mises en attente pendant la pause sont appliquées.
    effect(() => {
      if (!this.table.liveUpdatesPaused()) {
        untracked(() => this.flushAsyncTransactions());
      }
    });
  }

  /** Annule le lot de transactions en attente. */
  dispose(): void {
    if (this.asyncTimer !== null) {
      clearTimeout(this.asyncTimer);
    }
  }
}
