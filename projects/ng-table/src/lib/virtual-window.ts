/**
 * Défilement virtuel « maison » : seules les lignes visibles (plus une marge) sont
 * rendues, entre deux lignes d'espacement qui donnent à la barre de défilement la
 * hauteur de la liste complète. Fonctions pures, sans dépendance Angular.
 */

export interface VirtualRange {
  /** Index du premier élément rendu. */
  start: number;
  /** Index suivant le dernier élément rendu. */
  end: number;
}

/** Lignes rendues en plus de la zone visible, de chaque côté (défilement fluide, focus clavier). */
export const VIRTUAL_OVERSCAN = 8;

/**
 * Tranche d'éléments à rendre pour une position de défilement. Suppose des lignes de
 * hauteur uniforme `rowHeight` ; tant que la hauteur de la zone n'est pas connue
 * (premier rendu), rend assez de lignes pour une zone de 800 px.
 */
export function computeVirtualRange(
  count: number,
  scrollTop: number,
  viewportHeight: number,
  rowHeight: number,
  overscan = VIRTUAL_OVERSCAN,
): VirtualRange {
  if (count === 0 || rowHeight <= 0) {
    return {start: 0, end: count};
  }
  const height = viewportHeight > 0 ? viewportHeight : 800;
  const visible = Math.ceil(height / rowHeight);
  // Position au-delà de la fin (liste qui vient de rétrécir sous un filtre) : on rend
  // la dernière « page » de lignes plutôt qu'une zone vide.
  const first = Math.min(Math.floor(Math.max(0, scrollTop) / rowHeight), Math.max(0, count - visible));
  const start = Math.max(0, first - overscan);
  const end = Math.min(count, first + visible + overscan);
  return {start, end};
}

/** Ligne d'espacement insérée avant / après la tranche rendue (hauteur des lignes non rendues). */
export class NgTableSpacerRow {
  constructor(
    readonly position: 'top' | 'bottom',
    readonly height: number,
  ) {}
}
