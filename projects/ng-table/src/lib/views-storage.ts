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
  const activeViewId = migrated['activeViewId'];
  return {
    views,
    activeViewId: typeof activeViewId === 'string' && views.some((view) => view.id === activeViewId)
      ? activeViewId
      : null,
  };
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
