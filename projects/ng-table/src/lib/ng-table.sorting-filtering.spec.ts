import {describe, expect, it, vi} from 'vitest';
import type {NgTableColumn, NgTableRemoteQuery, NgTableSortChange} from './ng-table.models';
import {NG_TABLE_DEFAULT_LABELS} from './ng-table-labels';
import {columns, createTable, ids, type Row, setupNgTableSpec} from './ng-table.spec-helpers';

describe('NgTableComponent : tri et filtres', () => {
  setupNgTableSpec();

  describe('tri (mode local)', () => {
    it('bascule asc -> desc -> aucun tri', async () => {
      const {component} = await createTable();
      const col = component.columns()[0];

      component.sorting.onHeaderSort(col);
      expect(ids(component.displayedRows())).toEqual(['2', '3', '1']); // alice, Bob, Charlie

      component.sorting.onHeaderSort(col);
      expect(ids(component.displayedRows())).toEqual(['1', '3', '2']);

      component.sorting.onHeaderSort(col);
      expect(ids(component.displayedRows())).toEqual(['1', '2', '3']); // ordre source
    });

    it('trie les nombres numériquement, pas alphabétiquement', async () => {
      const {component} = await createTable();

      component.sorting.onHeaderSort(component.columns()[1]);

      expect((component.displayedRows() as Row[]).map((r) => r.montant)).toEqual([100, 200, 300]);
    });

    it('ignore le tri sur une colonne non triable', async () => {
      const {component} = await createTable();
      const emitted: NgTableSortChange[] = [];
      component.sortChange.subscribe((e) => emitted.push(e));

      component.sorting.onHeaderSort(component.columns()[3]); // `actif` : sortable non défini

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

      component.sorting.onHeaderSort(component.columns()[0]);

      expect(ids(component.displayedRows())).toEqual(['2', '3', '1']); // par date croissante
    });
  });

  describe('tri multi-colonnes', () => {
    function sortableColumns(): NgTableColumn<Row>[] {
      const cols = columns();
      cols[2] = {...cols[2], sortable: true};
      return cols;
    }
    const shift = {shiftKey: true};

    it('Maj+clic ajoute des niveaux de tri ; un clic simple revient à un tri unique', async () => {
      const {component} = await createTable({columns: sortableColumns(), multiSort: true});
      const [nom, montant, statut] = component.columns();
      const allSorts: unknown[] = [];
      component.sortsChange.subscribe((s) => allSorts.push(s));

      component.sorting.onHeaderSort(statut);
      component.sorting.onHeaderSort(montant, shift);
      expect(ids(component.displayedRows())).toEqual(['2', '3', '1']); // BROUILLON, puis VALIDEE par montant croissant

      component.sorting.onHeaderSort(montant, shift);
      expect(ids(component.displayedRows())).toEqual(['2', '1', '3']); // montant décroissant
      expect(component.sorting.sortPriority(statut)).toBe(1);
      expect(component.sorting.sortPriority(montant)).toBe(2);
      expect(component.sorting.currentSortAriaLabel(montant)).toBe('Montant, Trié décroissant, priorité 2'); // commence par le libellé visible (WCAG 2.5.3)
      expect(component.sorting.ariaSortValue(montant)).toBe('none'); // aria-sort : tri principal seulement

      component.sorting.onHeaderSort(montant, shift); // 3e Maj+clic : retire ce niveau
      expect(component.sorting.sortPriority(montant)).toBeNull();

      component.sorting.onHeaderSort(nom);
      expect(ids(component.displayedRows())).toEqual(['2', '3', '1']);
      expect(allSorts.at(-1)).toEqual([{columnId: 'nom', direction: 'asc'}]);
    });

    it('sans [multiSort], Maj+clic se comporte comme un clic simple', async () => {
      const {component} = await createTable({columns: sortableColumns()});
      const [, montant, statut] = component.columns();

      component.sorting.onHeaderSort(statut);
      component.sorting.onHeaderSort(montant, shift);

      expect(component.sorting.sortPriority(montant)).toBeNull();
      expect(ids(component.displayedRows())).toEqual(['2', '3', '1']);
    });

    it('envoie tous les niveaux en remote et les enregistre dans les vues', async () => {
      const queries: NgTableRemoteQuery[] = [];
      const {component} = await createTable({
        columns: sortableColumns(), multiSort: true, dataMode: 'remote', viewsEnabled: true, viewsStorageKey: 'ms',
      });
      component.remoteQueryChange.subscribe((q) => queries.push(q));
      const [, montant, statut] = component.columns();

      component.sorting.onHeaderSort(statut);
      component.sorting.onHeaderSort(montant, shift);
      expect(queries.at(-1)!.sort).toEqual({columnId: 'statut', direction: 'asc'});
      expect(queries.at(-1)!.sorts).toEqual([
        {columnId: 'statut', direction: 'asc'},
        {columnId: 'montant', direction: 'asc'},
      ]);

      component.saveCurrentAsView('Deux tris');
      const view = component.viewsList()[0];
      component.sorting.onHeaderSort(statut); // clic simple : tri unique décroissant
      component.activateView(view);
      expect(component.sorting.sortPriority(montant)).toBe(2);
    });
  });

  describe('filtrage (mode local)', () => {
    it('filtre en "contient", insensible à la casse', async () => {
      const {component} = await createTable();

      component.filtering.onFilterValue('statut', 'VALIDEE'); // filtre enum : commit immédiat

      expect(ids(component.displayedRows())).toEqual(['1', '3']);
      expect(component.filtering.isFilterActive('statut')).toBe(true);
    });

    it('affiche un filtre booléen actif avec son libellé (Oui / Non), pas « true »', async () => {
      const {component} = await createTable();

      component.filtering.onFilterValue('actif', 'false');

      expect(component.activeFilterSummaries()).toEqual([{columnId: 'actif', label: 'Actif', value: 'Non'}]);
    });

    it('interprète les valeurs booléennes', async () => {
      const {component} = await createTable();

      component.filtering.onFilterValue('actif', 'false');

      expect(ids(component.displayedRows())).toEqual(['2']);
    });

    it('filtre enum à plusieurs valeurs cochées : une ligne passe si elle égale l’une d’elles', async () => {
      const {component} = await createTable();

      component.filtering.onFilterValue('statut', 'BROUILLON,ANNULEE');

      expect(ids(component.displayedRows())).toEqual(['2']);
    });

    it('filtre number : accepte les opérateurs de comparaison et les plages', async () => {
      const cols = columns();
      cols[1] = {...cols[1], filter: {type: 'number'}};
      const {component} = await createTable({columns: cols});

      component.filtering.commitFilterValue('montant', '>150');
      expect(ids(component.displayedRows())).toEqual(['1', '3']);

      component.filtering.commitFilterValue('montant', '100..200');
      expect(ids(component.displayedRows())).toEqual(['2', '3']);
    });

    it('filtre texte : respecte filter.operator', async () => {
      const cols = columns();
      cols[0] = {...cols[0], filter: {type: 'text', operator: 'startsWith'}};
      const {component} = await createTable({columns: cols});

      component.filtering.commitFilterValue('nom', 'a');

      // `contains` aurait aussi gardé "Charlie" ; `startsWith` ne garde que "alice".
      expect(ids(component.displayedRows())).toEqual(['2']);
    });

    it('filtre sur un jour exact avec le type `date`', async () => {
      const cols = columns();
      cols.push({id: 'date', header: 'Date', valueAccessor: (r) => r.date, filter: {type: 'date'}});
      const {component} = await createTable({columns: cols});

      component.filtering.onFilterValue('date', '2026-02-20');

      expect(ids(component.displayedRows())).toEqual(['3']);
    });

    it('filtre sur une période, bornes incluses, avec le type `range`', async () => {
      const cols = columns();
      cols.push({id: 'date', header: 'Date', valueAccessor: (r) => r.date, filter: {type: 'range'}});
      const {component} = await createTable({columns: cols});

      component.filtering.onFilterValue('date', '2026-01-15..2026-02-20');

      expect(ids(component.displayedRows())).toEqual(['2', '3']);
    });

    it('accepte une borne ouverte dans une période', async () => {
      const cols = columns();
      cols.push({id: 'date', header: 'Date', valueAccessor: (r) => r.date, filter: {type: 'range'}});
      const {component} = await createTable({columns: cols});

      component.filtering.onFilterValue('date', '2026-02-01..');
      expect(ids(component.displayedRows())).toEqual(['1', '3']);

      component.filtering.onFilterValue('date', '..2026-02-01');
      expect(ids(component.displayedRows())).toEqual(['2']);
    });

    it('accepte une valeur de cellule `Date` (pas seulement une chaîne ISO)', async () => {
      const cols = columns();
      cols.push({id: 'date', header: 'Date', valueAccessor: (r) => new Date(r.date), filter: {type: 'date'}});
      const {component} = await createTable({columns: cols});

      component.filtering.onFilterValue('date', '2026-03-02');

      expect(ids(component.displayedRows())).toEqual(['1']);
    });

    it('affiche une période sous forme "début → fin" dans la barre de filtres actifs', async () => {
      const cols = columns();
      cols.push({id: 'date', header: 'Date', valueAccessor: (r) => r.date, filter: {type: 'range', label: 'Date'}});
      const {component} = await createTable({columns: cols});

      component.filtering.onFilterValue('date', '2026-01-15..2026-02-20');

      const summary = component.activeFilterSummaries().find((s) => s.columnId === 'date');
      expect(summary?.value).toBe('2026-01-15 → 2026-02-20');
    });

    it('applique filterPredicate quand il est fourni', async () => {
      const cols = columns();
      cols[1] = {...cols[1], filter: {type: 'text'}, filterPredicate: (row, value) => row.montant > Number(value)};
      const {component} = await createTable({columns: cols, filterDebounceMs: 0});

      component.filtering.commitFilterValue('montant', '150');

      expect(ids(component.displayedRows())).toEqual(['1', '3']);
    });

    it('construit le jeu de filtres à partir des colonnes, sans intervention du parent', async () => {
      const emitted: Record<string, string>[] = [];
      const {component} = await createTable();
      component.filtersChange.subscribe((f) => emitted.push(f));

      component.filtering.onFilterValue('statut', 'VALIDEE');

      // une entrée par colonne filtrable (nom, statut, actif), montant n'a pas de filtre
      expect(Object.keys(emitted[0]).sort()).toEqual(['actif', 'nom', 'statut']);
    });

    it('réinitialise tous les filtres', async () => {
      const {component} = await createTable();
      component.filtering.onFilterValue('statut', 'VALIDEE');

      component.clearAllFilters();

      expect(ids(component.displayedRows())).toEqual(['1', '2', '3']);
      expect(component.activeFilterSummaries()).toEqual([]);
    });

    it('résout les libellés d’options dans la barre de filtres actifs', async () => {
      const {component} = await createTable();

      component.filtering.onFilterValue('statut', 'VALIDEE');

      expect(component.activeFilterSummaries()).toEqual([
        {columnId: 'statut', label: 'Statut', value: 'Validée'},
      ]);
    });

    it('debounce les filtres texte et commit une seule fois', async () => {
      const {component} = await createTable();
      vi.useFakeTimers();

      component.filtering.onFilterValue('nom', 'a');
      component.filtering.onFilterValue('nom', 'al');
      component.filtering.onFilterValue('nom', 'ali');
      expect(component.filtering.currentFilterValue('nom')).toBe(''); // rien de committé pendant la frappe

      vi.advanceTimersByTime(400);

      expect(component.filtering.currentFilterValue('nom')).toBe('ali');
      expect(ids(component.displayedRows())).toEqual(['2']);
    });

    it('annule une frappe encore en attente quand le filtre est effacé', async () => {
      const {component} = await createTable();
      vi.useFakeTimers();

      component.filtering.onFilterValue('nom', 'ali');
      component.clearFilter('nom'); // action immédiate
      vi.advanceTimersByTime(400);

      expect(component.filtering.currentFilterValue('nom')).toBe('');
      expect(ids(component.displayedRows())).toEqual(['1', '2', '3']);
    });
  });

  describe('recherche globale', () => {
    it('garde les lignes contenant chaque mot, toutes colonnes confondues, sans tenir compte des accents', async () => {
      const {component} = await createTable({globalSearchEnabled: true});

      component.filtering.commitGlobalSearch('VALIDÉE bob');

      expect(ids(component.displayedRows())).toEqual(['3']);
    });

    it('respecte column.searchable (exclusion ou texte dédié)', async () => {
      const cols = columns();
      cols[0] = {...cols[0], searchable: false};
      cols[2] = {...cols[2], searchable: (r) => (r.statut === 'VALIDEE' ? 'Validée' : 'Brouillon')};
      const {component} = await createTable({columns: cols});

      component.filtering.commitGlobalSearch('alice');
      expect(ids(component.displayedRows())).toEqual([]);

      component.filtering.commitGlobalSearch('brouillon');
      expect(ids(component.displayedRows())).toEqual(['2']);
    });

    it('se combine aux filtres de colonnes, et « réinitialiser » efface les deux', async () => {
      const {component} = await createTable();
      const searches: string[] = [];
      component.globalSearchChange.subscribe((s) => searches.push(s));

      component.filtering.onFilterValue('statut', 'VALIDEE');
      component.filtering.commitGlobalSearch('charlie');
      expect(ids(component.displayedRows())).toEqual(['1']);

      component.clearAllFilters();
      expect(ids(component.displayedRows())).toEqual(['1', '2', '3']);
      expect(searches).toEqual(['charlie', '']);
    });

    it('apparaît dans la barre des filtres actifs et s’y efface', async () => {
      const {component} = await createTable();

      component.filtering.commitGlobalSearch('bob');
      const chip = component.activeFilterSummaries().find((s) => s.value === 'bob')!;
      expect(chip.label).toBe(NG_TABLE_DEFAULT_LABELS.globalSearchLabel);

      component.clearFilter(chip.columnId);
      expect(component.activeFilterSummaries()).toEqual([]);
    });

    it('est debouncée comme un filtre texte', async () => {
      const {component} = await createTable({filterDebounceMs: 300});
      vi.useFakeTimers();

      component.filtering.onGlobalSearchInput('bob');
      expect(ids(component.displayedRows())).toEqual(['1', '2', '3']);

      vi.advanceTimersByTime(300);
      expect(ids(component.displayedRows())).toEqual(['3']);
    });

    it('mode remote : la recherche part dans remoteQueryChange sans filtrer localement', async () => {
      const queries: NgTableRemoteQuery[] = [];
      const {component} = await createTable({dataMode: 'remote'});
      component.remoteQueryChange.subscribe((q) => queries.push(q));

      component.filtering.commitGlobalSearch('bob');

      expect(queries[0].search).toBe('bob');
      expect(ids(component.displayedRows())).toEqual(['1', '2', '3']);
    });

    it('est enregistrée dans une vue et restaurée à son activation', async () => {
      const {component} = await createTable({viewsEnabled: true, viewsStorageKey: 'search'});

      component.filtering.commitGlobalSearch('bob');
      component.saveCurrentAsView('Bob');
      const view = component.viewsList()[0];
      expect(view.state.search).toBe('bob');

      component.clearAllFilters();
      component.activateView(view);
      expect(ids(component.displayedRows())).toEqual(['3']);
    });
  });

  describe('mémoire de la recherche globale', () => {
    it('les textes de recherche sont rendus une fois la recherche effacée, et recalculés à la saisie suivante', async () => {
      const {component} = await createTable({globalSearchEnabled: true});
      component.filtering.commitGlobalSearch('ali');
      const before = component.data.searchHaystacks();
      expect(ids(component.displayedRows()).length).toBeGreaterThan(0);
      component.data.releaseSearchCache(); // recherche en cours : rien n'est rendu
      expect(component.data.searchHaystacks()).toBe(before);
      component.clearGlobalSearch();
      expect(component.data.searchCacheTimer).not.toBeNull();
      component.data.releaseSearchCache();
      expect(component.data.searchHaystacks()).not.toBe(before);
      component.filtering.commitGlobalSearch('ali');
      expect(ids(component.displayedRows()).length).toBeGreaterThan(0);
    });
  });

  describe('filtre avancé et vues', () => {
    it('une vue enregistre le filtre avancé et le restaure ; une vue sans filtre le retire', async () => {
      const {component, fixture} = await createTable({viewsEnabled: true, viewsStorageKey: 'filtre-avance'});
      const ids = () => (component.displayedRows() as Row[]).map((row) => row.id);
      component.saveCurrentAsView('Tout');
      component.advancedFilter.set({operator: 'or', children: [{columnId: 'montant', value: '>250'}, {columnId: 'nom', value: 'ali'}]});
      await fixture.whenStable();
      expect(ids()).toEqual(['1', '2']);
      component.saveCurrentAsView('Gros montants ou Alice');

      const [all, filtered] = component.viewsList();
      component.activateView(all);
      await fixture.whenStable();
      expect(component.advancedFilter()).toBeNull();
      expect(ids()).toEqual(['1', '2', '3']);

      component.activateView(filtered);
      await fixture.whenStable();
      expect(component.advancedFilter()?.children).toHaveLength(2);
      expect(ids()).toEqual(['1', '2']);
    });
  });
});
