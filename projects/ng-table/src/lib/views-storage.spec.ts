import {describe, expect, it} from 'vitest';
import {mergeViewsStores, parseViewsStore, serializeViewsStore, VIEWS_SCHEMA_VERSION} from './views-storage';

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

  it('garde la vue par défaut si elle existe, l’oublie sinon', () => {
    const kept = parseViewsStore(JSON.stringify({views: [validView], activeViewId: null, defaultViewId: 'v1'}));
    expect(kept.defaultViewId).toBe('v1');
    const dropped = parseViewsStore(JSON.stringify({views: [validView], activeViewId: null, defaultViewId: 'absente'}));
    expect(dropped.defaultViewId).toBeUndefined();
  });

  describe('mergeViewsStores', () => {
    const other = {...validView, id: 'v2', name: 'Brouillons'};

    it('ajoute les nouvelles vues et garde la vue active/par défaut courante', () => {
      const current = {views: [validView], activeViewId: 'v1', defaultViewId: 'v1'} as never;
      const merged = mergeViewsStores(current, {views: [other], activeViewId: 'v2'} as never);
      expect(merged.views.map((v) => v.id)).toEqual(['v1', 'v2']);
      expect(merged.activeViewId).toBe('v1');
      expect(merged.defaultViewId).toBe('v1');
    });

    it('remplace une vue de même nom en gardant son id', () => {
      const current = {views: [validView], activeViewId: 'v1'} as never;
      const incoming = {...validView, id: 'autre-poste', state: {...validView.state, filters: {statut: 'ANNULEE'}}};
      const merged = mergeViewsStores(current, {views: [incoming], activeViewId: null} as never);
      expect(merged.views).toHaveLength(1);
      expect(merged.views[0].id).toBe('v1');
      expect(merged.views[0].state.filters).toEqual({statut: 'ANNULEE'});
    });
  });
});
