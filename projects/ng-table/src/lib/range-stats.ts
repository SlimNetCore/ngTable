/**
 * Statistiques d'une plage de cellules, pour la barre d'état : fonction pure, sans Angular.
 */
export interface RangeStats {
  /** Cellules non vides. */
  count: number;
  /** Cellules lisibles comme un nombre. */
  numericCount: number;
  sum: number;
  avg: number | null;
  min: number | null;
  max: number | null;
}

/** Nombre contenu dans une valeur de cellule : un nombre, ou un texte qui n'est qu'un nombre. */
export function numericCellValue(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value.trim().replace(/\s/g, '').replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/** Nombre, somme, moyenne, minimum et maximum des valeurs d'une plage (les cellules vides sont ignorées). */
export function computeRangeStats(values: readonly unknown[]): RangeStats {
  let count = 0;
  let numericCount = 0;
  let sum = 0;
  let min: number | null = null;
  let max: number | null = null;
  for (const value of values) {
    if (value === null || value === undefined || value === '') {
      continue;
    }
    count++;
    const number = numericCellValue(value);
    if (number === null) {
      continue;
    }
    numericCount++;
    sum += number;
    min = min === null || number < min ? number : min;
    max = max === null || number > max ? number : max;
  }
  return {count, numericCount, sum, avg: numericCount > 0 ? sum / numericCount : null, min, max};
}
