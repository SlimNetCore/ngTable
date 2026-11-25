import {describe, expect, it, vi} from 'vitest';
import type {NgTableRemoteExportRequest} from './ng-table.models';
import {columns, createTable, ids, readBlobText, setupNgTableSpec} from './ng-table.spec-helpers';

describe('NgTableComponent : vues et export', () => {
  setupNgTableSpec();

  describe('vues sauvegardées', () => {
    function storedView(id: string, name: string, statut: string) {
      return {
        id, name, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
        state: {columnVisibility: {}, columnOrder: [], sort: {columnId: '', direction: ''}, filters: {statut}},
      };
    }

    it('ouvre la liste sur la vue par défaut plutôt que sur la dernière vue active', async () => {
      localStorage.setItem('ng-table.views.def', JSON.stringify({
        views: [storedView('v1', 'Brouillons', 'BROUILLON'), storedView('v2', 'Validées', 'VALIDEE')],
        activeViewId: 'v2',
        defaultViewId: 'v1',
      }));

      const {component} = await createTable({viewsEnabled: true, viewsStorageKey: 'def'});

      expect(component.activeViewId()).toBe('v1');
      expect(ids(component.displayedRows())).toEqual(['2']);
      expect(JSON.parse(localStorage.getItem('ng-table.views.def')!).activeViewId).toBe('v1');
    });

    it('définit / retire la vue par défaut ; supprimer la vue par défaut l’oublie', async () => {
      const {component} = await createTable({viewsEnabled: true, viewsStorageKey: 'def'});
      component.saveCurrentAsView('A');
      component.saveCurrentAsView('B');
      const [a, b] = component.viewsList();

      component.toggleDefaultView(a);
      expect(component.isDefaultView(a)).toBe(true);
      component.saveCurrentAsView('B'); // une écriture ultérieure ne doit pas perdre la vue par défaut
      expect(component.isDefaultView(a)).toBe(true);

      component.activateView(b);
      component.deleteView(b); // la vue active supprimée : on retombe sur la vue par défaut
      expect(component.activeViewId()).toBe(a.id);

      component.deleteView(a);
      expect(JSON.parse(localStorage.getItem('ng-table.views.def')!).defaultViewId).toBeNull();
    });

    it('exporte puis réimporte les vues (fusion par nom, puis remplacement)', async () => {
      const source = await createTable({viewsEnabled: true, viewsStorageKey: 'src'});
      source.component.filtering.onFilterValue('statut', 'BROUILLON');
      source.component.saveCurrentAsView('Brouillons');
      const json = source.component.exportViews();

      const target = await createTable({viewsEnabled: true, viewsStorageKey: 'dst'});
      target.component.saveCurrentAsView('Tout');
      target.component.saveCurrentAsView('Brouillons'); // même nom : sera remplacée, pas dupliquée
      const events: unknown[] = [];
      target.component.viewsImported.subscribe((e) => events.push(e));

      expect(target.component.importViews(json)).toBe(1);
      expect(target.component.viewsList().map((v) => v.name)).toEqual(['Tout', 'Brouillons']);
      expect(target.component.viewsList()[1].state.filters['statut']).toBe('BROUILLON');
      expect(ids(target.component.displayedRows())).toEqual(['1', '2', '3']); // la fusion ne change pas l'affichage

      target.component.importViews(json, 'replace');
      expect(target.component.viewsList().map((v) => v.name)).toEqual(['Brouillons']);
      expect(ids(target.component.displayedRows())).toEqual(['2']); // le remplacement applique la vue active du fichier

      expect(events).toEqual([{imported: 1, mode: 'merge'}, {imported: 1, mode: 'replace'}]);
    });

    it('ignore un fichier de vues invalide', async () => {
      const {component} = await createTable({viewsEnabled: true, viewsStorageKey: 'bad'});
      component.saveCurrentAsView('A');

      expect(component.importViews('pas du json', 'replace')).toBe(0);
      expect(component.viewsList().map((v) => v.name)).toEqual(['A']);
    });

    it('enregistre l’état courant, l’active, et le persiste dans localStorage', async () => {
      const {component} = await createTable({viewsEnabled: true, viewsStorageKey: 'test-list'});
      component.columnLayout.onToggleColumnVisibility('montant', false);
      component.filtering.onFilterValue('statut', 'VALIDEE');

      component.saveCurrentAsView('Ma vue');

      expect(component.viewsList()).toHaveLength(1);
      expect(component.activeView()?.name).toBe('Ma vue');
      expect(component.activeView()?.state.filters['statut']).toBe('VALIDEE');
      expect(component.activeView()?.state.columnVisibility['montant']).toBe(false);

      const stored = JSON.parse(localStorage.getItem('ng-table.views.test-list') ?? '{}');
      expect(stored.views).toHaveLength(1);
      expect(stored.activeViewId).toBe(component.activeViewId());
    });

    it('écrase une vue portant le même nom au lieu d’en créer une seconde', async () => {
      const {component} = await createTable({viewsEnabled: true, viewsStorageKey: 'test-list'});

      component.saveCurrentAsView('Ma vue');
      component.filtering.onFilterValue('statut', 'BROUILLON');
      component.saveCurrentAsView('Ma vue');

      expect(component.viewsList()).toHaveLength(1);
      expect(component.activeView()?.state.filters['statut']).toBe('BROUILLON');
    });

    it('émet viewPaginationRestore avec la pagination sauvegardée à l’activation (mode local)', async () => {
      const {component} = await createTable({
        viewsEnabled: true,
        viewsStorageKey: 'test-list',
        pageTrackingEnabled: true,
        pageSize: 2,
        pageIndex: 1,
      });
      component.saveCurrentAsView('Page 2, taille 2');
      const view = component.viewsList()[0];

      const restores: unknown[] = [];
      const pageIndexEmits: number[] = [];
      component.viewPaginationRestore.subscribe((e) => restores.push(e));
      component.pageIndex.subscribe((p) => pageIndexEmits.push(p));

      component.activateView(view);

      expect(restores).toEqual([{pageIndex: 1, pageSize: 2}]);
      // Ne doit PAS avoir été écrasé par une remise à 0 déclenchée par ailleurs.
      expect(pageIndexEmits).not.toContain(0);
    });

    it('restaure la pagination sauvegardée dans remoteQueryChange en mode remote (pas une page 0)', async () => {
      const {component} = await createTable({
        dataMode: 'remote',
        viewsEnabled: true,
        viewsStorageKey: 'test-list',
        pageTrackingEnabled: true,
        pageSize: 5,
        pageIndex: 3,
      });
      component.saveCurrentAsView('Page 3, taille 5');
      const view = component.viewsList()[0];

      const queries: unknown[] = [];
      component.remoteQueryChange.subscribe((q) => queries.push(q));

      component.activateView(view);

      expect(queries).toEqual([
        {sort: {columnId: '', direction: ''}, sorts: [], filters: expect.any(Object), page: {index: 3, size: 5}, search: '', groupBy: null, collapsedGroups: []},
      ]);
    });

    it('n’émet pas viewPaginationRestore pour une vue sans pagination sauvegardée', async () => {
      const {component} = await createTable({viewsEnabled: true, viewsStorageKey: 'test-list'});
      component.saveCurrentAsView('Sans pagination'); // pageTrackingEnabled=false : pas de pageIndex/pageSize sauvegardés
      const view = component.viewsList()[0];

      const restores: unknown[] = [];
      component.viewPaginationRestore.subscribe((e) => restores.push(e));

      component.activateView(view);

      expect(restores).toEqual([]);
    });

    it('met à jour une vue existante avec l’affichage courant sans changer son nom ni son id', async () => {
      const {component} = await createTable({viewsEnabled: true, viewsStorageKey: 'test-list'});
      component.filtering.onFilterValue('statut', 'VALIDEE');
      component.saveCurrentAsView('Ma vue');
      const view = component.viewsList()[0];

      component.filtering.onFilterValue('statut', 'BROUILLON');
      component.updateView(view);

      expect(component.viewsList()).toHaveLength(1);
      expect(component.viewsList()[0].id).toBe(view.id);
      expect(component.viewsList()[0].name).toBe('Ma vue');
      expect(component.activeView()?.state.filters['statut']).toBe('BROUILLON');
      expect(component.activeViewId()).toBe(view.id);
    });

    it('affiche une coche transitoire sur le bouton de mise à jour d’une vue', async () => {
      const {component} = await createTable({viewsEnabled: true, viewsStorageKey: 'test-list'});
      vi.useFakeTimers();
      component.saveCurrentAsView('Ma vue');
      const view = component.viewsList()[0];

      expect(component.views.viewUpdateIconName(view)).toBe('sync');

      component.updateView(view);
      expect(component.views.viewUpdateIconName(view)).toBe('check');

      vi.advanceTimersByTime(1400);
      expect(component.views.viewUpdateIconName(view)).toBe('sync');
    });

    it('réapplique l’état complet à l’activation d’une vue', async () => {
      const {component} = await createTable({viewsEnabled: true, viewsStorageKey: 'test-list'});
      component.filtering.onFilterValue('statut', 'VALIDEE');
      component.saveCurrentAsView('Validées');
      const view = component.viewsList()[0];
      component.clearAllFilters();
      expect(ids(component.displayedRows())).toHaveLength(3);

      component.activateView(view);

      expect(ids(component.displayedRows())).toEqual(['1', '3']);
      expect(component.activeViewId()).toBe(view.id);
    });

    it('enregistre les largeurs de colonnes redimensionnées dans la vue et les restaure', async () => {
      const cols = columns();
      cols[0] = {...cols[0], resizable: true, widthPx: 200, minWidthPx: 100, maxWidthPx: 300};
      const {component} = await createTable({columns: cols, viewsEnabled: true, viewsStorageKey: 'test-list'});
      const column = component.columns()[0];
      const resizeEvent = {
        detail: 1,
        clientX: 0,
        target: null,
        preventDefault: () => undefined,
        stopPropagation: () => undefined,
      } as unknown as MouseEvent;

      component.columnResize.onResizeStart(resizeEvent, column);
      component.columnResize.onResizeMove({clientX: 60} as MouseEvent);
      component.columnResize.stopResize();
      expect(component.columnLayout.columnWidthPx(column)).toBe(260);

      component.saveCurrentAsView('Large');
      const view = component.viewsList()[0];
      expect(view.state.columnWidths?.[column.id]).toBe(260);

      // L'utilisateur remet la colonne à une autre largeur, puis réactive la vue.
      component.columnResize.onResizeStart(resizeEvent, column);
      component.columnResize.onResizeMove({clientX: -60} as MouseEvent);
      component.columnResize.stopResize();
      expect(component.columnLayout.columnWidthPx(column)).toBe(200);

      component.activateView(view);

      expect(component.columnLayout.columnWidthPx(column)).toBe(260);
    });

    it('active sans erreur une vue enregistrée avant l’ajout des largeurs (columnWidths absent)', async () => {
      const legacyView = {
        id: 'v-legacy',
        name: 'Ancienne vue',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        state: {
          columnVisibility: {nom: true, montant: true, statut: true, actif: true},
          columnOrder: [],
          sort: {columnId: '', direction: '' as const},
          filters: {statut: 'VALIDEE'},
        },
      };
      localStorage.setItem(
        'ng-table.views.test-list',
        JSON.stringify({views: [legacyView], activeViewId: 'v-legacy'}),
      );

      const {component} = await createTable({viewsEnabled: true, viewsStorageKey: 'test-list'});

      expect(component.activeViewId()).toBe('v-legacy');
      expect(ids(component.displayedRows())).toEqual(['1', '3']);
    });

    it('supprime une vue et bascule sur celle qui reste', async () => {
      const {component} = await createTable({viewsEnabled: true, viewsStorageKey: 'test-list'});
      component.saveCurrentAsView('Vue A');
      component.saveCurrentAsView('Vue B');
      const [viewA, viewB] = component.viewsList();

      component.deleteView(viewB);

      expect(component.viewsList()).toEqual([viewA]);
      expect(component.activeViewId()).toBe(viewA.id);
    });

    it('ne touche pas au localStorage en mode contrôlé et notifie le parent', async () => {
      const {component} = await createTable({
        viewsEnabled: true,
        viewsStorageKey: 'test-list',
        viewsStore: {views: [], activeViewId: null},
      });
      const stores: unknown[] = [];
      component.viewsStoreChange.subscribe((s) => stores.push(s));

      component.saveCurrentAsView('Ma vue');

      expect(stores).toHaveLength(1);
      expect(localStorage.getItem('ng-table.views.test-list')).toBeNull();
    });

    it('restaure automatiquement la vue active trouvée en localStorage', async () => {
      const view = {
        id: 'v1',
        name: 'Validées',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        state: {
          columnVisibility: {nom: true, montant: true, statut: true, actif: true},
          columnOrder: [],
          sort: {columnId: 'montant', direction: 'desc' as const},
          filters: {statut: 'VALIDEE'},
        },
      };
      localStorage.setItem('ng-table.views.test-list', JSON.stringify({views: [view], activeViewId: 'v1'}));

      const {component} = await createTable({viewsEnabled: true, viewsStorageKey: 'test-list'});

      expect(component.activeViewId()).toBe('v1');
      expect(ids(component.displayedRows())).toEqual(['1', '3']); // filtré + trié desc sur montant
    });
  });

  describe('export', () => {
    it('exporte un CSV local des colonnes visibles, exclut les colonnes exportable:false', async () => {
      const cols = columns();
      cols.push({id: 'actions', header: 'Actions', valueAccessor: () => '', exportable: false});
      const {component} = await createTable({columns: cols, exportEnabled: true});

      let capturedBlob: Blob | null = null;
      const createObjectURLSpy = vi
        .spyOn(URL, 'createObjectURL')
        .mockImplementation((blob) => {
          capturedBlob = blob as Blob;
          return 'blob:mock';
        });
      vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
      const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

      const completed: unknown[] = [];
      component.localExportCompleted.subscribe((e) => completed.push(e));

      component.openExportDialog();

      expect(completed).toEqual([{fromPage: 1, toPage: 1, rowCount: 3}]);
      expect(clickSpy).toHaveBeenCalledTimes(1);
      const text = await readBlobText(capturedBlob!);
      expect(text).toContain('Nom;Montant;Statut;Actif');
      expect(text).not.toContain('Actions');

      createObjectURLSpy.mockRestore();
    });

    it('émet remoteExportRequested en mode remote, sans générer de fichier', async () => {
      const {component} = await createTable({exportEnabled: true, exportMode: 'remote', dataMode: 'remote'});
      const requests: unknown[] = [];
      component.remoteExportRequested.subscribe((q) => requests.push(q));
      const createObjectURLSpy = vi.spyOn(URL, 'createObjectURL');

      component.openExportDialog();

      expect(requests).toHaveLength(1);
      expect(createObjectURLSpy).not.toHaveBeenCalled();
      createObjectURLSpy.mockRestore();
    });

    it('remoteExportRequested porte les colonnes affichées, dans l’ordre, avec format et nom de fichier', async () => {
      const cols = columns().map((column) => (column.id === 'actif' ? {...column, exportable: false} : column));
      const {component, setInput} = await createTable({
        columns: cols, exportEnabled: true, exportMode: 'remote', dataMode: 'remote',
        exportFormat: 'xlsx', exportFilename: 'commandes', columnOrder: ['statut', 'nom', 'montant', 'actif'],
      });
      await setInput('columnVisibility', {montant: false});
      const requests: NgTableRemoteExportRequest[] = [];
      component.remoteExportRequested.subscribe((q) => requests.push(q));

      component.openExportDialog();

      expect(requests[0]).toMatchObject({
        columns: [{id: 'statut', header: 'Statut'}, {id: 'nom', header: 'Nom'}], // montant masqué, actif non exportable
        format: 'xlsx',
        filename: 'commandes',
        filters: expect.any(Object),
        page: {index: 0, size: 0},
      });
    });

    it('exige une confirmation de plage quand plusieurs pages sont exportables', async () => {
      const {component} = await createTable({exportEnabled: true, pageTrackingEnabled: true, pageSize: 1});

      expect(component.exporting.exportTotalPages()).toBe(3);

      const createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock');
      vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
      vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

      component.openExportDialog();
      expect(createObjectURLSpy).not.toHaveBeenCalled();
      expect(component.exporting.exportFromPage()).toBe(1);
      expect(component.exporting.exportToPage()).toBe(3);

      component.exporting.exportFromPage.set(2);
      component.exporting.exportToPage.set(3);
      component.exporting.confirmExportDialog();
      expect(createObjectURLSpy).toHaveBeenCalledTimes(1);

      createObjectURLSpy.mockRestore();
    });
  });
});
