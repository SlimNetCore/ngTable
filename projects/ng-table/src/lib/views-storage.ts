import type {NgTableView, NgTableViewsStore} from './ng-table.component';

/**
 * Version du format persisté en `localStorage`. À incrémenter à chaque changement
 * de forme NON rétrocompatible de `NgTableView`, avec une entrée dans `MIGRATIONS`.
 * Un simple champ optionnel ajouté (comme `columnWidths`) ne nécessite pas de bump.
 */
export const VIEWS_SCHEMA_VERSION = 1;

type PersistedRecord = Record<string, unknown>;

/**
 * `MIGRATIONS[n]` convertit le format n vers n+1. La version 0 désigne les stores
 * écrits avant l'ajout du champ `version` (lib < 1.0) : même forme que la v1.
 */
const MIGRATIONS: Record<number, (data: PersistedRecord) => PersistedRecord> = {
  0: (data) => data,
};

export function emptyViewsStore(): NgTableViewsStore {
  return {views: [], activeViewId: null};
}

export function serializeViewsStore(store: NgTableViewsStore): string {
  return JSON.stringify({version: VIEWS_SCHEMA_VERSION, ...store});
}

/**
 * Relit un store persisté, en le migrant si besoin et en écartant les vues
 * malformées (stockage édité à la main, écrit par une version boguée...) plutôt
 * que de laisser une vue invalide casser l'affichage au moment de l'activer.
 */
export function parseViewsStore(raw: string | null): NgTableViewsStore {
  if (!raw) {
    return emptyViewsStore();
  }

  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return emptyViewsStore();
  }
  if (!isRecord(data) || !Array.isArray(data['views'])) {
    return emptyViewsStore();
  }

  // Un store écrit par une version PLUS RÉCENTE de la lib est relu tel quel : les
  // évolutions de format sont additives, ses champs inconnus sont simplement ignorés.
  let migrated = data;
  const version = typeof data['version'] === 'number' ? data['version'] : 0;
  for (let from = version; from < VIEWS_SCHEMA_VERSION; from++) {
    migrated = MIGRATIONS[from]?.(migrated) ?? migrated;
  }

  const views = (migrated['views'] as unknown[]).filter(isValidView);
  const existingId = (id: unknown): id is string => typeof id === 'string' && views.some((view) => view.id === id);
  const activeViewId = migrated['activeViewId'];
  const defaultViewId = migrated['defaultViewId'];
  return {
    views,
    activeViewId: existingId(activeViewId) ? activeViewId : null,
    ...(existingId(defaultViewId) ? {defaultViewId} : {}),
  };
}

/**
 * Fusionne des vues importées dans le store courant. Une vue importée remplace la
 * vue existante de même id OU de même nom (en gardant l'id existant, pour que la
 * vue active et la vue par défaut restent valides) ; les autres sont ajoutées.
 * La vue active et la vue par défaut du store courant sont conservées.
 */
export function mergeViewsStores(current: NgTableViewsStore, imported: NgTableViewsStore): NgTableViewsStore {
  const views = [...current.views];
  for (const incoming of imported.views) {
    const index = views.findIndex((view) => view.id === incoming.id || view.name === incoming.name);
    if (index === -1) {
      views.push(incoming);
    } else {
      views[index] = {...incoming, id: views[index].id};
    }
  }
  return {...current, views};
}

function isRecord(value: unknown): value is PersistedRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidView(value: unknown): value is NgTableView {
  if (!isRecord(value) || typeof value['id'] !== 'string' || typeof value['name'] !== 'string') {
    return false;
  }
  const state = value['state'];
  return (
    isRecord(state) &&
    isRecord(state['columnVisibility']) &&
    Array.isArray(state['columnOrder']) &&
    isRecord(state['sort']) &&
    isRecord(state['filters'])
  );
}

/** Clé `localStorage` d'un store de vues : namespacée pour ne pas heurter les clés de l'application. */
export function viewsStorageKeyFor(key: string): string {
  return `ng-table.views.${key}`;
}

/** Lit un store de vues en `localStorage` ; vide côté serveur (SSR) ou si le stockage est inaccessible. */
export function loadViewsStore(key: string): NgTableViewsStore {
  if (typeof localStorage === 'undefined') {
    return emptyViewsStore(); // SSR : pas de stockage côté serveur.
  }
  try {
    return parseViewsStore(localStorage.getItem(viewsStorageKeyFor(key)));
  } catch {
    return emptyViewsStore(); // Stockage inaccessible (navigation privée, quota...).
  }
}

/** Écrit un store de vues en `localStorage` ; sans effet si le stockage est absent ou plein. */
export function saveViewsStore(key: string, store: NgTableViewsStore): void {
  if (typeof localStorage === 'undefined') {
    return;
  }
  try {
    localStorage.setItem(viewsStorageKeyFor(key), serializeViewsStore(store));
  } catch {
    // Stockage plein ou indisponible (navigation privée) : la vue reste utilisable pour la session.
  }
}

export function generateViewId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `view-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
