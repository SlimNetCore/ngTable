/**
 * Glisser-déposer de lignes : calcul du nouvel ordre. Fonctions pures, sans Angular.
 */
export type RowDropPosition = 'before' | 'after';

export interface RowMoveResult<T> {
  /** Toutes les lignes, dans le nouvel ordre. */
  rows: T[];
  /** Position de la ligne déplacée avant et après le déplacement (dans `rows`). */
  fromIndex: number;
  toIndex: number;
}

/**
 * Déplace la ligne `fromKey` juste avant ou juste après la ligne `targetKey`.
 * `null` si l'une des deux n'existe pas, si c'est la même ligne, ou si rien ne bouge.
 */
export function moveRow<T>(
  rows: readonly T[],
  keyOf: (row: T) => unknown,
  fromKey: unknown,
  targetKey: unknown,
  position: RowDropPosition,
): RowMoveResult<T> | null {
  if (Object.is(fromKey, targetKey)) {
    return null;
  }
  const fromIndex = rows.findIndex((row) => Object.is(keyOf(row), fromKey));
  const targetIndex = rows.findIndex((row) => Object.is(keyOf(row), targetKey));
  if (fromIndex < 0 || targetIndex < 0) {
    return null;
  }
  const next = rows.slice();
  const [moved] = next.splice(fromIndex, 1);
  // Après le retrait, l'index de la cible recule d'un cran si elle était après la ligne déplacée.
  const targetAfterRemoval = targetIndex > fromIndex ? targetIndex - 1 : targetIndex;
  const toIndex = targetAfterRemoval + (position === 'after' ? 1 : 0);
  if (toIndex === fromIndex) {
    return null;
  }
  next.splice(toIndex, 0, moved);
  return {rows: next, fromIndex, toIndex};
}

/** Moitié haute d'une ligne : « avant » ; moitié basse : « après ». */
export function dropPositionFor(clientY: number, rect: {top: number; height: number}): RowDropPosition {
  return clientY < rect.top + rect.height / 2 ? 'before' : 'after';
}
