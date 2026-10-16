/**
 * Filtre par ensemble de valeurs (`filter.type: 'set'`) : l'utilisateur coche les valeurs distinctes de la colonne
 * qu'il veut garder. Fonctions pures, sans Angular.
 *
 * La valeur du filtre est un tableau JSON de clés (`["Nord","Sud",""]`) : contrairement au CSV de l'`enum`, une
 * valeur peut contenir une virgule. La chaîne vide désigne les cellules vides (`null`, `undefined`, `''`). Une valeur
 * de filtre vide veut dire « pas de filtre » (tout est coché) ; `[]` ne garde rien.
 */

/** Clé d'une cellule dans le filtre : sa représentation texte, `''` pour une cellule vide, le jour ISO pour une date. */
export function setFilterKey(raw: unknown): string {
  if (raw === null || raw === undefined) {
    return '';
  }
  if (raw instanceof Date) {
    return Number.isNaN(raw.getTime()) ? '' : raw.toISOString().slice(0, 10);
  }
  return `${raw}`;
}

/** Les clés cochées d'une valeur de filtre, ou `null` si elle n'est pas un tableau JSON (filtre ignoré). */
export function parseSetFilter(value: string): string[] | null {
  const text = value.trim();
  if (!text) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(text);
    return Array.isArray(parsed) ? parsed.map((entry) => `${entry}`) : null;
  } catch {
    return null;
  }
}

export function serializeSetFilter(keys: Iterable<string>): string {
  return JSON.stringify([...keys]);
}

/** Prédicat d'une cellule pour une valeur de filtre `set` ; `null` quand la valeur n'est pas un ensemble. */
export function compileSetMatcher(value: string): ((raw: unknown) => boolean) | null {
  const keys = parseSetFilter(value);
  if (!keys) {
    return null;
  }
  const allowed = new Set(keys);
  return (raw) => allowed.has(setFilterKey(raw));
}

/** Une valeur distincte de la colonne, avec son nombre d'occurrences. */
export interface SetFilterValue {
  key: string;
  label: string;
  count: number;
}

/** Au-delà, la liste est tronquée : un filtre de 100 000 cases n'aide personne (la recherche reste disponible). */
export const SET_FILTER_MAX_VALUES = 10_000;

/**
 * Valeurs distinctes d'une colonne, triées (vides en dernier), avec leur effectif. `truncated` : la colonne en a plus que
 * `SET_FILTER_MAX_VALUES`.
 */
export function distinctSetValues<T>(
  rows: readonly T[],
  accessor: (row: T) => unknown,
  collator: Intl.Collator,
  blankLabel: string,
  limit = SET_FILTER_MAX_VALUES,
): {values: SetFilterValue[]; truncated: boolean} {
  const counts = new Map<string, number>();
  let truncated = false;
  for (const row of rows) {
    const key = setFilterKey(accessor(row));
    const count = counts.get(key);
    if (count !== undefined) {
      counts.set(key, count + 1);
    } else if (counts.size < limit) {
      counts.set(key, 1);
    } else {
      truncated = true;
    }
  }
  const values = [...counts].map(([key, count]) => ({key, label: key === '' ? blankLabel : key, count}));
  values.sort((a, b) => (a.key === '' ? 1 : b.key === '' ? -1 : collator.compare(a.label, b.label)));
  return {values, truncated};
}
