/**
 * Cellules prêtes à l'emploi et mise en forme conditionnelle : la colonne déclare `cell: {type: ...}` au lieu
 * d'écrire un `cellTemplate`. Ce fichier contient les réglages et les calculs (proportions, étoiles, initiales,
 * étendue d'une colonne), sans dépendance Angular ; le rendu est dans `ng-table-cell-format.component.ts`.
 *
 * Règle d'accessibilité (WCAG 1.4.1) : aucune de ces mises en forme ne porte l'information par la couleur seule.
 * Le texte ou le nombre reste toujours affiché.
 */

/** Teinte sémantique d'une pastille ou d'une barre. */
export type NgTableTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

/** Pastille colorée autour du texte de la cellule (statut, catégorie...). */
export interface NgTableBadgeFormat<T> {
  type: 'badge';
  /** Teinte selon la valeur : table `{'Validée': 'success'}` ou fonction. Défaut : `neutral`. */
  tone?: Record<string, NgTableTone> | ((value: unknown, row: T) => NgTableTone);
  /** Texte affiché ; défaut : la valeur de la cellule. */
  label?: (value: unknown, row: T) => string;
}

/** Barre de progression : la valeur est un nombre entre 0 et `max`. */
export interface NgTableProgressFormat {
  type: 'progress';
  /** Valeur qui remplit la barre. Défaut : 100. */
  max?: number;
  /** Affiche le pourcentage à côté de la barre. Défaut : `true`. */
  showValue?: boolean;
}

/** Note en étoiles : la valeur est un nombre entre 0 et `max` (demi-étoiles arrondies). */
export interface NgTableRatingFormat {
  type: 'rating';
  /** Nombre d'étoiles. Défaut : 5. */
  max?: number;
}

/** Lien : le texte de la cellule devient un lien. */
export interface NgTableLinkFormat<T> {
  type: 'link';
  /** Adresse du lien ; `null` : texte simple. */
  href: (row: T, value: unknown) => string | null | undefined;
  /** Ouvre dans un nouvel onglet (`target="_blank"`, `rel="noopener noreferrer"`). */
  external?: boolean;
}

/** Avatar : pastille ronde (image ou initiales du texte) suivie du texte. */
export interface NgTableAvatarFormat<T> {
  type: 'avatar';
  /** Adresse de l'image ; sans elle, les initiales du texte de la cellule. */
  image?: (row: T) => string | null | undefined;
}

/**
 * Barre de données : une barre proportionnelle à la valeur derrière le nombre, comme dans un tableur.
 * Les valeurs négatives partent à gauche de l'axe zéro, dans une autre teinte.
 */
export interface NgTableDataBarFormat {
  type: 'dataBar';
  /** Bornes ; par défaut le minimum et le maximum de la colonne sur les lignes filtrées (mode local). */
  min?: number;
  max?: number;
  tone?: NgTableTone;
}

/**
 * Dégradé de couleur : le fond de la cellule est d'autant plus soutenu que la valeur est grande.
 * `diverging` : deux teintes de part et d'autre de zéro (pertes / gains).
 */
export interface NgTableColorScaleFormat {
  type: 'colorScale';
  min?: number;
  max?: number;
  diverging?: boolean;
}

export type NgTableCellFormat<T> =
  | NgTableBadgeFormat<T>
  | NgTableProgressFormat
  | NgTableRatingFormat
  | NgTableLinkFormat<T>
  | NgTableAvatarFormat<T>
  | NgTableDataBarFormat
  | NgTableColorScaleFormat;

/** Étendue des valeurs numériques d'une colonne. */
export interface NgTableValueRange {
  min: number;
  max: number;
}

/** Nombre fini porté par une cellule (nombre, ou texte numérique) ; `null` sinon. */
export function cellNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value !== 'string' || value.trim() === '') {
    return null;
  }
  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

/** Minimum et maximum des valeurs numériques ; `null` s'il n'y en a aucune. */
export function valueRange(values: Iterable<unknown>): NgTableValueRange | null {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const value of values) {
    const number = cellNumber(value);
    if (number !== null) {
      if (number < min) {
        min = number;
      }
      if (number > max) {
        max = number;
      }
    }
  }
  return min <= max ? {min, max} : null;
}

/** Bornes effectives : celles du format quand elles sont données, sinon celles de la colonne. */
export function effectiveRange(format: {min?: number; max?: number}, measured: NgTableValueRange | null): NgTableValueRange | null {
  const min = format.min ?? measured?.min;
  const max = format.max ?? measured?.max;
  return min === undefined || max === undefined || min > max ? null : {min, max};
}

/** Teinte d'une pastille pour une valeur. */
export function badgeTone<T>(format: NgTableBadgeFormat<T>, value: unknown, row: T): NgTableTone {
  if (typeof format.tone === 'function') {
    return format.tone(value, row);
  }
  return format.tone?.[`${value ?? ''}`] ?? 'neutral';
}

/** Part remplie d'une barre de progression, entre 0 et 1 ; `null` si la valeur n'est pas un nombre. */
export function progressRatio(value: unknown, max = 100): number | null {
  const number = cellNumber(value);
  if (number === null || !(max > 0)) {
    return null;
  }
  return Math.min(1, Math.max(0, number / max));
}

/** Étoiles pleines, demi-étoile et étoiles vides d'une note ; `null` si la valeur n'est pas un nombre. */
export function ratingParts(value: unknown, max = 5): {full: number; half: boolean; empty: number; value: number; max: number} | null {
  const number = cellNumber(value);
  const count = Math.max(1, Math.floor(max));
  if (number === null) {
    return null;
  }
  const halves = Math.round(Math.min(count, Math.max(0, number)) * 2);
  const full = Math.floor(halves / 2);
  const half = halves % 2 === 1;
  return {full, half, empty: count - full - (half ? 1 : 0), value: number, max: count};
}

/** Initiales d'un nom : première lettre des deux premiers mots (« Dupont SA » → « DS »), en majuscules. */
export function initials(text: string): string {
  const words = text
    .trim()
    .split(/[\s\-_.]+/)
    .filter((word) => /[\p{L}\p{N}]/u.test(word));
  return words
    .slice(0, 2)
    .map((word) => [...word].find((character) => /[\p{L}\p{N}]/u.test(character)) ?? '')
    .join('')
    .toLocaleUpperCase();
}

/**
 * Géométrie d'une barre de données, en parts (0 à 1) de la largeur de la cellule : où elle commence, sa largeur, et
 * si la valeur est négative. L'axe zéro est toujours dans l'étendue : une colonne de valeurs toutes positives part
 * du bord gauche. `null` si la valeur n'est pas un nombre ou que l'étendue est nulle.
 */
export function dataBar(value: unknown, range: NgTableValueRange | null): {start: number; width: number; negative: boolean} | null {
  const number = cellNumber(value);
  if (number === null || !range) {
    return null;
  }
  const low = Math.min(range.min, 0);
  const high = Math.max(range.max, 0);
  const span = high - low;
  if (!(span > 0)) {
    return null;
  }
  const clamped = Math.min(high, Math.max(low, number));
  const zero = -low / span + 0; // `+ 0` : jamais -0
  return clamped >= 0
    ? {start: zero, width: clamped / span, negative: false}
    : {start: (clamped - low) / span, width: -clamped / span, negative: true};
}

/**
 * Intensité d'un dégradé de couleur, entre 0 et 1. Sans `diverging` : position de la valeur dans l'étendue.
 * Avec : distance à zéro rapportée à la plus grande valeur absolue, `negative` donnant le côté.
 */
export function colorScale(value: unknown, range: NgTableValueRange | null, diverging = false): {ratio: number; negative: boolean} | null {
  const number = cellNumber(value);
  if (number === null || !range) {
    return null;
  }
  if (diverging) {
    const extreme = Math.max(Math.abs(range.min), Math.abs(range.max));
    return extreme > 0 ? {ratio: Math.min(1, Math.abs(number) / extreme), negative: number < 0} : {ratio: 0, negative: false};
  }
  const span = range.max - range.min;
  return {ratio: span > 0 ? Math.min(1, Math.max(0, (number - range.min) / span)) : 0, negative: false};
}
