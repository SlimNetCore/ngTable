import {computed, provideZonelessChangeDetection, signal} from '@angular/core';
import {ComponentFixture, TestBed} from '@angular/core/testing';
import {MatCheckboxChange} from '@angular/material/checkbox';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {NgTableColumn, NgTableComponent, NgTableRemoteQuery, NgTableSortChange} from './ng-table.component';
import {NG_TABLE_DEFAULT_LABELS, provideNgTableLabels} from './ng-table-labels';

interface Row {
  id: string;
  nom: string;
  montant: number;
  statut: string;
  actif: boolean;
  date: string;
}

const ROWS: Row[] = [
  {id: '1', nom: 'Charlie', montant: 300, statut: 'VALIDEE', actif: true, date: '2026-03-02'},
  {id: '2', nom: 'alice', montant: 100, statut: 'BROUILLON', actif: false, date: '2026-01-15'},
  {id: '3', nom: 'Bob', montant: 200, statut: 'VALIDEE', actif: true, date: '2026-02-20'},
];

function columns(): NgTableColumn<Row>[] {
  return [
    {id: 'nom', header: 'Nom', valueAccessor: (r) => r.nom, sortable: true, filter: {type: 'text'}, copy: true},
    {id: 'montant', header: 'Montant', valueAccessor: (r) => r.montant, sortable: true},
    {
      id: 'statut',
      header: 'Statut',
      valueAccessor: (r) => r.statut,
      filter: {
        type: 'enum',
        label: 'Statut',
        options: [
          {value: 'VALIDEE', label: 'Validée'},
          {value: 'BROUILLON', label: 'Brouillon'},
        ],
      },
    },
    {id: 'actif', header: 'Actif', valueAccessor: (r) => r.actif, filter: {type: 'boolean'}},
  ];
}

type Harness = {
  fixture: ComponentFixture<NgTableComponent>;
  component: NgTableComponent;
  setInput: (name: string, value: unknown) => Promise<void>;
};

async function createTable(inputs: Record<string, unknown> = {}): Promise<Harness> {
  const fixture = TestBed.createComponent(NgTableComponent);
  const component = fixture.componentInstance;

  const allInputs: Record<string, unknown> = {columns: columns(), rows: ROWS, ...inputs};
  for (const [name, value] of Object.entries(allInputs)) {
    fixture.componentRef.setInput(name, value);
  }
  await fixture.whenStable();

  return {
    fixture,
    component,
    setInput: async (name, value) => {
      fixture.componentRef.setInput(name, value);
      await fixture.whenStable();
    },
  };
}

function ids(rows: unknown[]): string[] {
  return (rows as Row[]).map((r) => r.id);
}

describe('NgTableComponent', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({providers: [provideZonelessChangeDetection()]});
  });

  afterEach(() => {
    vi.useRealTimers();
    TestBed.resetTestingModule();
  });

  describe('rendu de base', () => {
    it('affiche toutes les lignes et les colonnes déclarées', async () => {
      const {component} = await createTable();

      expect(ids(component.displayedRows())).toEqual(['1', '2', '3']);
      expect(component.displayedColumnIds()).toEqual(['nom', 'montant', 'statut', 'actif']);
      expect(component.hasColumns()).toBe(true);
    });

    it('masque les colonnes déclarées `visible: false`', async () => {
      const withHidden = columns();
      withHidden[1] = {...withHidden[1], visible: false};
      const {component} = await createTable({columns: withHidden});

      expect(component.displayedColumnIds()).toEqual(['nom', 'statut', 'actif']);
    });

    it('ajoute la colonne technique de sélection quand elle est activée', async () => {
      const {component} = await createTable({rowSelectionEnabled: true});

      expect(component.displayedColumnIds()[0]).toBe('__row_selection__');
    });

    it('garde la même référence de displayedColumnIds quand les ids sont identiques', async () => {
      const {component, setInput} = await createTable();
      const first = component.displayedColumnIds();

      // nouveau tableau de colonnes (donc recalcul), mais mêmes ids dans le même ordre :
      // `equal` doit conserver la référence pour ne pas faire retravailler mat-table.
      await setInput('columns', columns());

      expect(component.displayedColumnIds()).toBe(first);
    });
  });

  describe('tri (mode local)', () => {
    it('bascule asc -> desc -> aucun tri', async () => {
      const {component} = await createTable();
      const col = component.columns()[0];

      component.onHeaderSort(col);
      expect(ids(component.displayedRows())).toEqual(['2', '3', '1']); // alice, Bob, Charlie

      component.onHeaderSort(col);
      expect(ids(component.displayedRows())).toEqual(['1', '3', '2']);

      component.onHeaderSort(col);
      expect(ids(component.displayedRows())).toEqual(['1', '2', '3']); // ordre source
    });

    it('trie les nombres numériquement, pas alphabétiquement', async () => {
      const {component} = await createTable();

      component.onHeaderSort(component.columns()[1]);

      expect((component.displayedRows() as Row[]).map((r) => r.montant)).toEqual([100, 200, 300]);
    });

    it('ignore le tri sur une colonne non triable', async () => {
      const {component} = await createTable();
      const emitted: NgTableSortChange[] = [];
      component.sortChange.subscribe((e) => emitted.push(e));

      component.onHeaderSort(component.columns()[3]); // `actif` : sortable non défini

      expect(emitted).toEqual([]);
      expect(ids(component.displayedRows())).toEqual(['1', '2', '3']);
    });

    it('utilise sortValueAccessor quand il est fourni', async () => {
      const cols = columns();
      cols[0] = {
        ...cols[0],
        valueAccessor: (r) => `#${r.nom}`,
        sortValueAccessor: (r) => new Date(r.date),
      };
      const {component} = await createTable({columns: cols});

      component.onHeaderSort(component.columns()[0]);

      expect(ids(component.displayedRows())).toEqual(['2', '3', '1']); // par date croissante
    });
  });

  describe('filtrage (mode local)', () => {
    it('filtre en "contient", insensible à la casse', async () => {
      const {component} = await createTable();

      component.onFilterValue('statut', 'VALIDEE'); // filtre enum : commit immédiat

      expect(ids(component.displayedRows())).toEqual(['1', '3']);
      expect(component.isFilterActive('statut')).toBe(true);
    });

    it('interprète les valeurs booléennes', async () => {
      const {component} = await createTable();

      component.onFilterValue('actif', 'false');

      expect(ids(component.displayedRows())).toEqual(['2']);
    });

    it('applique filterPredicate quand il est fourni', async () => {
      const cols = columns();
      cols[1] = {...cols[1], filter: {type: 'text'}, filterPredicate: (row, value) => row.montant > Number(value)};
      const {component} = await createTable({columns: cols, filterDebounceMs: 0});

      component['commitFilterValue']('montant', '150');

      expect(ids(component.displayedRows())).toEqual(['1', '3']);
    });

    it('construit le jeu de filtres à partir des colonnes, sans intervention du parent', async () => {
      const emitted: Record<string, string>[] = [];
      const {component} = await createTable();
      component.filtersChange.subscribe((f) => emitted.push(f));

      component.onFilterValue('statut', 'VALIDEE');

      // une entrée par colonne filtrable (nom, statut, actif), montant n'a pas de filtre
      expect(Object.keys(emitted[0]).sort()).toEqual(['actif', 'nom', 'statut']);
    });

    it('réinitialise tous les filtres', async () => {
      const {component} = await createTable();
      component.onFilterValue('statut', 'VALIDEE');

      component.clearAllFilters();

      expect(ids(component.displayedRows())).toEqual(['1', '2', '3']);
      expect(component.activeFilterSummaries()).toEqual([]);
    });

    it('résout les libellés d’options dans la barre de filtres actifs', async () => {
      const {component} = await createTable();

      component.onFilterValue('statut', 'VALIDEE');

      expect(component.activeFilterSummaries()).toEqual([
        {columnId: 'statut', label: 'Statut', value: 'Validée'},
      ]);
    });

    it('debounce les filtres texte et commit une seule fois', async () => {
      const {component} = await createTable();
      vi.useFakeTimers();

      component.onFilterValue('nom', 'a');
      component.onFilterValue('nom', 'al');
      component.onFilterValue('nom', 'ali');
      expect(component.currentFilterValue('nom')).toBe(''); // rien de committé pendant la frappe

      vi.advanceTimersByTime(400);

      expect(component.currentFilterValue('nom')).toBe('ali');
      expect(ids(component.displayedRows())).toEqual(['2']);
    });

    it('annule une frappe encore en attente quand le filtre est effacé', async () => {
      const {component} = await createTable();
      vi.useFakeTimers();

      component.onFilterValue('nom', 'ali');
      component.clearFilter('nom'); // action immédiate
      vi.advanceTimersByTime(400);

      expect(component.currentFilterValue('nom')).toBe('');
      expect(ids(component.displayedRows())).toEqual(['1', '2', '3']);
    });
  });

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

      component.onFilterValue('statut', 'VALIDEE');
      await fixture.whenStable();

      expect(counts.at(-1)).toBe(2);
    });

    it('demande le retour à la première page quand un filtre change', async () => {
      const pages: number[] = [];
      const {component} = await createTable({pageTrackingEnabled: true, pageSize: 2, pageIndex: 1});
      component.pageIndexChange.subscribe((p) => pages.push(p));

      component.onFilterValue('statut', 'VALIDEE');

      expect(pages).toEqual([0]);
    });
  });

  describe('mode remote', () => {
    it('n’applique aucun filtrage ni tri local', async () => {
      const {component} = await createTable({dataMode: 'remote'});

      component.onFilterValue('statut', 'VALIDEE');
      component.onHeaderSort(component.columns()[1]);

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

      component.onFilterValue('statut', 'VALIDEE');

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

      component.onHeaderSort(component.columns()[0]);

      expect(queries[0].sort).toEqual({columnId: 'nom', direction: 'asc'});
      expect(queries[0].page).toEqual({index: 0, size: 0});
    });

    it('n’émet ni filteredCountChange ni pageIndexChange', async () => {
      const events: string[] = [];
      const {component, fixture} = await createTable({dataMode: 'remote', pageTrackingEnabled: true, pageIndex: 2});
      component.filteredCountChange.subscribe(() => events.push('count'));
      component.pageIndexChange.subscribe(() => events.push('page'));

      component.onFilterValue('statut', 'VALIDEE');
      await fixture.whenStable();

      expect(events).toEqual([]);
    });
  });

  describe('visibilité et ordre des colonnes', () => {
    it('masque une colonne via le menu et notifie le parent', async () => {
      const emitted: Record<string, boolean>[] = [];
      const {component} = await createTable();
      component.columnVisibilityChange.subscribe((v) => emitted.push(v));

      component.onToggleColumnVisibility('montant', false);

      expect(component.displayedColumnIds()).toEqual(['nom', 'statut', 'actif']);
      expect(emitted.at(-1)?.['montant']).toBe(false);
    });

    it('respecte la visibilité pilotée par le parent (mode contrôlé)', async () => {
      const {component} = await createTable({
        columnVisibility: {
          nom: true,
          montant: false,
          statut: true,
          actif: false
        }
      });

      expect(component.displayedColumnIds()).toEqual(['nom', 'statut']);
    });

    it('réordonne les colonnes au drop et notifie le nouvel ordre', async () => {
      const emitted: string[][] = [];
      const {component} = await createTable();
      component.columnOrderChange.subscribe((o) => emitted.push(o));
      const dragEvent = {preventDefault: () => undefined, dataTransfer: null} as unknown as DragEvent;

      component.onColumnDragStart(dragEvent, component.columns()[3]); // `actif`
      component.onColumnDrop(dragEvent, component.columns()[0]); // déposé sur `nom`

      expect(emitted.at(-1)).toEqual(['actif', 'nom', 'montant', 'statut']);
      expect(component.displayedColumnIds()).toEqual(['actif', 'nom', 'montant', 'statut']);
    });

    it('ignore un drop sur la colonne d’origine', async () => {
      const emitted: string[][] = [];
      const {component} = await createTable();
      component.columnOrderChange.subscribe((o) => emitted.push(o));
      const dragEvent = {preventDefault: () => undefined, dataTransfer: null} as unknown as DragEvent;

      component.onColumnDragStart(dragEvent, component.columns()[0]);
      component.onColumnDrop(dragEvent, component.columns()[0]);

      expect(emitted).toEqual([]);
    });
  });

  describe('sélection de lignes', () => {
    it('sélectionne une ligne et publie les lignes sélectionnées', async () => {
      const {component} = await createTable({rowSelectionEnabled: true, rowKeyAccessor: (r: Row) => r.id});
      const events: unknown[] = [];
      component.selectionChange.subscribe((e) => events.push(e));

      component.onToggleRowSelection({checked: true} as MatCheckboxChange, ROWS[1]);

      expect(component.isRowSelected(ROWS[1])).toBe(true);
      expect(component.selectedRowsCount()).toBe(1);
      expect(events).toHaveLength(1);
      expect((events[0] as { selectedRows: Row[] }).selectedRows).toEqual([ROWS[1]]);
    });

    it('sélectionne / désélectionne toutes les lignes affichées', async () => {
      const {component} = await createTable({rowSelectionEnabled: true, rowKeyAccessor: (r: Row) => r.id});

      component.onToggleAllDisplayedRows({checked: true} as MatCheckboxChange);
      expect(component.areAllDisplayedRowsSelected()).toBe(true);

      component.onToggleAllDisplayedRows({checked: false} as MatCheckboxChange);
      expect(component.selectedRowsCount()).toBe(0);
    });

    it('signale une sélection partielle', async () => {
      const {component} = await createTable({rowSelectionEnabled: true, rowKeyAccessor: (r: Row) => r.id});

      component.onToggleRowSelection({checked: true} as MatCheckboxChange, ROWS[0]);

      expect(component.hasPartiallySelectedDisplayedRows()).toBe(true);
      expect(component.areAllDisplayedRowsSelected()).toBe(false);
    });
  });

  describe('vues sauvegardées', () => {
    it('enregistre l’état courant, l’active, et le persiste dans localStorage', async () => {
      const {component} = await createTable({viewsEnabled: true, viewsStorageKey: 'test-list'});
      component.onToggleColumnVisibility('montant', false);
      component.onFilterValue('statut', 'VALIDEE');

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
      component.onFilterValue('statut', 'BROUILLON');
      component.saveCurrentAsView('Ma vue');

      expect(component.viewsList()).toHaveLength(1);
      expect(component.activeView()?.state.filters['statut']).toBe('BROUILLON');
    });

    it('réapplique l’état complet à l’activation d’une vue', async () => {
      const {component} = await createTable({viewsEnabled: true, viewsStorageKey: 'test-list'});
      component.onFilterValue('statut', 'VALIDEE');
      component.saveCurrentAsView('Validées');
      const view = component.viewsList()[0];
      component.clearAllFilters();
      expect(ids(component.displayedRows())).toHaveLength(3);

      component.activateView(view);

      expect(ids(component.displayedRows())).toEqual(['1', '3']);
      expect(component.activeViewId()).toBe(view.id);
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

  describe('labels', () => {
    it('utilise les textes par défaut de la librairie', async () => {
      const {component} = await createTable();

      expect(component.effectiveLabels().columnsButton).toBe(NG_TABLE_DEFAULT_LABELS.columnsButton);
      expect(component.resolvedEmptyLabel()).toBe(NG_TABLE_DEFAULT_LABELS.noData);
    });

    it('surcharge partiellement via [labels]', async () => {
      const {component} = await createTable({labels: {columnsButton: 'Columns'}});

      expect(component.effectiveLabels().columnsButton).toBe('Columns');
      expect(component.effectiveLabels().viewsButton).toBe(NG_TABLE_DEFAULT_LABELS.viewsButton);
    });

    it('interpole {field} dans filterBy', async () => {
      const {component} = await createTable({labels: {filterBy: 'Filter by {field}'}});

      expect(component.filterByAriaLabel(component.columns()[0])).toBe('Filter by Nom');
    });

    it('garde la même référence de labels quand l’objet est recréé à l’identique', async () => {
      const {component, setInput} = await createTable({labels: {columnsButton: 'Columns'}});
      const first = component.effectiveLabels();

      await setInput('labels', {columnsButton: 'Columns'}); // nouvel objet, mêmes valeurs

      expect(component.effectiveLabels()).toBe(first);
    });

    it('donne la priorité à [labels] sur les labels injectés', async () => {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          provideZonelessChangeDetection(),
          provideNgTableLabels(() => ({columnsButton: 'Global', viewsButton: 'Vues globales'})),
        ],
      });
      const {component} = await createTable({labels: {columnsButton: 'Local'}});

      expect(component.effectiveLabels().columnsButton).toBe('Local');
      expect(component.effectiveLabels().viewsButton).toBe('Vues globales');
      expect(component.effectiveLabels().ok).toBe(NG_TABLE_DEFAULT_LABELS.ok);
    });

    it('suit un Signal de labels injecté (changement de langue)', async () => {
      const lang = signal<'fr' | 'en'>('fr');
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          provideZonelessChangeDetection(),
          provideNgTableLabels(() =>
            computed(() => ({columnsButton: lang() === 'fr' ? 'Colonnes' : 'Columns'})),
          ),
        ],
      });
      const {component} = await createTable();
      expect(component.effectiveLabels().columnsButton).toBe('Colonnes');

      lang.set('en');

      expect(component.effectiveLabels().columnsButton).toBe('Columns');
    });
  });

  describe('copie de cellule', () => {
    it('copie la valeur et publie l’événement', async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'clipboard', {value: {writeText}, configurable: true});
      const {component} = await createTable();
      const copied: unknown[] = [];
      component.cellCopied.subscribe((e) => copied.push(e));

      component.onCopyCellValue(
        {stopPropagation: () => undefined} as MouseEvent,
        component.columns()[0],
        ROWS[0],
        0,
      );

      expect(writeText).toHaveBeenCalledWith('Charlie');
      expect(copied).toEqual([{columnId: 'nom', value: 'Charlie', row: ROWS[0]}]);
    });

    it('n’affiche pas l’action de copie sur une colonne sans `copy`', async () => {
      const {component} = await createTable();

      expect(component.hasCopyAction(component.columns()[0], ROWS[0])).toBe(true);
      expect(component.hasCopyAction(component.columns()[1], ROWS[0])).toBe(false);
    });
  });

  describe('redimensionnement des colonnes', () => {
    function resizableColumns(): NgTableColumn<Row>[] {
      const cols = columns();
      cols[0] = {...cols[0], resizable: true, widthPx: 200, minWidthPx: 100, maxWidthPx: 300};
      return cols;
    }

    function mouseEvent(extra: Partial<MouseEvent> = {}): MouseEvent {
      return {
        detail: 1,
        clientX: 0,
        target: null,
        preventDefault: () => undefined,
        stopPropagation: () => undefined,
        ...extra,
      } as unknown as MouseEvent;
    }

    it('borne la largeur entre minWidthPx et maxWidthPx', async () => {
      const {component} = await createTable({columns: resizableColumns()});
      const column = component.columns()[0];

      component.onResizeStart(mouseEvent(), column);

      component['onResizeMove']({clientX: 500} as MouseEvent);
      expect(component.columnWidthPx(column)).toBe(300);

      component['onResizeMove']({clientX: -500} as MouseEvent);
      expect(component.columnWidthPx(column)).toBe(100);

      component['stopResize']();
    });

    it('ignore le double-clic pendant le drag (il déclenche l’auto-fit)', async () => {
      const {component} = await createTable({columns: resizableColumns()});
      const column = component.columns()[0];

      component.onResizeStart(mouseEvent({detail: 2}), column);
      component['onResizeMove']({clientX: 500} as MouseEvent);

      expect(component.columnWidthPx(column)).toBe(200); // largeur d'origine inchangée
    });

    it('ne redimensionne pas une colonne non redimensionnable', async () => {
      const {component} = await createTable();
      const column = component.columns()[0]; // `resizable` non défini

      component.onResizeStart(mouseEvent(), column);
      component['onResizeMove']({clientX: 500} as MouseEvent);

      expect(component.columnWidthPx(column)).toBeNull();
    });

    it('ne descend jamais sous minWidthPx en auto-fit', async () => {
      const {component} = await createTable({columns: resizableColumns()});
      const column = component.columns()[0];

      component.onResizeAutoFit(mouseEvent(), column);

      expect(component.columnWidthPx(column)).toBe(100);
    });

    it('restaure les styles inline après la mesure d’auto-fit', async () => {
      const {component, fixture} = await createTable({columns: resizableColumns()});
      // `measureNaturalWidth` cible en priorité `.header-button` dans l'en-tête
      const measured = fixture.nativeElement.querySelector('.mat-column-nom .header-button') as HTMLElement | null;
      expect(measured).not.toBeNull();

      component.onResizeAutoFit(mouseEvent(), component.columns()[0]);

      // la mesure dé-contraint temporairement le nœud : rien ne doit rester appliqué
      expect(measured?.style.width ?? '').toBe('');
      expect(measured?.style.maxWidth ?? '').toBe('');
      expect(measured?.style.whiteSpace ?? '').toBe('');
    });
  });

  describe('robustesse', () => {
    it('trie les valeurs nulles en dernier', async () => {
      const rows: Row[] = [
        {...ROWS[0], id: 'a', nom: ''},
        {...ROWS[1], id: 'b', nom: 'zoe'},
      ];
      const cols = columns();
      cols[0] = {...cols[0], valueAccessor: (r) => (r.nom === '' ? null : r.nom)};
      const {component} = await createTable({columns: cols, rows});

      component.onHeaderSort(component.columns()[0]);

      expect(ids(component.displayedRows())).toEqual(['b', 'a']);
    });

    it('supporte une liste vide sans erreur', async () => {
      const {component} = await createTable({rows: []});

      expect(component.displayedRows()).toEqual([]);
      expect(component.activeFilterSummaries()).toEqual([]);
    });

    it('nettoie les filtres des colonnes retirées', async () => {
      const {component, setInput} = await createTable();
      component.onFilterValue('statut', 'VALIDEE');

      await setInput('columns', columns().filter((c) => c.id !== 'statut'));

      expect(component.currentFilterValue('statut')).toBe('');
      expect(ids(component.displayedRows())).toEqual(['1', '2', '3']);
    });
  });
});
