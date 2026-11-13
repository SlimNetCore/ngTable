/**
 * Filtre avancé : des conditions combinées par ET / OU, en groupes imbriqués, comme
 * « (Statut contient Validée OU Statut contient Expédiée) ET Montant > 5000 ».
 *
 * Une condition porte une colonne et une saisie, lue EXACTEMENT comme le filtre de cette colonne (`>5000`, `10..50`,
 * `Validée,Annulée`, un texte...) : même syntaxe, mêmes règles, un seul endroit où elles sont définies
 * (`compileValueFilter`). L'arbre est fait d'objets simples, donc sérialisable tel quel (URL, vue enregistrée,
 * requête envoyée au serveur).
 *
 * Sans dépendance Angular.
 */
import {compileColumnFilter} from './filter-compile';
import type {NgTableColumn} from './ng-table.component';

/** Une condition : la colonne `columnId` passe le filtre `value` (ou ne le passe pas, avec `not`). */
export interface NgTableFilterCondition {
  columnId: string;
  /** Saisie de filtre, dans la syntaxe du filtre de la colonne. Vide : la condition est ignorée. */
  value: string;
  /** Inverse la condition (« sauf »). */
  not?: boolean;
}

/** Un groupe : toutes ses conditions (`and`) ou au moins une (`or`). Peut contenir d'autres groupes. */
export interface NgTableFilterGroup {
  operator: 'and' | 'or';
  children: NgTableFilterNode[];
}

export type NgTableFilterNode = NgTableFilterGroup | NgTableFilterCondition;

export function isFilterGroup(node: NgTableFilterNode): node is NgTableFilterGroup {
  return Array.isArray((node as NgTableFilterGroup).children);
}

/** Nombre de conditions réellement appliquées (colonne connue, saisie non vide), tous niveaux confondus. */
export function countActiveConditions<T>(node: NgTableFilterNode | null | undefined, columns: readonly NgTableColumn<T>[]): number {
  if (!node) {
    return 0;
  }
  if (isFilterGroup(node)) {
    return node.children.reduce((sum, child) => sum + countActiveConditions(child, columns), 0);
  }
  return node.value.trim() !== '' && columns.some((column) => column.id === node.columnId) ? 1 : 0;
}

/**
 * Prédicat du filtre avancé, ou `null` quand il ne contraint rien (pas de filtre, groupes vides, conditions sans
 * saisie ou sur une colonne inconnue : celles-ci sont ignorées, comme un filtre de colonne vide).
 */
export function compileAdvancedFilter<T>(node: NgTableFilterNode | null | undefined, columns: readonly NgTableColumn<T>[]): ((row: T) => boolean) | null {
  if (!node) {
    return null;
  }
  if (!isFilterGroup(node)) {
    const value = node.value.trim();
    const column = columns.find((candidate) => candidate.id === node.columnId);
    if (!value || !column) {
      return null;
    }
    const matches = compileColumnFilter(column, value);
    return node.not ? (row) => !matches(row) : matches;
  }
  const predicates: ((row: T) => boolean)[] = [];
  for (const child of node.children) {
    const predicate = compileAdvancedFilter(child, columns);
    if (predicate) {
      predicates.push(predicate);
    }
  }
  if (predicates.length === 0) {
    return null;
  }
  if (predicates.length === 1) {
    return predicates[0];
  }
  if (node.operator === 'or') {
    return (row) => {
      for (const predicate of predicates) {
        if (predicate(row)) {
          return true;
        }
      }
      return false;
    };
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

/**
 * Le filtre en une phrase lisible : « (Statut : Validée OU Statut : Expédiée) ET Montant : >5000 ».
 * `words` : les mots ET / OU / SAUF dans la langue de l'interface.
 */
export function describeAdvancedFilter<T>(
  node: NgTableFilterNode | null | undefined,
  columns: readonly NgTableColumn<T>[],
  words: {and: string; or: string; not: string},
  nested = false,
): string {
  if (!node) {
    return '';
  }
  if (!isFilterGroup(node)) {
    const value = node.value.trim();
    const column = columns.find((candidate) => candidate.id === node.columnId);
    return value && column ? `${node.not ? `${words.not} ` : ''}${column.header} : ${value}` : '';
  }
  const parts = node.children.map((child) => describeAdvancedFilter(child, columns, words, true)).filter((part) => part !== '');
  const text = parts.join(` ${node.operator === 'or' ? words.or : words.and} `);
  return nested && parts.length > 1 ? `(${text})` : text;
}

/** Profondeur maximale acceptée pour un filtre venu de l'extérieur (URL, stockage). */
const MAX_TRUSTED_DEPTH = 6;

/**
 * Filtre avancé relu depuis une source non sûre (paramètre d'URL, vue enregistrée, réponse d'un service) : ne garde
 * que ce qui a la bonne forme. `null` si la valeur n'est pas un groupe, ou qu'il ne lui reste aucune condition.
 * Les conditions mal formées et les groupes trop imbriqués sont écartés ; rien d'autre que les champs connus n'est repris.
 */
export function sanitizeFilterGroup(value: unknown, depth = 0): NgTableFilterGroup | null {
  if (!value || typeof value !== 'object' || depth >= MAX_TRUSTED_DEPTH) {
    return null;
  }
  const candidate = value as {operator?: unknown; children?: unknown};
  if ((candidate.operator !== 'and' && candidate.operator !== 'or') || !Array.isArray(candidate.children)) {
    return null;
  }
  const children: NgTableFilterNode[] = [];
  for (const child of candidate.children as unknown[]) {
    if (child && typeof child === 'object' && Array.isArray((child as {children?: unknown}).children)) {
      const group = sanitizeFilterGroup(child, depth + 1);
      if (group) {
        children.push(group);
      }
      continue;
    }
    const condition = child as {columnId?: unknown; value?: unknown; not?: unknown} | null;
    if (condition && typeof condition.columnId === 'string' && typeof condition.value === 'string') {
      children.push({columnId: condition.columnId, value: condition.value, ...(condition.not === true ? {not: true} : {})});
    }
  }
  return children.length > 0 ? {operator: candidate.operator, children} : null;
}
