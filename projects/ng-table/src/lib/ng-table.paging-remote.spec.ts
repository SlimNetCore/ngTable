import {ComponentFixture} from '@angular/core/testing';
import {Observable, Subscriber} from 'rxjs';
import {describe, expect, it} from 'vitest';
import {NgTableComponent} from './ng-table.component';
import type {NgTableBlockRequest, NgTableBlockResult, NgTableRemoteDatasource, NgTableRemoteQuery} from './ng-table.models';
import {MAX_SCROLL_HEIGHT} from './virtual-window';
import {createTable, ids, type Row, ROWS, setupNgTableSpec} from './ng-table.spec-helpers';

describe('NgTableComponent : pagination et mode distant', () => {
  setupNgTableSpec();

  describe('pagination (mode local)', () => {
    it('ne tronque rien tant que pageTrackingEnabled est false', async () => {
      const {component} = await createTable({pageIndex: 0, pageSize: 2});

      expect(component.displayedRows()).toHaveLength(3);
    });

    it('tronque à la page courante quand le suivi de page est activé', async () => {
      const {component, setInput} = await createTable({pageTrackingEnabled: true, pageSize: 2});

      expect(ids(component.displayedRows())).toEqual(['1', '2']);

      await setInput('pageIndex', 1);
      expect(ids(component.displayedRows())).toEqual(['3']);
    });

    it('publie le total après filtrage', async () => {
      const counts: number[] = [];
      const {component, fixture} = await createTable({pageTrackingEnabled: true, pageSize: 2});
      component.filteredCountChange.subscribe((c) => counts.push(c));

      component.filtering.onFilterValue('statut', 'VALIDEE');
      await fixture.whenStable();

      expect(counts.at(-1)).toBe(2);
    });

    it('demande le retour à la première page quand un filtre change', async () => {
      const pages: number[] = [];
      const {component} = await createTable({pageTrackingEnabled: true, pageSize: 2, pageIndex: 1});
      component.pageIndex.subscribe((p) => pages.push(p));

      component.filtering.onFilterValue('statut', 'VALIDEE');

      expect(pages).toEqual([0]);
    });
  });

  describe('paginateur intégré', () => {
    const page = (pageIndex: number, pageSize: number) => ({pageIndex, pageSize, length: 3, previousPageIndex: 0});

    it('pagine seul, sans rien à relier, et revient en page 0 après un filtre', async () => {
      const {component, fixture} = await createTable({paginator: true, pageSize: 1});
      expect(fixture.nativeElement.querySelector('ng-table-paginator')).toBeTruthy();
      expect(ids(component.displayedRows())).toEqual(['1']);
      expect(component.paging.paginatorLength()).toBe(3);

      component.paging.onPage(page(2, 1));
      expect(ids(component.displayedRows())).toEqual(['3']);

      component.filtering.onFilterValue('statut', 'VALIDEE');
      expect(component.pageIndex()).toBe(0);
      expect(component.paging.paginatorLength()).toBe(2);
    });

    it('recule sur la dernière page si les données rétrécissent', async () => {
      const {component, setInput} = await createTable({paginator: true, pageSize: 1});
      component.paging.onPage(page(2, 1));

      await setInput('rows', ROWS.slice(0, 1));

      expect(component.pageIndex()).toBe(0);
      expect(ids(component.displayedRows())).toEqual(['1']);
    });

    it('restaure la pagination d’une vue sans intervention du parent', async () => {
      const {component} = await createTable({paginator: true, pageSize: 1, viewsEnabled: true, viewsStorageKey: 'pg'});
      component.paging.onPage(page(1, 1));
      component.saveCurrentAsView('Page 2');
      component.paging.onPage(page(0, 1));

      component.activateView(component.viewsList()[0]);

      expect(component.pageIndex()).toBe(1);
      expect(ids(component.displayedRows())).toEqual(['2']);
    });

    it('mode remote : relance la requête au changement de page et affiche totalCount', async () => {
      const queries: NgTableRemoteQuery[] = [];
      const {component} = await createTable({dataMode: 'remote', paginator: true, pageSize: 25, totalCount: 480});
      component.remoteQueryChange.subscribe((q) => queries.push(q));
      expect(component.paging.paginatorLength()).toBe(480);

      component.paging.onPage(page(3, 25));
      expect(queries.at(-1)!.page).toEqual({index: 3, size: 25});

      component.filtering.onFilterValue('statut', 'VALIDEE');
      expect(component.pageIndex()).toBe(0);
      expect(queries.at(-1)!.page).toEqual({index: 0, size: 25});
    });
  });

  describe('état « requête » (getQueryState / applyQueryState)', () => {
    it('applique tri, filtres et recherche en une seule requête remote, en ignorant les colonnes inconnues', async () => {
      const queries: NgTableRemoteQuery[] = [];
      const {component} = await createTable({dataMode: 'remote', pageTrackingEnabled: true, pageSize: 5, pageIndex: 2});
      component.remoteQueryChange.subscribe((q) => queries.push(q));

      component.applyQueryState({
        sorts: [{columnId: 'nom', direction: 'desc'}],
        filters: {statut: 'VALIDEE', inconnue: 'x'},
        search: 'bob',
      });

      expect(queries).toHaveLength(1);
      expect(queries[0]).toMatchObject({sort: {columnId: 'nom', direction: 'desc'}, search: 'bob', page: {index: 0, size: 5}});
      expect(component.getQueryState()).toEqual({
        sorts: [{columnId: 'nom', direction: 'desc'}],
        filters: {statut: 'VALIDEE'},
        search: 'bob',
        pageIndex: 0,
        pageSize: 5,
        groupBy: null,
        collapsedGroups: [],
      });
    });

    it('remplace les filtres existants et émet queryStateChange', async () => {
      const {component, fixture} = await createTable();
      const states: unknown[] = [];
      component.queryStateChange.subscribe((s) => states.push(s));
      component.filtering.onFilterValue('statut', 'VALIDEE');

      component.applyQueryState({filters: {actif: 'false'}});
      await fixture.whenStable();

      expect(ids(component.displayedRows())).toEqual(['2']);
      expect(states.at(-1)).toMatchObject({filters: {actif: 'false'}});
    });
  });

  describe('mode remote', () => {
    it('n’applique aucun filtrage ni tri local', async () => {
      const {component} = await createTable({dataMode: 'remote'});

      component.filtering.onFilterValue('statut', 'VALIDEE');
      component.sorting.onHeaderSort(component.columns()[1]);

      expect(ids(component.displayedRows())).toEqual(['1', '2', '3']);
    });

    it('émet la requête complète (tri + filtres + page) à chaque changement', async () => {
      const queries: NgTableRemoteQuery[] = [];
      const {component} = await createTable({
        dataMode: 'remote',
        pageTrackingEnabled: true,
        pageSize: 25,
        pageIndex: 3
      });
      component.remoteQueryChange.subscribe((q) => queries.push(q));

      component.filtering.onFilterValue('statut', 'VALIDEE');

      expect(queries).toHaveLength(1);
      expect(queries[0].filters['statut']).toBe('VALIDEE');
      expect(queries[0].sort).toEqual({columnId: '', direction: ''});
      // la page repart toujours à 0 sur un changement de filtre/tri
      expect(queries[0].page).toEqual({index: 0, size: 25});
    });

    it('embarque une taille de page nulle quand le suivi de page est désactivé', async () => {
      const queries: NgTableRemoteQuery[] = [];
      const {component} = await createTable({dataMode: 'remote'});
      component.remoteQueryChange.subscribe((q) => queries.push(q));

      component.sorting.onHeaderSort(component.columns()[0]);

      expect(queries[0].sort).toEqual({columnId: 'nom', direction: 'asc'});
      expect(queries[0].page).toEqual({index: 0, size: 0});
    });

    it('n’émet ni filteredCountChange ni pageIndexChange', async () => {
      const events: string[] = [];
      const {component, fixture} = await createTable({dataMode: 'remote', pageTrackingEnabled: true, pageIndex: 2});
      component.filteredCountChange.subscribe(() => events.push('count'));
      component.pageIndex.subscribe(() => events.push('page'));

      component.filtering.onFilterValue('statut', 'VALIDEE');
      await fixture.whenStable();

      expect(events).toEqual([]);
    });
  });

  describe('modèle serveur par blocs ([remoteDatasource])', () => {
    const TOTAL = 1_000_000;
    const rowAt = (i: number): Row => ({id: `${i}`, nom: `Client ${i}`, montant: i, statut: 'VALIDEE', actif: true, date: '2026-01-01'});

    /** Source dont le test déclenche les réponses une par une. */
    function controlledDatasource() {
      const pending: {request: NgTableBlockRequest; resolve: (r: NgTableBlockResult<Row>) => void; reject: (e: unknown) => void}[] = [];
      const datasource: NgTableRemoteDatasource<Row> = {
        getRows: (request) => new Promise((resolve, reject) => pending.push({request, resolve, reject})),
      };
      const answer = async (index = 0, total = TOTAL) => {
        const [call] = pending.splice(index, 1);
        const rows = Array.from({length: Math.max(0, Math.min(call.request.endRow, total) - call.request.startRow)}, (_, k) => rowAt(call.request.startRow + k));
        call.resolve({rows, totalCount: total});
        await Promise.resolve();
      };
      return {datasource, pending, answer};
    }

    const dataRows = (fixture: ComponentFixture<NgTableComponent>) =>
      [...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLTableRowElement>('tr.data-row')];
    const loadingRows = (fixture: ComponentFixture<NgTableComponent>) =>
      (fixture.nativeElement as HTMLElement).querySelectorAll('tr.loading-row').length;

    async function create(extra: Record<string, unknown> = {}) {
      const source = controlledDatasource();
      const table = await createTable({rows: [], dataMode: 'remote', remoteDatasource: source.datasource, ...extra});
      return {...table, ...source};
    }

    it('demande le premier bloc, affiche des lignes d’attente, puis les lignes reçues', async () => {
      const {fixture, pending, answer, component} = await create();
      const queries: unknown[] = [];
      component.remoteQueryChange.subscribe((q) => queries.push(q));

      expect(pending.map((p) => [p.request.startRow, p.request.endRow, p.request.page])).toEqual([[0, 100, {index: 0, size: 100}]]);
      expect(loadingRows(fixture)).toBeGreaterThan(0);

      await answer();
      await fixture.whenStable();

      expect(dataRows(fixture)).toHaveLength(25); // zone de 800 px, lignes de 48 px, plus la marge
      expect(component.remoteRowCount()).toBe(TOTAL);
      // 1 000 000 × 48 px dépasse la hauteur maximale : barre comprimée, hauteur totale plafonnée.
      const [top, bottom] = [...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('td.spacer-cell')].map((td) => parseFloat(td.style.height));
      expect(top + 25 * 48 + bottom).toBe(MAX_SCROLL_HEIGHT);
      expect(queries).toEqual([]); // la requête passe par getRows, pas par remoteQueryChange
    });

    it('au défilement, ne demande que les blocs de la zone affichée, sans les intermédiaires', async () => {
      const {fixture, pending, answer, component} = await create();
      await answer();
      await fixture.whenStable();

      component.scrollToIndex(450_000);
      await fixture.whenStable();

      expect(pending.map((p) => p.request.page.index)).toEqual([4499, 4500]); // la marge de 8 lignes déborde sur le bloc précédent
      await answer();
      await answer();
      await fixture.whenStable();
      expect(dataRows(fixture)[0].textContent).toContain('Client 449992');
    });

    it('limite les requêtes simultanées ; la suite part quand une réponse arrive', async () => {
      const {fixture, pending, answer} = await create({cacheBlockSize: 5, maxConcurrentBlockRequests: 2});
      expect(pending).toHaveLength(1); // total inconnu : un bloc
      await answer();
      await fixture.whenStable();

      expect(pending.map((p) => p.request.page.index)).toEqual([1, 2]); // 25 lignes rendues = 5 blocs, 2 à la fois
      await answer();
      await fixture.whenStable();
      expect(pending.map((p) => p.request.page.index)).toEqual([2, 3]);
    });

    it('un changement de tri purge le cache, remonte en haut et ignore les réponses périmées', async () => {
      const {fixture, pending, answer, component} = await create();
      await answer();
      await fixture.whenStable();
      component.scrollToIndex(5000);
      await fixture.whenStable();
      expect(pending).toHaveLength(2);

      component.sorting.onHeaderSort(component.columns()[1]);
      await fixture.whenStable();

      const fresh = pending.filter((p) => p.request.sort.columnId === 'montant');
      expect(fresh.map((p) => p.request.page.index)).toEqual([0]);
      await answer(0); // réponse de l'ancienne requête (bloc 49) : ignorée
      await fixture.whenStable();
      expect(dataRows(fixture)).toHaveLength(0);

      await answer(pending.findIndex((p) => p.request.sort.columnId === 'montant'));
      await fixture.whenStable();
      expect(dataRows(fixture)[0].textContent).toContain('Client 0');
    });

    it('bloc en échec : message, événement, pas de nouvel essai avant refreshRemoteDatasource()', async () => {
      const {fixture, pending, component} = await create();
      const errors: unknown[] = [];
      component.remoteBlockError.subscribe((e) => errors.push(e));

      pending.shift()!.reject(new Error('503'));
      await Promise.resolve();
      await fixture.whenStable();

      expect((fixture.nativeElement as HTMLElement).querySelector('.loading-failed')?.textContent).toContain('Chargement impossible');
      expect(errors).toHaveLength(1);
      expect(pending).toHaveLength(0);

      component.refreshRemoteDatasource();
      await fixture.whenStable();
      expect(pending).toHaveLength(1);
    });

    it('[prefetchBlocks] : charge d’avance le bloc suivant dans le sens du défilement', async () => {
      const {fixture, pending, answer, component} = await create({prefetchBlocks: 1});
      expect(pending.map((p) => p.request.page.index)).toEqual([0]); // total inconnu : rien d'avance
      await answer();
      await fixture.whenStable();
      expect(pending.map((p) => p.request.page.index)).toEqual([1]);
      await answer();
      await fixture.whenStable();
      expect(pending).toHaveLength(0); // un seul bloc d'avance

      component.scrollToIndex(5000);
      await fixture.whenStable();
      expect(pending.map((p) => p.request.page.index)).toEqual([49, 50]);
      await answer();
      await answer();
      await fixture.whenStable();
      expect(pending.map((p) => p.request.page.index)).toEqual([51]);
      await answer();
      await fixture.whenStable();

      component.scrollToIndex(4000);
      await fixture.whenStable();
      await answer();
      await answer();
      await fixture.whenStable();
      expect(pending.map((p) => p.request.page.index)).toEqual([38]); // vers le haut : le bloc précédent
    });

    it('pagination par clé : la demande porte la dernière ligne du bloc précédent quand elle est en mémoire', async () => {
      const {fixture, pending, answer, component} = await create({prefetchBlocks: 1});
      expect(pending[0].request.afterRow).toBeUndefined();
      await answer();
      await fixture.whenStable();
      // Bloc 1 demandé d'avance : la ligne 99 (fin du bloc 0) est connue.
      expect(pending[0].request.page.index).toBe(1);
      expect((pending[0].request.afterRow as Row).id).toBe('99');
      expect(pending[0].request.beforeRow).toBeUndefined();
      await answer();
      await fixture.whenStable();

      // Après un saut, pas de ligne voisine : le serveur se sert de startRow.
      component.scrollToIndex(5000);
      await fixture.whenStable();
      expect(pending.map((p) => p.request.afterRow)).toEqual([undefined, undefined]);
    });

    it('signale par AbortSignal les demandes devenues inutiles, sans erreur ni bloc en échec', async () => {
      const {fixture, pending, answer, component} = await create();
      const errors: unknown[] = [];
      component.remoteBlockError.subscribe((e) => errors.push(e));
      await answer();
      await fixture.whenStable();

      component.scrollToIndex(5000);
      await fixture.whenStable();
      const left = [...pending];
      expect(left.map((p) => p.request.signal?.aborted)).toEqual([false, false]);

      // Défilement loin de là : les deux demandes sont signalées, mais occupent encore les deux places.
      component.scrollToIndex(900_000);
      await fixture.whenStable();
      expect(left.map((p) => p.request.signal?.aborted)).toEqual([true, true]);
      expect(pending).toHaveLength(2);

      // La source annule réellement (comme `fetch` avec le signal) : les places se libèrent, la nouvelle zone part.
      for (const call of pending.splice(0)) {
        call.reject(new DOMException('annulée', 'AbortError'));
      }
      await Promise.resolve();
      await fixture.whenStable();
      expect(pending.map((p) => p.request.page.index)).toEqual([8999, 9000]);
      expect(errors).toEqual([]);
      expect((fixture.nativeElement as HTMLElement).querySelector('.loading-failed')).toBeNull();

      // Changement de tri : les demandes en cours sont signalées aussi.
      const beforeSort = [...pending];
      component.sorting.onHeaderSort(component.columns()[1]);
      await fixture.whenStable();
      expect(beforeSort.map((p) => p.request.signal?.aborted)).toEqual([true, true]);
    });

    it('source Observable : désabonnée quand la demande ne sert plus', async () => {
      let unsubscribed = 0;
      const subscribers: Subscriber<NgTableBlockResult<Row>>[] = [];
      const datasource: NgTableRemoteDatasource<Row> = {
        getRows: () =>
          new Observable<NgTableBlockResult<Row>>((subscriber) => {
            subscribers.push(subscriber);
            return () => unsubscribed++;
          }),
      };
      const {fixture, component} = await createTable({rows: [], dataMode: 'remote', remoteDatasource: datasource});
      subscribers[0].next({rows: Array.from({length: 100}, (_, i) => rowAt(i)), totalCount: TOTAL});
      await Promise.resolve();
      await fixture.whenStable();
      expect(dataRows(fixture)[0].textContent).toContain('Client 0');
      const done = unsubscribed;

      component.scrollToIndex(5000);
      await fixture.whenStable();
      component.scrollToIndex(900_000);
      await fixture.whenStable();
      expect(unsubscribed - done).toBe(2);
    });

    it('pas de paginateur intégré en modèle par blocs', async () => {
      const {fixture} = await create({paginator: true});
      expect((fixture.nativeElement as HTMLElement).querySelector('ng-table-paginator')).toBeNull();
    });
  });
});
