import {describe, expect, it} from 'vitest';
import {parseViewsStore, serializeViewsStore, VIEWS_SCHEMA_VERSION} from './views-storage';

const validView = {
  id: 'v1',
  name: 'Validées',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  state: {
    columnVisibility: {nom: true},
    columnOrder: [],
    sort: {columnId: '', direction: ''},
    filters: {statut: 'VALIDEE'},
  },
};

describe('views-storage', () => {
  it('écrit la version du schéma', () => {
    const raw = serializeViewsStore({views: [], activeViewId: null});
    expect(JSON.parse(raw).version).toBe(VIEWS_SCHEMA_VERSION);
  });

  it('relit ce qu’il a écrit', () => {
    const store = {views: [validView], activeViewId: 'v1'} as never;
    expect(parseViewsStore(serializeViewsStore(store))).toEqual(store);
  });

  it('relit un store écrit avant l’ajout du champ version (lib < 1.0)', () => {
    const legacy = JSON.stringify({views: [validView], activeViewId: 'v1'});
    expect(parseViewsStore(legacy).views).toHaveLength(1);
  });

  it('renvoie un store vide pour un contenu absent, corrompu ou mal formé', () => {
    expect(parseViewsStore(null)).toEqual({views: [], activeViewId: null});
    expect(parseViewsStore('{pas du json')).toEqual({views: [], activeViewId: null});
    expect(parseViewsStore('"une chaîne"')).toEqual({views: [], activeViewId: null});
    expect(parseViewsStore('{"views": "pas un tableau"}')).toEqual({views: [], activeViewId: null});
  });

  it('écarte les vues malformées sans perdre les autres', () => {
    const raw = JSON.stringify({views: [validView, {id: 'v2', name: 'Sans état'}], activeViewId: 'v1'});
    const store = parseViewsStore(raw);
    expect(store.views.map((view) => view.id)).toEqual(['v1']);
  });

  it('oublie une vue active qui n’existe plus', () => {
    const raw = JSON.stringify({views: [validView], activeViewId: 'supprimée'});
    expect(parseViewsStore(raw).activeViewId).toBeNull();
  });
});
