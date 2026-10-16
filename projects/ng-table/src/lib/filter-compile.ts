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

/** Prédicat d'une colonne pour une saisie de filtre non vide. */
export function compileColumnFilter<T>(column: NgTableColumn<T>, filterValue: string): (row: T) => boolean {
  if (column.filterPredicate) {
    const predicate = column.filterPredicate;
    return (row) => predicate(row, filterValue);
  }
  const accessor = column.valueAccessor;
  const type = column.filter?.type;
  const setMatcher = type === 'set' ? compileSetMatcher(filterValue) : null;
  if (setMatcher) {
    // Les cellules vides sont une valeur comme une autre (clé vide) : testées avant le rejet des valeurs nulles.
    return (row) => setMatcher(accessor(row));
  }
  const dateMatcher = type === 'date' || type === 'range' ? compileDateMatcher(filterValue, type) : null;
  const lower = filterValue.toLowerCase();
  const wantTrue = lower === 'true' || lower === '1';
  const enumValues = type === 'enum' ? new Set(filterValue.split(',').map((value) => value.trim().toLowerCase())) : null;
  const rangeMatcher = type === 'numberRange' ? compileNumberRange(filterValue) : null;
  const numberMatcher = compileNumberExpression(filterValue);
  const textMatcher = compileTextMatcher(filterValue, column.filter?.operator);

  return (row) => {
    const raw = accessor(row);
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
