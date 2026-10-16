/**
 * Zoom d'un graphique : fenêtre de catégories visibles, et réduction du nombre de points
 * dessinés. Fonctions pures, sans Angular.
 */

/** Fenêtre de catégories visibles : de `start` (inclus) à `end` (exclu). */
export interface ViewRange {
  start: number;
  end: number;
}

/** Nombre minimal de catégories visibles quand on zoome. */
export const MIN_VISIBLE_CATEGORIES = 2;

const clampRange = (start: number, end: number, total: number): ViewRange => {
  const size = Math.min(total, Math.max(Math.min(MIN_VISIBLE_CATEGORIES, total), Math.round(end - start)));
  const from = Math.min(Math.max(0, Math.round(start)), total - size);
  return {start: from, end: from + size};
};

/** La fenêtre montre-t-elle tout le graphique ? */
export function isFullRange(range: ViewRange | null, total: number): boolean {
  return !range || (range.start <= 0 && range.end >= total);
}

/** Fenêtre effective : le graphique entier quand il n'y en a pas, bornée sinon. */
export function effectiveRange(range: ViewRange | null, total: number): ViewRange {
  return range ? clampRange(range.start, range.end, total) : {start: 0, end: total};
}

/**
 * Zoome autour d'un point : `factor` < 1 rapproche (moins de catégories), > 1 éloigne.
 * `anchor` est la position du point dans la fenêtre, de 0 (gauche) à 1 (droite) ; le point reste en place.
 */
export function zoomRange(range: ViewRange | null, total: number, factor: number, anchor = 0.5): ViewRange {
  const current = effectiveRange(range, total);
  const size = current.end - current.start;
  const nextSize = Math.min(total, Math.max(MIN_VISIBLE_CATEGORIES, Math.round(size * factor)));
  const pivot = current.start + size * anchor;
  return clampRange(pivot - nextSize * anchor, pivot - nextSize * anchor + nextSize, total);
}

/** Décale la fenêtre de `delta` catégories (négatif : vers le début), sans sortir du graphique. */
export function panRange(range: ViewRange | null, total: number, delta: number): ViewRange {
  const current = effectiveRange(range, total);
  return clampRange(current.start + delta, current.end + delta, total);
}

/**
 * Fenêtre correspondant à une sélection à la souris : de `x0` à `x1` (même repère que `plot`),
 * parmi les catégories de la fenêtre courante. Une sélection trop étroite donne le minimum de catégories.
 */
export function rangeFromBrush(x0: number, x1: number, plot: { left: number; right: number }, range: ViewRange | null, total: number): ViewRange {
  const current = effectiveRange(range, total);
  const size = current.end - current.start;
  const width = plot.right - plot.left;
  const toIndex = (x: number) => current.start + (Math.min(Math.max(x, plot.left), plot.right) - plot.left) / width * size;
  const [a, b] = x0 <= x1 ? [x0, x1] : [x1, x0];
  const first = Math.floor(toIndex(a));
  const last = Math.ceil(toIndex(b));
  return clampRange(first, last, total);
}

/**
 * Indices à dessiner pour au plus `maxPoints` points : dans chaque tranche on garde le plus petit
 * et le plus grand, pour ne perdre ni pic ni creux. Les valeurs vides sont ignorées. Tous les
 * indices quand il y en a peu.
 */
export function decimateIndices(values: readonly (number | null)[], maxPoints: number): number[] {
  const count = values.length;
  if (count <= maxPoints || maxPoints < 4) {
    return Array.from({length: count}, (_, index) => index);
  }
  const buckets = Math.floor((maxPoints - 2) / 2);
  const size = (count - 2) / buckets;
  const kept: number[] = [0];
  for (let bucket = 0; bucket < buckets; bucket++) {
    const from = 1 + Math.floor(bucket * size);
    const to = Math.min(count - 1, 1 + Math.floor((bucket + 1) * size));
    let min = -1;
    let max = -1;
    for (let index = from; index < to; index++) {
      const value = values[index];
      if (value === null) {
        continue;
      }
      if (min < 0 || value < (values[min] as number)) {
        min = index;
      }
      if (max < 0 || value > (values[max] as number)) {
        max = index;
      }
    }
    if (min >= 0) {
      if (min === max) {
        kept.push(min);
      } else {
        kept.push(Math.min(min, max), Math.max(min, max));
      }
    }
  }
  kept.push(count - 1);
  return kept;
}
