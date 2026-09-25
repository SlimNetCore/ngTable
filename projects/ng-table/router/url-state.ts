import type {NgTableQueryState, NgTableSortChange} from '@sbourahla/ng-table';

/** Paramètres d'URL : `null` = paramètre à retirer de l'URL. */
export type NgTableUrlParams = Record<string, string | null>;

/**
 * Noms des paramètres, préfixés pour permettre plusieurs tables sur une page :
 * préfixe `cmd` → `cmd.s`, `cmd.q`, `cmd.p`, `cmd.ps`, `cmd.f.<colonne>`.
 */
export function urlParamNames(prefix: string) {
  const p = prefix ? `${prefix}.` : '';
  return {sort: `${p}s`, search: `${p}q`, page: `${p}p`, pageSize: `${p}ps`, groupBy: `${p}g`, filterPrefix: `${p}f.`};
}

/**
 * État → paramètres d'URL lisibles : `s=montant:desc,client:asc`, `q=dupont`,
 * `p=3` (page **1-based**, comme à l'écran), `ps=50`, `g=statut` (regroupement), `f.statut=VALIDEE`.
 * Les groupes repliés ne vont pas dans l'URL (état d'affichage passager).
 * Les valeurs par défaut sont omises (pas de tri, page 1, taille `defaultPageSize`).
 * Chaque clé déjà présente dans `current` mais plus utile vaut `null` (à retirer).
 */
export function toUrlParams(
  state: NgTableQueryState,
  prefix: string,
  defaultPageSize: number,
  current: Readonly<Record<string, unknown>> = {},
): NgTableUrlParams {
  const names = urlParamNames(prefix);
  const params: NgTableUrlParams = {};
  for (const key of Object.keys(current)) {
    if (isOwnKey(key, names)) {
      params[key] = null;
    }
  }
  if (state.sorts.length > 0) {
    params[names.sort] = state.sorts.map((sort) => `${sort.columnId}:${sort.direction}`).join(',');
  }
  if (state.search) {
    params[names.search] = state.search;
  }
  if (state.pageIndex > 0) {
    params[names.page] = `${state.pageIndex + 1}`;
  }
  if (state.pageSize !== defaultPageSize) {
    params[names.pageSize] = `${state.pageSize}`;
  }
  if (state.groupBy) {
    params[names.groupBy] = state.groupBy;
  }
  for (const [columnId, value] of Object.entries(state.filters)) {
    if (value) {
      params[names.filterPrefix + columnId] = value;
    }
  }
  return params;
}

/**
 * Paramètres d'URL → état complet (les parties absentes valent leur défaut, pour
 * qu'une URL « nue » réinitialise la table). Les valeurs invalides sont ignorées.
 */
export function fromUrlParams(
  params: Readonly<Record<string, string | undefined>>,
  prefix: string,
  defaultPageSize: number,
): NgTableQueryState {
  const names = urlParamNames(prefix);
  const sorts: NgTableSortChange[] = [];
  for (const part of (params[names.sort] ?? '').split(',')) {
    const [columnId, direction] = part.split(':');
    if (columnId && (direction === 'asc' || direction === 'desc')) {
      sorts.push({columnId, direction});
    }
  }
  const filters: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    if (key.startsWith(names.filterPrefix) && value) {
      filters[key.slice(names.filterPrefix.length)] = value;
    }
  }
  const page = Number.parseInt(params[names.page] ?? '', 10);
  const pageSize = Number.parseInt(params[names.pageSize] ?? '', 10);
  return {
    sorts,
    filters,
    search: params[names.search] ?? '',
    pageIndex: page > 0 ? page - 1 : 0,
    pageSize: pageSize > 0 ? pageSize : defaultPageSize,
    groupBy: params[names.groupBy] || null,
    collapsedGroups: [],
  };
}

/** Deux états donnent-ils la même URL ? (évite les boucles URL ↔ table). */
export function sameUrlState(a: NgTableQueryState, b: NgTableQueryState, prefix: string, defaultPageSize: number): boolean {
  return JSON.stringify(sortKeys(toUrlParams(a, prefix, defaultPageSize))) ===
    JSON.stringify(sortKeys(toUrlParams(b, prefix, defaultPageSize)));
}

function isOwnKey(key: string, names: ReturnType<typeof urlParamNames>): boolean {
  return [names.sort, names.search, names.page, names.pageSize, names.groupBy].includes(key) || key.startsWith(names.filterPrefix);
}

function sortKeys(params: NgTableUrlParams): [string, string | null][] {
  return Object.entries(params).sort(([a], [b]) => a.localeCompare(b));
}
