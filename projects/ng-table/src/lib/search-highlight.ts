/**
 * Surlignage du texte trouvé par la recherche globale : découpe le texte d'une cellule en morceaux, ceux qui
 * correspondent à un mot cherché étant marqués. La comparaison suit celle de la recherche (casse et accents
 * ignorés) : « elodie » surligne « Élodie », en gardant le texte d'origine à l'écran.
 *
 * Sans dépendance Angular.
 */
import {normalizeSearchText} from './filter-matching';

/** Morceau de texte ; `hit` : il correspond à un mot cherché. */
export interface NgTableTextPart {
  text: string;
  hit: boolean;
}

// eslint-disable-next-line no-control-regex
const ASCII_ONLY = /^[\u0000-\u007f]*$/;

/**
 * Découpe `text` selon les mots `terms` (déjà normalisés, voir `searchTerms`). Sans correspondance, un seul
 * morceau non marqué. Les correspondances qui se chevauchent ou se touchent sont réunies.
 */
export function highlightParts(text: string, terms: readonly string[]): NgTableTextPart[] {
  if (!text || terms.length === 0) {
    return [{text, hit: false}];
  }
  // Position, dans `text`, du début de chaque caractère du texte normalisé (les accents retirés n'en ont pas).
  let normalized: string;
  let origin: number[] | null = null;
  if (ASCII_ONLY.test(text)) {
    normalized = text.toLowerCase();
  } else {
    normalized = '';
    origin = [];
    let index = 0;
    for (const character of text) {
      const piece = normalizeSearchText(character);
      let remaining = piece.length;
      while (remaining-- > 0) {
        origin.push(index);
      }
      normalized += piece;
      index += character.length;
    }
  }

  const ranges: [number, number][] = [];
  for (const term of terms) {
    if (!term) {
      continue;
    }
    let from = normalized.indexOf(term);
    while (from >= 0) {
      ranges.push([from, from + term.length]);
      from = normalized.indexOf(term, from + term.length);
    }
  }
  if (ranges.length === 0) {
    return [{text, hit: false}];
  }
  ranges.sort((a, b) => a[0] - b[0]);

  const startOf = (position: number): number => (origin ? (position < origin.length ? origin[position] : text.length) : position);
  const parts: NgTableTextPart[] = [];
  let cursor = 0;
  let [start, end] = ranges[0];
  const flush = (): void => {
    const from = startOf(start);
    const to = startOf(end);
    if (to <= from) {
      return;
    }
    if (from > cursor) {
      parts.push({text: text.slice(cursor, from), hit: false});
    }
    parts.push({text: text.slice(from, to), hit: true});
    cursor = to;
  };
  for (let i = 1; i < ranges.length; i++) {
    if (ranges[i][0] <= end) {
      end = Math.max(end, ranges[i][1]);
    } else {
      flush();
      [start, end] = ranges[i];
    }
  }
  flush();
  if (cursor < text.length) {
    parts.push({text: text.slice(cursor), hit: false});
  }
  return parts.length > 0 ? parts : [{text, hit: false}];
}
