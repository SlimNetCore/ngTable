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

/**
 * Hauteur maximale de la zone de défilement. Les navigateurs plafonnent la hauteur d'un
 * élément (~33,5 millions de px pour Chrome, ~17,9 millions pour Firefox) : au-delà, la
 * fin d'une très longue liste serait inatteignable. Au-dessus de ce seuil, la barre de
 * défilement est « comprimée » (comme le fait AG Grid) : sa position est convertie
 * proportionnellement en position réelle dans la liste.
 */
export const MAX_SCROLL_HEIGHT = 15_000_000;

/** Tranche rendue et hauteurs des espacements qui l'entourent. */
export interface VirtualLayout extends VirtualRange {
  top: number;
  bottom: number;
}

const DEFAULT_VIEWPORT = 800;

/** Rapport entre le défilement réel de la liste et celui de la barre (1 sans compression). */
function scrollRatio(count: number, viewportHeight: number, rowHeight: number, maxHeight: number): number {
  const full = count * rowHeight;
  if (full <= maxHeight) {
    return 1;
  }
  const viewport = viewportHeight > 0 ? viewportHeight : DEFAULT_VIEWPORT;
  return (full - viewport) / Math.max(1, maxHeight - viewport);
}

/**
 * Tranche rendue et espacements pour une position de la barre de défilement. Sans
 * compression, l'espacement du haut vaut la hauteur des lignes non rendues au-dessus.
 * Avec compression, il place la tranche pour que la ligne « réellement » en haut de la
 * zone apparaisse en haut de la zone, et la hauteur totale reste `maxHeight`.
 */
export function computeVirtualLayout(
  count: number,
  scrollTop: number,
  viewportHeight: number,
  rowHeight: number,
  overscan = VIRTUAL_OVERSCAN,
  maxHeight = MAX_SCROLL_HEIGHT,
): VirtualLayout {
  const ratio = scrollRatio(count, viewportHeight, rowHeight, maxHeight);
  const trueTop = Math.max(0, scrollTop) * ratio;
  const range = computeVirtualRange(count, trueTop, viewportHeight, rowHeight, overscan);
  if (ratio === 1) {
    return {...range, top: range.start * rowHeight, bottom: (count - range.end) * rowHeight};
  }
  const top = Math.max(0, Math.max(0, scrollTop) - (trueTop - range.start * rowHeight));
  const bottom = Math.max(0, maxHeight - top - (range.end - range.start) * rowHeight);
  return {...range, top, bottom};
}

/** Position de la barre de défilement qui amène la ligne `index` en haut de la zone. */
export function scrollTopForIndex(
  index: number,
  count: number,
  viewportHeight: number,
  rowHeight: number,
  maxHeight = MAX_SCROLL_HEIGHT,
): number {
  return (Math.max(0, Math.min(index, count - 1)) * rowHeight) / scrollRatio(count, viewportHeight, rowHeight, maxHeight);
}

/** Colonnes rendues (indices `[start, end)` parmi les colonnes libres) et largeurs des espacements. */
export interface ColumnWindow {
  start: number;
  end: number;
  /** Largeur des colonnes non rendues à gauche / à droite de la fenêtre. */
  left: number;
  right: number;
}

/** Marge rendue de chaque côté de la zone visible (défilement horizontal fluide). */
export const COLUMN_OVERSCAN_PX = 300;

/**
 * Colonnes libres (non épinglées) à rendre pour une position de défilement horizontal :
 * celles qui croisent la zone visible élargie de `overscanPx` de chaque côté. Tant que la
 * largeur de la zone n'est pas connue, on suppose 1 200 px.
 */
export function computeColumnWindow(
  widths: readonly number[],
  scrollLeft: number,
  viewportWidth: number,
  overscanPx = COLUMN_OVERSCAN_PX,
): ColumnWindow {
  const from = Math.max(0, scrollLeft) - overscanPx;
  const to = Math.max(0, scrollLeft) + (viewportWidth > 0 ? viewportWidth : 1200) + overscanPx;
  let x = 0;
  let start = widths.length;
  let end = widths.length;
  let left = 0;
  for (let i = 0; i < widths.length; i++) {
    if (start === widths.length && x + widths[i] > from) {
      start = i;
      left = x;
    }
    if (x >= to) {
      end = i;
      break;
    }
    x += widths[i];
  }
  if (start > end) {
    start = end;
  }
  const total = widths.reduce((sum, width) => sum + width, 0);
  let rendered = 0;
  for (let i = start; i < end; i++) {
    rendered += widths[i];
  }
  return {start, end, left, right: Math.max(0, total - left - rendered)};
}

/**
 * Ligne d'espacement insérée avant / après la tranche rendue. Sa hauteur est lue à part
 * (`computeVirtualLayout`), pour qu'un défilement ne recrée pas la source de données.
 */
export class NgTableSpacerRow {
  constructor(
    readonly position: 'top' | 'bottom',
    /** Inutilisé (conservé pour compatibilité) : voir `computeVirtualLayout`. */
    readonly height = 0,
  ) {}
}
