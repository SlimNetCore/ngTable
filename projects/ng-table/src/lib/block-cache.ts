/**
 * Modèle « serveur par blocs » (équivalent du Server-Side / Infinite Row Model d'AG
 * Grid) : les lignes du serveur sont chargées par blocs de taille fixe, à la demande,
 * selon la zone affichée. Logique pure, sans dépendance Angular : quels blocs charger,
 * lesquels oublier, et quelles réponses ignorer (requête devenue obsolète).
 */

interface Block<T> {
  state: 'loading' | 'loaded' | 'failed';
  rows: T[];
  /** Dernier accès (pour oublier les blocs les moins récemment affichés). */
  lastUsed: number;
}

export class BlockCache<T> {
  private blocks = new Map<number, Block<T>>();
  private clock = 0;
  /** Incrémenté à chaque purge : une réponse d'une génération passée est ignorée. */
  generation = 0;
  /** Nombre total de lignes côté serveur ; `null` tant qu'aucun bloc n'est revenu. */
  totalCount: number | null = null;

  constructor(
    readonly blockSize: number,
    private readonly maxBlocks: number,
  ) {}

  /** Oublie tout (tri, filtres ou recherche ont changé, ou rafraîchissement demandé). */
  purge(keepTotal = false): void {
    this.blocks.clear();
    this.generation++;
    if (!keepTotal) {
      this.totalCount = null;
    }
  }

  /** Nombre de lignes à présenter : le total connu, sinon un bloc (en attente de la première réponse). */
  get rowCount(): number {
    return this.totalCount ?? this.blockSize;
  }

  /** Ligne à l'index `index`, ou `undefined` si son bloc n'est pas (encore) chargé. */
  rowAt(index: number): T | undefined {
    const block = this.blocks.get(Math.floor(index / this.blockSize));
    return block?.state === 'loaded' ? block.rows[index % this.blockSize] : undefined;
  }

  blockState(blockIndex: number): Block<T>['state'] | undefined {
    return this.blocks.get(blockIndex)?.state;
  }

  /**
   * Blocs couvrant les lignes `[start, end)` jamais demandés (dans l'ordre de la zone),
   * en marquant ceux de la zone comme utilisés. Un bloc en échec n'est pas redemandé
   * automatiquement (un serveur en panne serait sinon sollicité en boucle) : il l'est
   * après une purge (`purge`, rafraîchissement).
   */
  missingBlocks(start: number, end: number): number[] {
    const missing: number[] = [];
    if (end <= start) {
      return missing;
    }
    this.clock++;
    const last = Math.floor((Math.min(end, this.rowCount) - 1) / this.blockSize);
    for (let index = Math.floor(start / this.blockSize); index <= last; index++) {
      const block = this.blocks.get(index);
      if (block) {
        block.lastUsed = this.clock;
      }
      if (!block) {
        missing.push(index);
      }
    }
    return missing;
  }

  markLoading(blockIndex: number): void {
    this.blocks.set(blockIndex, {state: 'loading', rows: [], lastUsed: this.clock});
  }

  /**
   * Enregistre la réponse d'un bloc. Renvoie `false` si elle est obsolète (purge depuis
   * la demande) : l'appelant l'ignore. Oublie au besoin les blocs les moins récemment
   * affichés au-delà de `maxBlocks`.
   */
  resolve(generation: number, blockIndex: number, rows: readonly T[], totalCount: number): boolean {
    if (generation !== this.generation) {
      return false;
    }
    this.totalCount = Math.max(0, totalCount);
    this.blocks.set(blockIndex, {state: 'loaded', rows: [...rows], lastUsed: this.clock});
    this.evict();
    return true;
  }

  reject(generation: number, blockIndex: number): void {
    if (generation === this.generation) {
      this.blocks.set(blockIndex, {state: 'failed', rows: [], lastUsed: this.clock});
    }
  }

  /** Lignes chargées de `[start, end)` (pour la sélection, l'export de ce qui est visible...). */
  loadedRows(start: number, end: number): T[] {
    const rows: T[] = [];
    for (let i = start; i < end; i++) {
      const row = this.rowAt(i);
      if (row !== undefined) {
        rows.push(row);
      }
    }
    return rows;
  }

  get loadedBlockCount(): number {
    let count = 0;
    for (const block of this.blocks.values()) {
      count += block.state === 'loaded' ? 1 : 0;
    }
    return count;
  }

  private evict(): void {
    const loaded = [...this.blocks.entries()].filter(([, block]) => block.state === 'loaded');
    if (loaded.length <= this.maxBlocks) {
      return;
    }
    loaded.sort(([, a], [, b]) => a.lastUsed - b.lastUsed);
    for (const [index] of loaded.slice(0, loaded.length - this.maxBlocks)) {
      this.blocks.delete(index);
    }
  }
}

/** Ligne d'attente affichée à la place d'une ligne dont le bloc n'est pas encore chargé. */
export class NgTableLoadingRow {
  constructor(readonly index: number) {}
}
