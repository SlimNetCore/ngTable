/**
 * Filtrage par défaut d'une cellule, en fonctions pures (aucune dépendance
 * Angular) : testables isolément, et sorties du composant pour l'alléger.
 */

/** Comment un filtre texte compare la saisie à la cellule (insensible à la casse). */
export type NgTableTextOperator = 'contains' | 'equals' | 'startsWith' | 'endsWith';

export function matchesText(raw: unknown, filterValue: string, operator: NgTableTextOperator = 'contains'): boolean {
  const cell = `${raw}`.toLowerCase();
  const expected = filterValue.toLowerCase();
  switch (operator) {
    case 'equals':
      return cell === expected;
    case 'startsWith':
      return cell.startsWith(expected);
    case 'endsWith':
      return cell.endsWith(expected);
    default:
      return cell.includes(expected);
  }
}

export function matchesBoolean(raw: boolean, filterValue: string): boolean {
  const lower = filterValue.toLowerCase();
  return raw === (lower === 'true' || lower === '1');
}

/**
 * Expression numérique saisie librement : `42`, `=42`, `!=42`, `>42`, `>=42`,
 * `<42`, `<=42`, ou une plage `10..50` (bornes incluses, chacune pouvant être
 * vide : `10..`, `..50`). La virgule est acceptée comme séparateur décimal.
 *
 * Renvoie `null` si la saisie n'est pas une expression numérique (texte libre,
 * saisie en cours) : l'appelant retombe alors sur une recherche textuelle plutôt
 * que de masquer toutes les lignes.
 */
export function matchesNumberExpression(raw: unknown, filterValue: string): boolean | null {
  const expression = filterValue.trim();
  if (!expression) {
    return null;
  }

  if (expression.includes('..')) {
    return matchesNumberRange(raw, expression);
  }

  const comparison = /^(>=|<=|!=|>|<|=)\s*(.+)$/.exec(expression);
  const operator = comparison ? comparison[1] : '=';
  const expected = parseNumber(comparison ? comparison[2] : expression);
  if (expected === null) {
    return null;
  }

  const cell = parseNumber(raw);
  if (cell === null) {
    return false;
  }

  switch (operator) {
    case '>':
      return cell > expected;
    case '>=':
      return cell >= expected;
    case '<':
      return cell < expected;
    case '<=':
      return cell <= expected;
    case '!=':
      return cell !== expected;
    default:
      return cell === expected;
  }
}

/** Plage numérique `min..max`, bornes incluses, chacune pouvant être vide. */
export function matchesNumberRange(raw: unknown, filterValue: string): boolean | null {
  const [minRaw = '', maxRaw = ''] = filterValue.split('..', 2);
  const min = minRaw.trim() ? parseNumber(minRaw) : null;
  const max = maxRaw.trim() ? parseNumber(maxRaw) : null;
  if (min === null && max === null) {
    return null;
  }

  const cell = parseNumber(raw);
  if (cell === null) {
    return false;
  }
  return (min === null || cell >= min) && (max === null || cell <= max);
}

/**
 * Filtrage des types `date` (jour exact) et `range` (période, bornes incluses,
 * chacune pouvant être vide = borne ouverte).
 *
 * La cellule est ramenée à un jour `"YYYY-MM-DD"` (`Date`, chaîne ISO, ou toute
 * date parsable) : sur ce format, la comparaison lexicographique équivaut à la
 * comparaison chronologique, sans `Date` à instancier par ligne et par rendu.
 */
export function matchesDate(raw: unknown, filterValue: string, type: 'date' | 'range'): boolean {
  const cellDay = toIsoDay(raw);
  if (!cellDay) {
    return false;
  }

  if (type === 'date') {
    const day = normalizeIsoDay(filterValue);
    // Valeur de filtre non parsable (saisie libre en cours) : correspondance
    // textuelle plutôt que de tout masquer.
    return day ? cellDay === day : `${raw}`.toLowerCase().includes(filterValue.toLowerCase());
  }

  const [fromRaw = '', toRaw = ''] = filterValue.split('..', 2);
  const from = normalizeIsoDay(fromRaw);
  const to = normalizeIsoDay(toRaw);
  if (!from && !to) {
    return false;
  }
  return (!from || cellDay >= from) && (!to || cellDay <= to);
}

/** Ramène une valeur à un jour `"YYYY-MM-DD"`, ou `''` si ce n'est pas une date. */
export function toIsoDay(raw: unknown): string {
  if (raw instanceof Date) {
    return Number.isNaN(raw.getTime()) ? '' : formatIsoDay(raw);
  }

  const text = `${raw}`.trim();
  // Couvre "2026-01-12" comme "2026-01-12T08:30:00Z" sans passer par `Date`.
  const leadingIsoDay = /^(\d{4}-\d{2}-\d{2})/.exec(text);
  if (leadingIsoDay) {
    return leadingIsoDay[1];
  }

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? '' : formatIsoDay(parsed);
}

/**
 * Libellé lisible d'une plage `a..b` pour la barre des filtres actifs :
 * `a → b`, `≥ a` ou `≤ b` selon les bornes renseignées.
 */
export function formatRangeValue(rawValue: string): string {
  const [from = '', to = ''] = rawValue.split('..', 2).map((part) => part.trim());
  if (from && to) {
    return `${from} → ${to}`;
  }
  if (from) {
    return `≥ ${from}`;
  }
  return to ? `≤ ${to}` : '';
}

/** Minuscules, sans accents : « Élodie » est trouvée en tapant « elodie ». */
export function normalizeSearchText(value: unknown): string {
  return `${value ?? ''}`.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

/** Découpe une recherche globale en mots normalisés (vide = pas de recherche). */
export function searchTerms(query: string): string[] {
  return normalizeSearchText(query).split(/\s+/).filter(Boolean);
}

/**
 * Chaque mot doit apparaître quelque part dans la ligne (pas forcément dans la
 * même colonne) : « dupont validée » trouve le client Dupont au statut Validée.
 * `haystack` = textes normalisés des cellules de la ligne, déjà concaténés.
 */
export function matchesSearchTerms(haystack: string, terms: readonly string[]): boolean {
  return terms.every((term) => haystack.includes(term));
}

function normalizeIsoDay(value: string): string {
  const raw = (value ?? '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : '';
}

function formatIsoDay(value: Date): string {
  const month = `${value.getMonth() + 1}`.padStart(2, '0');
  const day = `${value.getDate()}`.padStart(2, '0');
  return `${value.getFullYear()}-${month}-${day}`;
}

function parseNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isNaN(value) ? null : value;
  }
  const text = `${value ?? ''}`.trim().replace(/\s/g, '').replace(',', '.');
  if (!text) {
    return null;
  }
  const parsed = Number(text);
  return Number.isNaN(parsed) ? null : parsed;
}
