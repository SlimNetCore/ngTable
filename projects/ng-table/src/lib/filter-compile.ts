/**
 * Filtres « compilés » : la saisie d'un filtre (`>5000`, `10..50`, `Validée,Annulée`, une période...)
 * est lue UNE fois, puis chaque ligne n'a plus qu'une comparaison à faire. `matchesColumnFilter`
 * relisait la saisie (expression régulière, découpage, minuscules...) pour chaque ligne :
 * sur un million de lignes, c'était l'essentiel du temps de filtrage.
 *
 * Le comportement est celui de `matchesColumnFilter`, que les tests comparent sur des valeurs
 * aléatoires.
 */
import {compileSetMatcher} from './set-filter';
import type {NgTableColumn} from './ng-table.component';
import {matchesDate, normalizeIsoDay, parseNumber, toIsoDay} from './filter-matching';
import type {NgTableTextOperator} from './filter-matching';

type Matcher = (raw: unknown) => boolean;

/** Comparaison de texte, insensible à la casse. */
export function compileTextMatcher(filterValue: string, operator: NgTableTextOperator = 'contains'): Matcher {
  const expected = filterValue.toLowerCase();
  switch (operator) {
    case 'equals':
      return (raw) => `${raw}`.toLowerCase() === expected;
    case 'startsWith':
      return (raw) => `${raw}`.toLowerCase().startsWith(expected);
    case 'endsWith':
      return (raw) => `${raw}`.toLowerCase().endsWith(expected);
    default:
      return (raw) => `${raw}`.toLowerCase().includes(expected);
  }
}

/** Plage `min..max` (bornes incluses, chacune pouvant être vide) ; `null` si la saisie n'en est pas une. */
export function compileNumberRange(filterValue: string): Matcher | null {
  const [minRaw = '', maxRaw = ''] = filterValue.split('..', 2);
  const min = minRaw.trim() ? parseNumber(minRaw) : null;
  const max = maxRaw.trim() ? parseNumber(maxRaw) : null;
  if (min === null && max === null) {
    return null;
  }
  return (raw) => {
    const cell = typeof raw === 'number' ? (Number.isNaN(raw) ? null : raw) : parseNumber(raw);
    return cell !== null && (min === null || cell >= min) && (max === null || cell <= max);
  };
}

/** Expression numérique libre (`42`, `>=42`, `!=0`, `10..50`) ; `null` si la saisie n'en est pas une (retour au texte). */
export function compileNumberExpression(filterValue: string): Matcher | null {
  const expression = filterValue.trim();
  if (!expression) {
    return null;
  }
  if (expression.includes('..')) {
    return compileNumberRange(expression);
  }
  const comparison = /^(>=|<=|!=|>|<|=)\s*(.+)$/.exec(expression);
  const operator = comparison ? comparison[1] : '=';
  const expected = parseNumber(comparison ? comparison[2] : expression);
  if (expected === null) {
    return null;
  }
  const read = (raw: unknown): number | null => (typeof raw === 'number' ? (Number.isNaN(raw) ? null : raw) : parseNumber(raw));
  switch (operator) {
    case '>':
      return (raw) => {
        const cell = read(raw);
        return cell !== null && cell > expected;
      };
    case '>=':
      return (raw) => {
        const cell = read(raw);
        return cell !== null && cell >= expected;
      };
    case '<':
      return (raw) => {
        const cell = read(raw);
        return cell !== null && cell < expected;
      };
    case '<=':
      return (raw) => {
        const cell = read(raw);
        return cell !== null && cell <= expected;
      };
    case '!=':
      return (raw) => {
        const cell = read(raw);
        return cell !== null && cell !== expected;
      };
    default:
      return (raw) => read(raw) === expected;
  }
}

/** Jour exact (`date`) ou période (`range`). */
export function compileDateMatcher(filterValue: string, type: 'date' | 'range'): Matcher {
  if (type === 'date') {
    const day = normalizeIsoDay(filterValue);
    if (!day) {
      return (raw) => !!toIsoDay(raw) && matchesDate(raw, filterValue, 'date');
    }
    return (raw) => toIsoDay(raw) === day;
  }
  const [fromRaw = '', toRaw = ''] = filterValue.split('..', 2);
  const from = normalizeIsoDay(fromRaw);
  const to = normalizeIsoDay(toRaw);
  if (!from && !to) {
    return () => false;
  }
  return (raw) => {
    const cellDay = toIsoDay(raw);
    return !!cellDay && (!from || cellDay >= from) && (!to || cellDay <= to);
  };
}

/**
 * Prédicat d'une colonne sur la VALEUR de la cellule (ce que renvoie `valueAccessor`), pour une saisie non vide.
 * `null` quand la colonne a un `filterPredicate` : celui-ci a besoin de la ligne entière.
 */
export function compileValueFilter<T>(column: NgTableColumn<T>, filterValue: string): Matcher | null {
  if (column.filterPredicate) {
    return null;
  }
  const type = column.filter?.type;
  const setMatcher = type === 'set' ? compileSetMatcher(filterValue) : null;
  if (setMatcher) {
    // Les cellules vides sont une valeur comme une autre (clé vide) : testées avant le rejet des valeurs nulles.
    return setMatcher;
  }
  const dateMatcher = type === 'date' || type === 'range' ? compileDateMatcher(filterValue, type) : null;
  const lower = filterValue.toLowerCase();
  const wantTrue = lower === 'true' || lower === '1';
  const enumValues = type === 'enum' ? new Set(filterValue.split(',').map((value) => value.trim().toLowerCase())) : null;
  const rangeMatcher = type === 'numberRange' ? compileNumberRange(filterValue) : null;
  const numberMatcher = compileNumberExpression(filterValue);
  const textMatcher = compileTextMatcher(filterValue, column.filter?.operator);

  return (raw) => {
    if (raw === null || raw === undefined) {
      return false;
    }
    if (dateMatcher) {
      return dateMatcher(raw);
    }
    if (typeof raw === 'boolean') {
      return raw === wantTrue;
    }
    if (enumValues) {
      return enumValues.has(`${raw}`.toLowerCase());
    }
    if (type === 'numberRange') {
      return rangeMatcher ? rangeMatcher(raw) : true;
    }
    if ((type === 'number' || typeof raw === 'number') && numberMatcher) {
      return numberMatcher(raw);
    }
    return textMatcher(raw);
  };
}

/** Prédicat d'une colonne pour une saisie de filtre non vide. */
export function compileColumnFilter<T>(column: NgTableColumn<T>, filterValue: string): (row: T) => boolean {
  if (column.filterPredicate) {
    const predicate = column.filterPredicate;
    return (row) => predicate(row, filterValue);
  }
  const accessor = column.valueAccessor;
  const matcher = compileValueFilter(column, filterValue)!;
  return (row) => matcher(accessor(row));
}

/**
 * Comme `compileFilters`, mais sur des INDICES de lignes de `rows`, en passant par les colonnes en dictionnaire quand
 * elles existent : pour une colonne aux valeurs répétées (statut, client...), le filtre n'est évalué qu'une fois par
 * valeur distincte, puis chaque ligne ne coûte qu'une lecture dans un tableau. Les autres colonnes sont testées ligne
 * par ligne, après celles-ci. `null` quand aucun filtre n'est actif.
 */
export function compileIndexFilters<T>(
  rows: readonly T[],
  columns: readonly NgTableColumn<T>[],
  filters: Record<string, string>,
  dictionaryOf: (column: NgTableColumn<T>) => {codes: Uint16Array; values: readonly unknown[]} | null,
): ((index: number) => boolean) | null {
  const tables: {codes: Uint16Array; pass: Uint8Array}[] = [];
  const predicates: ((row: T) => boolean)[] = [];
  for (const column of columns) {
    const filterValue = (filters[column.id] ?? '').trim();
    if (!filterValue) {
      continue;
    }
    const matcher = compileValueFilter(column, filterValue);
    const dictionary = matcher ? dictionaryOf(column) : null;
    if (matcher && dictionary) {
      const pass = new Uint8Array(dictionary.values.length);
      for (let code = 0; code < pass.length; code++) {
        pass[code] = matcher(dictionary.values[code]) ? 1 : 0;
      }
      tables.push({codes: dictionary.codes, pass});
    } else {
      predicates.push(compileColumnFilter(column, filterValue));
    }
  }
  if (tables.length === 0 && predicates.length === 0) {
    return null;
  }
  if (predicates.length === 0 && tables.length === 1) {
    const {codes, pass} = tables[0];
    return (index) => pass[codes[index]] === 1;
  }
  return (index) => {
    for (const table of tables) {
      if (table.pass[table.codes[index]] === 0) {
        return false;
      }
    }
    if (predicates.length > 0) {
      const row = rows[index];
      for (const predicate of predicates) {
        if (!predicate(row)) {
          return false;
        }
      }
    }
    return true;
  };
}

/** Mots vrais d'un filtre sur une cellule booléenne. */
const isBooleanWord = (lower: string): boolean => lower === 'true' || lower === '1';

/**
 * Les nouveaux filtres sont-ils plus stricts que les précédents, au sens où toute ligne qu'ils retiennent était déjà
 * retenue ? Si oui, il suffit de refiltrer le résultat précédent (déjà trié) au lieu de toutes les lignes.
 *
 * La réponse est prudente : `false` au moindre doute. Sont reconnus un filtre ajouté sur une colonne qui n'en avait
 * pas, et une saisie de texte prolongée (« dup » → « dupo ») sur une colonne de texte. Une saisie lisible comme une
 * expression numérique (`12`, `>5`) ou comme un booléen change de sens d'un caractère à l'autre : elle n'est pas
 * reconnue.
 */
export function filtersNarrow<T>(columns: readonly NgTableColumn<T>[], previous: Record<string, string>, next: Record<string, string>): boolean {
  const byId = new Map(columns.map((column) => [column.id, column]));
  for (const id of new Set([...Object.keys(previous), ...Object.keys(next)])) {
    const before = (previous[id] ?? '').trim();
    const after = (next[id] ?? '').trim();
    const column = byId.get(id);
    if (!column) {
      // Colonne masquée ou inconnue : son filtre n'est pas appliqué, à condition de n'avoir pas changé.
      if (before !== after) {
        return false;
      }
      continue;
    }
    if (before === after || before === '') {
      continue;
    }
    if (after === '' || column.filterPredicate) {
      return false;
    }
    const type = column.filter?.type;
    if (type !== undefined && type !== 'text') {
      return false;
    }
    const from = before.toLowerCase();
    const to = after.toLowerCase();
    if (isBooleanWord(from) || isBooleanWord(to) || compileNumberExpression(before) || compileNumberExpression(after)) {
      return false;
    }
    const operator = column.filter?.operator ?? 'contains';
    const narrower =
      operator === 'contains' ? to.includes(from) : operator === 'startsWith' ? to.startsWith(from) : operator === 'endsWith' ? to.endsWith(from) : false;
    if (!narrower) {
      return false;
    }
  }
  return true;
}

/** Recherche globale : chaque mot précédent est-il contenu dans un des nouveaux mots (donc recherche plus stricte) ? */
export function searchNarrows(previous: readonly string[], next: readonly string[]): boolean {
  return previous.every((term) => next.some((candidate) => candidate.includes(term)));
}

/**
 * Prédicat de tous les filtres non vides des colonnes données, ou `null` quand il n'y en a aucun
 * (rien à tester). Les filtres sont lus une fois ; chaque ligne coûte une comparaison par filtre.
 */
export function compileFilters<T>(columns: readonly NgTableColumn<T>[], filters: Record<string, string>): ((row: T) => boolean) | null {
  const predicates: ((row: T) => boolean)[] = [];
  for (const column of columns) {
    const filterValue = (filters[column.id] ?? '').trim();
    if (filterValue) {
      predicates.push(compileColumnFilter(column, filterValue));
    }
  }
  if (predicates.length === 0) {
    return null;
  }
  if (predicates.length === 1) {
    return predicates[0];
  }
  return (row) => {
    for (const predicate of predicates) {
      if (!predicate(row)) {
        return false;
      }
    }
    return true;
  };
}
