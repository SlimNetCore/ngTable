import {describe, expect, it} from 'vitest';
import {BlockCache} from './block-cache';

const block = (index: number, size = 100) => Array.from({length: size}, (_, i) => index * size + i);

describe('BlockCache', () => {
  it('ne demande que les blocs de la zone affichée, une seule fois', () => {
    const cache = new BlockCache<number>(100, 10);
    expect(cache.missingBlocks(0, 30)).toEqual([0]); // total inconnu : un bloc
    cache.markLoading(0);
    expect(cache.missingBlocks(0, 30)).toEqual([]); // déjà en cours
    cache.resolve(cache.generation, 0, block(0), 1_000_000);

    expect(cache.rowAt(42)).toBe(42);
    expect(cache.missingBlocks(450_050, 450_130)).toEqual([4500, 4501]);
    expect(cache.rowAt(450_060)).toBeUndefined();
  });

  it('ignore une réponse arrivée après une purge (tri ou filtre changé)', () => {
    const cache = new BlockCache<number>(100, 10);
    const generation = cache.generation;
    cache.markLoading(0);
    cache.purge();

    expect(cache.resolve(generation, 0, block(0), 1000)).toBe(false);
    expect(cache.rowAt(0)).toBeUndefined();
    expect(cache.totalCount).toBeNull();
  });

  it('oublie les blocs les moins récemment affichés au-delà de la limite', () => {
    const cache = new BlockCache<number>(100, 3);
    for (const index of [0, 1, 2]) {
      cache.missingBlocks(index * 100, index * 100 + 50);
      cache.resolve(cache.generation, index, block(index), 10_000);
    }
    cache.missingBlocks(0, 50); // le bloc 0 redevient récent
    cache.missingBlocks(900, 950);
    cache.resolve(cache.generation, 9, block(9), 10_000);

    expect(cache.loadedBlockCount).toBe(3);
    expect(cache.rowAt(0)).toBe(0);
    expect(cache.rowAt(150)).toBeUndefined(); // bloc 1, le plus ancien, oublié
  });

  it('chargement d’avance : les blocs suivants dans le sens du défilement, dans les limites de la liste', () => {
    const cache = new BlockCache<number>(10, 50);
    expect(cache.prefetchBlocks(0, 10, 1, 2), 'total inconnu : rien').toEqual([]);
    cache.markLoading(0);
    cache.resolve(cache.generation, 0, [], 95);
    expect(cache.prefetchBlocks(20, 40, 1, 2)).toEqual([4, 5]);
    expect(cache.prefetchBlocks(20, 40, -1, 2)).toEqual([1]); // le bloc 0 est déjà là
    expect(cache.prefetchBlocks(80, 95, 1, 2)).toEqual([]); // fin de liste (dernier bloc : 9)
    expect(cache.prefetchBlocks(0, 10, -1, 2)).toEqual([]);
    expect(cache.prefetchBlocks(20, 40, 1, 0)).toEqual([]);
  });

  it('demandes devenues inutiles : blocs en chargement loin de la zone, oubliés une fois annulés', () => {
    const cache = new BlockCache<number>(10, 50);
    cache.markLoading(0);
    cache.resolve(cache.generation, 0, [], 1000);
    cache.markLoading(3);
    cache.markLoading(40);
    expect(cache.staleLoadingBlocks(400, 420, 1)).toEqual([3]);
    expect(cache.staleLoadingBlocks(20, 40, 1)).toEqual([40]);
    expect(cache.staleLoadingBlocks(30, 40, 0)).toEqual([40]);

    cache.forget(cache.generation, 3);
    expect(cache.blockState(3)).toBeUndefined();
    expect(cache.missingBlocks(30, 40)).toEqual([3]);
    cache.forget(cache.generation, 0); // un bloc chargé n'est pas oublié
    expect(cache.blockState(0)).toBe('loaded');
    cache.forget(cache.generation - 1, 40); // ni une demande d'une génération passée
    expect(cache.blockState(40)).toBe('loading');
  });

  it('ne redemande pas un bloc en échec avant une purge ; ne dépasse pas la fin de la liste', () => {
    const cache = new BlockCache<number>(100, 10);
    cache.resolve(cache.generation, 0, block(0), 250);
    cache.reject(cache.generation, 1);

    expect(cache.blockState(1)).toBe('failed');
    expect(cache.missingBlocks(0, 10_000)).toEqual([2]);
    cache.purge(true);
    expect(cache.missingBlocks(0, 10_000)).toEqual([0, 1, 2]); // total conservé : 250 lignes
  });
});
