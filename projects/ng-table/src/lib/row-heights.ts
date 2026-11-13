/**
 * Défilement virtuel avec des lignes de hauteurs différentes (détail déplié, texte sur plusieurs lignes, en-tête de
 * groupe) : la table part d'une hauteur estimée pour toutes les lignes, puis retient la hauteur réelle de celles
 * qu'elle a rendues et mesurées.
 *
 * Deux questions reviennent à chaque défilement : « à quelle distance du haut commence la ligne n° i ? » et « quelle
 * ligne se trouve à la distance d ? ». Additionner les hauteurs une à une coûterait un parcours de toute la liste.
 * Un arbre de Fenwick (arbre d'indices binaires) garde des sommes partielles : une hauteur se corrige et une somme se
 * lit en O(log n). L'arbre ne stocke que les ÉCARTS à la hauteur estimée, et n'est créé qu'au premier écart : tant que
 * toutes les lignes ont la même hauteur, rien n'est alloué.
 *
 * Sans dépendance Angular.
 */
import {computeVirtualLayout, MAX_SCROLL_HEIGHT, VIRTUAL_OVERSCAN, VirtualLayout} from './virtual-window';

export class HeightIndex {
  /** Sommes partielles des écarts (indices à partir de 1) ; `null` tant qu'aucune ligne ne s'écarte de l'estimation. */
  private tree: Float64Array | null = null;
  /** Écart (hauteur mesurée − hauteur estimée) des lignes mesurées qui s'en écartent. */
  private readonly deltas = new Map<number, number>();

  constructor(
    readonly count: number,
    /** Hauteur estimée d'une ligne pas encore mesurée. */
    readonly defaultHeight: number,
  ) {}

  /** Au moins une ligne a une hauteur différente de l'estimation. */
  get hasDeviations(): boolean {
    return this.deltas.size > 0;
  }

  /** Hauteur de la ligne `index`. */
  heightOf(index: number): number {
    return this.defaultHeight + (this.deltas.get(index) ?? 0);
  }

  /** Enregistre la hauteur mesurée de la ligne `index`. Renvoie `true` si elle a changé (au-delà d'un demi-pixel). */
  set(index: number, height: number): boolean {
    if (index < 0 || index >= this.count || !(height > 0)) {
      return false;
    }
    const previous = this.deltas.get(index) ?? 0;
    const next = Math.abs(height - this.defaultHeight) <= 0.5 ? 0 : height - this.defaultHeight;
    if (Math.abs(next - previous) <= 0.5) {
      return false;
    }
    if (next === 0) {
      this.deltas.delete(index);
    } else {
      this.deltas.set(index, next);
    }
    const tree = (this.tree ??= new Float64Array(this.count + 1));
    for (let node = index + 1; node <= this.count; node += node & -node) {
      tree[node] += next - previous;
    }
    return true;
  }

  /** Distance entre le haut de la liste et le haut de la ligne `index` (`index = count` : hauteur totale). */
  offsetOf(index: number): number {
    const bounded = Math.max(0, Math.min(this.count, index));
    let sum = bounded * this.defaultHeight;
    if (this.tree) {
      for (let node = bounded; node > 0; node -= node & -node) {
        sum += this.tree[node];
      }
    }
    return sum;
  }

  get total(): number {
    return this.offsetOf(this.count);
  }

  /** Ligne qui contient la distance `offset` depuis le haut (la dernière si `offset` dépasse la fin). */
  indexAt(offset: number): number {
    if (this.count === 0) {
      return 0;
    }
    if (!this.tree) {
      return Math.max(0, Math.min(this.count - 1, Math.floor(Math.max(0, offset) / this.defaultHeight)));
    }
    // Plus grand indice dont le haut est à `offset` ou avant : dichotomie sur des sommes lues en O(log n).
    let low = 0;
    let high = this.count - 1;
    while (low < high) {
      const mid = (low + high + 1) >>> 1;
      if (this.offsetOf(mid) <= offset) {
        low = mid;
      } else {
        high = mid - 1;
      }
    }
    return low;
  }
}

/**
 * Tranche rendue et espacements pour une position de défilement, avec les hauteurs connues de `heights`.
 *
 * Tant qu'aucune ligne ne s'écarte de l'estimation, ou quand la liste est si longue que la barre de défilement est
 * comprimée (au-delà de `maxHeight` pixels), le calcul est celui des lignes de hauteur uniforme (`computeVirtualLayout`).
 */
export function computeVariableLayout(
  heights: HeightIndex,
  scrollTop: number,
  viewportHeight: number,
  overscan = VIRTUAL_OVERSCAN,
  maxHeight = MAX_SCROLL_HEIGHT,
): VirtualLayout {
  const total = heights.total;
  if (!heights.hasDeviations || total > maxHeight || heights.count * heights.defaultHeight > maxHeight) {
    return computeVirtualLayout(heights.count, scrollTop, viewportHeight, heights.defaultHeight, overscan, maxHeight);
  }
  const viewport = viewportHeight > 0 ? viewportHeight : 800;
  // Position au-delà de la fin (liste qui vient de rétrécir) : on rend la dernière « page » plutôt qu'une zone vide.
  const top = Math.max(0, Math.min(scrollTop, total - viewport));
  const first = heights.indexAt(top);
  const last = heights.indexAt(top + viewport);
  const start = Math.max(0, first - overscan);
  const end = Math.min(heights.count, last + 1 + overscan);
  return {start, end, top: heights.offsetOf(start), bottom: Math.max(0, total - heights.offsetOf(end))};
}

/** Position de défilement qui amène la ligne `index` en haut de la zone, avec les hauteurs connues ; `null` quand le calcul uniforme s'applique. */
export function variableScrollTop(heights: HeightIndex, index: number, maxHeight = MAX_SCROLL_HEIGHT): number | null {
  if (!heights.hasDeviations || heights.total > maxHeight || heights.count * heights.defaultHeight > maxHeight) {
    return null;
  }
  return heights.offsetOf(Math.max(0, Math.min(index, heights.count - 1)));
}

/** Valeur la plus fréquente (au demi-pixel près) ; à égalité, la plus petite. `0` pour une liste vide. */
export function mostCommonHeight(heights: readonly number[]): number {
  const counts = new Map<number, number>();
  let best = 0;
  let bestCount = 0;
  for (const height of heights) {
    const rounded = Math.round(height * 2) / 2;
    const count = (counts.get(rounded) ?? 0) + 1;
    counts.set(rounded, count);
    if (count > bestCount || (count === bestCount && rounded < best)) {
      best = rounded;
      bestCount = count;
    }
  }
  return best;
}
