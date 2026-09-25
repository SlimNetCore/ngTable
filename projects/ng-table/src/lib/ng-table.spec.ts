import {
  Component,
  computed,
  provideZonelessChangeDetection,
  signal,
  TemplateRef,
  TrackByFunction,
  viewChild,
} from '@angular/core';
import {ComponentFixture, TestBed} from '@angular/core/testing';
import {By} from '@angular/platform-browser';
import {MatCheckboxChange} from '@angular/material/checkbox';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {NgTableColumn, NgTableComponent, NgTableRemoteQuery, NgTableSortChange} from './ng-table.component';
import {NG_TABLE_DEFAULT_LABELS, provideNgTableLabels} from './ng-table-labels';
import {TruncateTooltipDirective} from './truncate-tooltip.directive';

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

interface Harness {
  fixture: ComponentFixture<NgTableComponent>;
  component: NgTableComponent;
  setInput: (name: string, value: unknown) => Promise<void>;
}

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

/** jsdom n'implémente pas `Blob.text()`. */
function readBlobText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
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
    vi.restoreAllMocks(); // un test qui échoue avant son `mockRestore()` ne doit pas contaminer les suivants
    TestBed.resetTestingModule();
  });

  describe('rendu de base', () => {
    it('affiche toutes les lignes et les colonnes déclarées', async () => {
      const {component} = await createTable();

      expect(ids(component.displayedRows())).toEqual(['1', '2', '3']);
      expect(component['displayedColumnIds']()).toEqual(['nom', 'montant', 'statut', 'actif']);
      expect(component['hasColumns']()).toBe(true);
    });

    it('masque les colonnes déclarées `visible: false`', async () => {
      const withHidden = columns();
      withHidden[1] = {...withHidden[1], visible: false};
      const {component} = await createTable({columns: withHidden});

      expect(component['displayedColumnIds']()).toEqual(['nom', 'statut', 'actif']);
    });

    it('tronque le texte de cellule par défaut, et le fait retourner à la ligne avec textOverflow: "wrap"', async () => {
      const withOverflow = columns();
      withOverflow[0] = {...withOverflow[0], textOverflow: 'wrap'};
      const {fixture} = await createTable({columns: withOverflow});
      const cells = fixture.nativeElement.querySelectorAll('td.mat-mdc-cell');

      expect(cells[0].querySelector('.cell-text--wrap')).toBeTruthy();
      expect(cells[0].querySelector('.cell-text--truncate')).toBeFalsy();
      expect(cells[1].querySelector('.cell-text--truncate')).toBeTruthy();
    });

    it('porte la tooltip de troncature sur le libellé d’en-tête, avec le texte de la colonne', async () => {
      const {fixture} = await createTable();
      const headerLabelEl = fixture.debugElement.query(By.css('th.mat-mdc-header-cell .header-label'));
      const directive = headerLabelEl.injector.get(TruncateTooltipDirective);

      expect(directive.text).toBe('Nom');
    });

    it('force le layout fixe de la table (sans lui, une cellule `nowrap` élargit sa colonne et rien ne peut être tronqué)', async () => {
      const {fixture} = await createTable();
      const table = fixture.nativeElement.querySelector('table.ng-table');

      // `[fixedLayout]="true"` : Material pose `table-layout: auto` sur
      // `.mat-mdc-table`, de même spécificité que `.ng-table` — cette classe
      // (déclarée après dans sa feuille) garantit le layout fixe.
      expect(table.classList.contains('mat-table-fixed-layout')).toBe(true);
    });

    it('tronque par défaut le rendu d’un cellTemplate, comme pour valueAccessor, sauf textOverflow: "wrap" explicite', async () => {
      @Component({
        standalone: true,
        template: `<ng-template #tpl let-value>{{ value }}</ng-template>`,
      })
      class HostComponent {
        readonly tpl = viewChild.required<NonNullable<NgTableColumn<Row>['cellTemplate']>>('tpl');
      }

      const hostFixture = TestBed.createComponent(HostComponent);
      await hostFixture.whenStable();
      const template = hostFixture.componentInstance.tpl();

      const withDefault = columns();
      withDefault[0] = {...withDefault[0], cellTemplate: template};
      const withWrap = columns();
      withWrap[1] = {...withWrap[1], cellTemplate: template, textOverflow: 'wrap'};

      const {fixture: defaultFixture} = await createTable({columns: withDefault});
      const defaultCells = defaultFixture.nativeElement.querySelectorAll('td.mat-mdc-cell');
      expect(defaultCells[0].querySelector('.cell-text--truncate')).toBeTruthy();

      const {fixture: wrapFixture} = await createTable({columns: withWrap});
      const wrapCells = wrapFixture.nativeElement.querySelectorAll('td.mat-mdc-cell');
      expect(wrapCells[1].querySelector('.cell-text--wrap')).toBeTruthy();
      expect(wrapCells[1].querySelector('.cell-text--truncate')).toBeFalsy();
    });

    it('ajoute la colonne technique de sélection quand elle est activée', async () => {
      const {component} = await createTable({rowSelectionEnabled: true});

      expect(component['displayedColumnIds']()[0]).toBe('__row_selection__');
    });

    it('garde la même référence de displayedColumnIds quand les ids sont identiques', async () => {
      const {component, setInput} = await createTable();
      const first = component['displayedColumnIds']();

      // nouveau tableau de colonnes (donc recalcul), mais mêmes ids dans le même ordre :
      // `equal` doit conserver la référence pour ne pas faire retravailler mat-table.
      await setInput('columns', columns());

      expect(component['displayedColumnIds']()).toBe(first);
    });
  });

  describe('tri (mode local)', () => {
    it('bascule asc -> desc -> aucun tri', async () => {
      const {component} = await createTable();
      const col = component.columns()[0];

      component['onHeaderSort'](col);
      expect(ids(component.displayedRows())).toEqual(['2', '3', '1']); // alice, Bob, Charlie

      component['onHeaderSort'](col);
      expect(ids(component.displayedRows())).toEqual(['1', '3', '2']);

      component['onHeaderSort'](col);
      expect(ids(component.displayedRows())).toEqual(['1', '2', '3']); // ordre source
    });

    it('trie les nombres numériquement, pas alphabétiquement', async () => {
      const {component} = await createTable();

      component['onHeaderSort'](component.columns()[1]);

      expect((component.displayedRows() as Row[]).map((r) => r.montant)).toEqual([100, 200, 300]);
    });

    it('ignore le tri sur une colonne non triable', async () => {
      const {component} = await createTable();
      const emitted: NgTableSortChange[] = [];
      component.sortChange.subscribe((e) => emitted.push(e));

      component['onHeaderSort'](component.columns()[3]); // `actif` : sortable non défini

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

      component['onHeaderSort'](component.columns()[0]);

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

      component['onHeaderSort'](statut);
      component['onHeaderSort'](montant, shift);
      expect(ids(component.displayedRows())).toEqual(['2', '3', '1']); // BROUILLON, puis VALIDEE par montant croissant

      component['onHeaderSort'](montant, shift);
      expect(ids(component.displayedRows())).toEqual(['2', '1', '3']); // montant décroissant
      expect(component['sortPriority'](statut)).toBe(1);
      expect(component['sortPriority'](montant)).toBe(2);
      expect(component['currentSortAriaLabel'](montant)).toBe('Trié décroissant, priorité 2');
      expect(component['ariaSortValue'](montant)).toBe('none'); // aria-sort : tri principal seulement

      component['onHeaderSort'](montant, shift); // 3e Maj+clic : retire ce niveau
      expect(component['sortPriority'](montant)).toBeNull();

      component['onHeaderSort'](nom);
      expect(ids(component.displayedRows())).toEqual(['2', '3', '1']);
      expect(allSorts.at(-1)).toEqual([{columnId: 'nom', direction: 'asc'}]);
    });

    it('sans [multiSort], Maj+clic se comporte comme un clic simple', async () => {
      const {component} = await createTable({columns: sortableColumns()});
      const [, montant, statut] = component.columns();

      component['onHeaderSort'](statut);
      component['onHeaderSort'](montant, shift);

      expect(component['sortPriority'](montant)).toBeNull();
      expect(ids(component.displayedRows())).toEqual(['2', '3', '1']);
    });

    it('envoie tous les niveaux en remote et les enregistre dans les vues', async () => {
      const queries: NgTableRemoteQuery[] = [];
      const {component} = await createTable({
        columns: sortableColumns(), multiSort: true, dataMode: 'remote', viewsEnabled: true, viewsStorageKey: 'ms',
      });
      component.remoteQueryChange.subscribe((q) => queries.push(q));
      const [, montant, statut] = component.columns();

      component['onHeaderSort'](statut);
      component['onHeaderSort'](montant, shift);
      expect(queries.at(-1)!.sort).toEqual({columnId: 'statut', direction: 'asc'});
      expect(queries.at(-1)!.sorts).toEqual([
        {columnId: 'statut', direction: 'asc'},
        {columnId: 'montant', direction: 'asc'},
      ]);

      component.saveCurrentAsView('Deux tris');
      const view = component.viewsList()[0];
      component['onHeaderSort'](statut); // clic simple : tri unique décroissant
      component.activateView(view);
      expect(component['sortPriority'](montant)).toBe(2);
    });
  });

  describe('filtrage (mode local)', () => {
    it('filtre en "contient", insensible à la casse', async () => {
      const {component} = await createTable();

      component['onFilterValue']('statut', 'VALIDEE'); // filtre enum : commit immédiat

      expect(ids(component.displayedRows())).toEqual(['1', '3']);
      expect(component['isFilterActive']('statut')).toBe(true);
    });

    it('affiche un filtre booléen actif avec son libellé (Oui / Non), pas « true »', async () => {
      const {component} = await createTable();

      component['onFilterValue']('actif', 'false');

      expect(component.activeFilterSummaries()).toEqual([{columnId: 'actif', label: 'Actif', value: 'Non'}]);
    });

    it('interprète les valeurs booléennes', async () => {
      const {component} = await createTable();

      component['onFilterValue']('actif', 'false');

      expect(ids(component.displayedRows())).toEqual(['2']);
    });

    it('filtre enum à plusieurs valeurs cochées : une ligne passe si elle égale l’une d’elles', async () => {
      const {component} = await createTable();

      component['onFilterValue']('statut', 'BROUILLON,ANNULEE');

      expect(ids(component.displayedRows())).toEqual(['2']);
    });

    it('filtre number : accepte les opérateurs de comparaison et les plages', async () => {
      const cols = columns();
      cols[1] = {...cols[1], filter: {type: 'number'}};
      const {component} = await createTable({columns: cols});

      component['commitFilterValue']('montant', '>150');
      expect(ids(component.displayedRows())).toEqual(['1', '3']);

      component['commitFilterValue']('montant', '100..200');
      expect(ids(component.displayedRows())).toEqual(['2', '3']);
    });

    it('filtre texte : respecte filter.operator', async () => {
      const cols = columns();
      cols[0] = {...cols[0], filter: {type: 'text', operator: 'startsWith'}};
      const {component} = await createTable({columns: cols});

      component['commitFilterValue']('nom', 'a');

      // `contains` aurait aussi gardé "Charlie" ; `startsWith` ne garde que "alice".
      expect(ids(component.displayedRows())).toEqual(['2']);
    });

    it('filtre sur un jour exact avec le type `date`', async () => {
      const cols = columns();
      cols.push({id: 'date', header: 'Date', valueAccessor: (r) => r.date, filter: {type: 'date'}});
      const {component} = await createTable({columns: cols});

      component['onFilterValue']('date', '2026-02-20');

      expect(ids(component.displayedRows())).toEqual(['3']);
    });

    it('filtre sur une période, bornes incluses, avec le type `range`', async () => {
      const cols = columns();
      cols.push({id: 'date', header: 'Date', valueAccessor: (r) => r.date, filter: {type: 'range'}});
      const {component} = await createTable({columns: cols});

      component['onFilterValue']('date', '2026-01-15..2026-02-20');

      expect(ids(component.displayedRows())).toEqual(['2', '3']);
    });

    it('accepte une borne ouverte dans une période', async () => {
      const cols = columns();
      cols.push({id: 'date', header: 'Date', valueAccessor: (r) => r.date, filter: {type: 'range'}});
      const {component} = await createTable({columns: cols});

      component['onFilterValue']('date', '2026-02-01..');
      expect(ids(component.displayedRows())).toEqual(['1', '3']);

      component['onFilterValue']('date', '..2026-02-01');
      expect(ids(component.displayedRows())).toEqual(['2']);
    });

    it('accepte une valeur de cellule `Date` (pas seulement une chaîne ISO)', async () => {
      const cols = columns();
      cols.push({id: 'date', header: 'Date', valueAccessor: (r) => new Date(r.date), filter: {type: 'date'}});
      const {component} = await createTable({columns: cols});

      component['onFilterValue']('date', '2026-03-02');

      expect(ids(component.displayedRows())).toEqual(['1']);
    });

    it('affiche une période sous forme "début → fin" dans la barre de filtres actifs', async () => {
      const cols = columns();
      cols.push({id: 'date', header: 'Date', valueAccessor: (r) => r.date, filter: {type: 'range', label: 'Date'}});
      const {component} = await createTable({columns: cols});

      component['onFilterValue']('date', '2026-01-15..2026-02-20');

      const summary = component.activeFilterSummaries().find((s) => s.columnId === 'date');
      expect(summary?.value).toBe('2026-01-15 → 2026-02-20');
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

      component['onFilterValue']('statut', 'VALIDEE');

      // une entrée par colonne filtrable (nom, statut, actif), montant n'a pas de filtre
      expect(Object.keys(emitted[0]).sort()).toEqual(['actif', 'nom', 'statut']);
    });

    it('réinitialise tous les filtres', async () => {
      const {component} = await createTable();
      component['onFilterValue']('statut', 'VALIDEE');

      component.clearAllFilters();

      expect(ids(component.displayedRows())).toEqual(['1', '2', '3']);
      expect(component.activeFilterSummaries()).toEqual([]);
    });

    it('résout les libellés d’options dans la barre de filtres actifs', async () => {
      const {component} = await createTable();

      component['onFilterValue']('statut', 'VALIDEE');

      expect(component.activeFilterSummaries()).toEqual([
        {columnId: 'statut', label: 'Statut', value: 'Validée'},
      ]);
    });

    it('debounce les filtres texte et commit une seule fois', async () => {
      const {component} = await createTable();
      vi.useFakeTimers();

      component['onFilterValue']('nom', 'a');
      component['onFilterValue']('nom', 'al');
      component['onFilterValue']('nom', 'ali');
      expect(component['currentFilterValue']('nom')).toBe(''); // rien de committé pendant la frappe

      vi.advanceTimersByTime(400);

      expect(component['currentFilterValue']('nom')).toBe('ali');
      expect(ids(component.displayedRows())).toEqual(['2']);
    });

    it('annule une frappe encore en attente quand le filtre est effacé', async () => {
      const {component} = await createTable();
      vi.useFakeTimers();

      component['onFilterValue']('nom', 'ali');
      component.clearFilter('nom'); // action immédiate
      vi.advanceTimersByTime(400);

      expect(component['currentFilterValue']('nom')).toBe('');
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

      component['onFilterValue']('statut', 'VALIDEE');
      await fixture.whenStable();

      expect(counts.at(-1)).toBe(2);
    });

    it('demande le retour à la première page quand un filtre change', async () => {
      const pages: number[] = [];
      const {component} = await createTable({pageTrackingEnabled: true, pageSize: 2, pageIndex: 1});
      component.pageIndex.subscribe((p) => pages.push(p));

      component['onFilterValue']('statut', 'VALIDEE');

      expect(pages).toEqual([0]);
    });
  });

  describe('recherche globale', () => {
    it('garde les lignes contenant chaque mot, toutes colonnes confondues, sans tenir compte des accents', async () => {
      const {component} = await createTable({globalSearchEnabled: true});

      component['commitGlobalSearch']('VALIDÉE bob');

      expect(ids(component.displayedRows())).toEqual(['3']);
    });

    it('respecte column.searchable (exclusion ou texte dédié)', async () => {
      const cols = columns();
      cols[0] = {...cols[0], searchable: false};
      cols[2] = {...cols[2], searchable: (r) => (r.statut === 'VALIDEE' ? 'Validée' : 'Brouillon')};
      const {component} = await createTable({columns: cols});

      component['commitGlobalSearch']('alice');
      expect(ids(component.displayedRows())).toEqual([]);

      component['commitGlobalSearch']('brouillon');
      expect(ids(component.displayedRows())).toEqual(['2']);
    });

    it('se combine aux filtres de colonnes, et « réinitialiser » efface les deux', async () => {
      const {component} = await createTable();
      const searches: string[] = [];
      component.globalSearchChange.subscribe((s) => searches.push(s));

      component['onFilterValue']('statut', 'VALIDEE');
      component['commitGlobalSearch']('charlie');
      expect(ids(component.displayedRows())).toEqual(['1']);

      component.clearAllFilters();
      expect(ids(component.displayedRows())).toEqual(['1', '2', '3']);
      expect(searches).toEqual(['charlie', '']);
    });

    it('apparaît dans la barre des filtres actifs et s’y efface', async () => {
      const {component} = await createTable();

      component['commitGlobalSearch']('bob');
      const chip = component.activeFilterSummaries().find((s) => s.value === 'bob')!;
      expect(chip.label).toBe(NG_TABLE_DEFAULT_LABELS.globalSearchLabel);

      component.clearFilter(chip.columnId);
      expect(component.activeFilterSummaries()).toEqual([]);
    });

    it('est debouncée comme un filtre texte', async () => {
      const {component} = await createTable({filterDebounceMs: 300});
      vi.useFakeTimers();

      component['onGlobalSearchInput']('bob');
      expect(ids(component.displayedRows())).toEqual(['1', '2', '3']);

      vi.advanceTimersByTime(300);
      expect(ids(component.displayedRows())).toEqual(['3']);
    });

    it('mode remote : la recherche part dans remoteQueryChange sans filtrer localement', async () => {
      const queries: NgTableRemoteQuery[] = [];
      const {component} = await createTable({dataMode: 'remote'});
      component.remoteQueryChange.subscribe((q) => queries.push(q));

      component['commitGlobalSearch']('bob');

      expect(queries[0].search).toBe('bob');
      expect(ids(component.displayedRows())).toEqual(['1', '2', '3']);
    });

    it('est enregistrée dans une vue et restaurée à son activation', async () => {
      const {component} = await createTable({viewsEnabled: true, viewsStorageKey: 'search'});

      component['commitGlobalSearch']('bob');
      component.saveCurrentAsView('Bob');
      const view = component.viewsList()[0];
      expect(view.state.search).toBe('bob');

      component.clearAllFilters();
      component.activateView(view);
      expect(ids(component.displayedRows())).toEqual(['3']);
    });
  });

  describe('regroupement et totaux', () => {
    function groupColumns(): NgTableColumn<Row>[] {
      const cols = columns();
      cols[1] = {...cols[1], aggregate: 'sum'};
      return cols;
    }
    const groupRows = (fixture: ComponentFixture<NgTableComponent>) =>
      [...(fixture.nativeElement as HTMLElement).querySelectorAll('tr.group-row')] as HTMLTableRowElement[];
    const text = (el: Element) => (el.textContent ?? '').replace(/\s+/g, ' ').trim();
    /** Libellé d'un en-tête de groupe, sans le texte de l'icône (masquée aux lecteurs d'écran). */
    const groupLabel = (row: HTMLTableRowElement) =>
      text(row.cells[0]).replace(/^(expand_more|chevron_right)/, '').trim();

    it('insère un en-tête par groupe, avec libellé d’option, nombre de lignes et agrégats', async () => {
      const {component, fixture} = await createTable({columns: groupColumns(), groupBy: 'statut'});
      await fixture.whenStable();

      const headers = groupRows(fixture);
      expect(headers).toHaveLength(2);
      // Le libellé vient des options du filtre (« Brouillon »), pas du code brut.
      expect(text(headers[0].cells[0])).toContain('Statut : Brouillon 1 ligne(s)');
      expect(text(headers[1].cells[1])).toBe('Σ 500');
      expect(ids(component.displayedRows())).toEqual(['2', '1', '3']);
    });

    it('replie un groupe au clic : ses lignes disparaissent, son en-tête reste', async () => {
      const {component, fixture} = await createTable({columns: groupColumns(), groupBy: 'statut'});
      await fixture.whenStable();

      groupRows(fixture)[1].click(); // VALIDEE
      await fixture.whenStable();

      expect(ids(component.displayedRows())).toEqual(['2']);
      expect(groupRows(fixture)[1].getAttribute('aria-expanded')).toBe('false');

      component.expandAllGroups();
      expect(ids(component.displayedRows())).toEqual(['2', '1', '3']);
    });

    it('pagine sur les lignes regroupées, un groupe replié comptant pour une ligne', async () => {
      const {component} = await createTable({columns: groupColumns(), groupBy: 'statut', paginator: true, pageSize: 2});
      expect(ids(component.displayedRows())).toEqual(['2', '1']);
      expect(component['paginatorLength']()).toBe(3);

      component.collapseAllGroups();
      expect(component['paginatorLength']()).toBe(2);
      expect(component.displayedRows()).toEqual([]);
    });

    it('ligne de totaux sur toutes les lignes filtrées', async () => {
      const {component, fixture} = await createTable({columns: groupColumns(), showTotals: true});
      await fixture.whenStable();
      const footer = () => fixture.nativeElement.querySelector('tr.totals-row') as HTMLTableRowElement;

      expect(text(footer().cells[0])).toBe('Total');
      expect(text(footer().cells[1])).toBe('Σ 600');

      component['onFilterValue']('statut', 'VALIDEE');
      await fixture.whenStable();
      expect(text(footer().cells[1])).toBe('Σ 500');
    });

    it('menu « Grouper », changement de colonne et vues', async () => {
      const {component, fixture} = await createTable({columns: groupColumns(), groupingEnabled: true, viewsEnabled: true, viewsStorageKey: 'grp'});
      const button = [...fixture.nativeElement.querySelectorAll('.list-actions button')].find((b: Element) => b.textContent?.includes('Grouper')) as HTMLButtonElement;
      button.click();
      await fixture.whenStable();
      const items = [...document.querySelectorAll('.mat-mdc-menu-panel [role="menuitemradio"]')].map((el) => text(el));
      expect(items).toEqual(['radio_button_checked Aucun regroupement', 'radio_button_unchecked Nom', 'radio_button_unchecked Montant',
        'radio_button_unchecked Statut', 'radio_button_unchecked Actif']);

      component.groupBy.set('actif');
      component.saveCurrentAsView('Par activité');
      component.groupBy.set(null);
      component.activateView(component.viewsList()[0]);
      expect(component.groupBy()).toBe('actif');
    });

    describe('mode remote', () => {
      // Page renvoyée par le serveur, déjà triée par statut : VALIDEE, VALIDEE, BROUILLON.
      const serverPage: Row[] = [ROWS[0], ROWS[2], ROWS[1]];

      it('demande le regroupement au serveur et dessine un en-tête à chaque changement de valeur', async () => {
        const queries: NgTableRemoteQuery[] = [];
        const {component, fixture, setInput} = await createTable({columns: groupColumns(), dataMode: 'remote', rows: []});
        component.remoteQueryChange.subscribe((q) => queries.push(q));

        component.groupBy.set('statut');
        await fixture.whenStable();
        expect(queries.at(-1)?.groupBy).toBe('statut');

        await setInput('rows', serverPage);
        const headers = groupRows(fixture);
        expect(headers.map((row) => text(row.cells[0]))).toEqual(['Statut : Validée', 'Statut : Brouillon']);
        // L'ordre du serveur est conservé, sans second découpage ni tri local.
        expect(ids(component.displayedRows())).toEqual(['1', '3', '2']);
      });

      it('affiche le compte et les agrégats fournis par le serveur, pas ceux de la page', async () => {
        const {fixture} = await createTable({
          columns: groupColumns(), dataMode: 'remote', rows: serverPage, groupBy: 'statut',
          groupSummaries: [{key: 'VALIDEE', count: 480, aggregates: {montant: 125000}}, {key: 'BROUILLON', count: 12}],
        });
        await fixture.whenStable();

        const [validee, brouillon] = groupRows(fixture);
        expect(groupLabel(validee)).toBe('Statut : Validée 480 ligne(s)');
        expect(text(validee.cells[1])).toMatch(/^Σ 125\s000$/);
        expect(groupLabel(brouillon)).toBe('Statut : Brouillon 12 ligne(s)');
      });

      it('replier un groupe demande au serveur d’exclure ses lignes, et garde son en-tête à sa place', async () => {
        const summaries = [{key: 'VALIDEE', count: 2}, {key: 'BROUILLON', count: 1}];
        const queries: NgTableRemoteQuery[] = [];
        const {component, fixture, setInput} = await createTable({
          columns: groupColumns(), dataMode: 'remote', rows: serverPage, groupBy: 'statut', groupSummaries: summaries,
          paginator: true, pageSize: 10, totalCount: 3,
        });
        component.remoteQueryChange.subscribe((q) => queries.push(q));
        await fixture.whenStable();

        groupRows(fixture)[0].click(); // replie VALIDEE
        expect(queries.at(-1)?.collapsedGroups).toEqual(['VALIDEE']);
        expect(queries.at(-1)?.page.index).toBe(0); // même page

        // Réponse du serveur : les lignes de VALIDEE ne sont plus renvoyées.
        await setInput('rows', [ROWS[1]]);
        const headers = groupRows(fixture);
        expect(headers.map(groupLabel)).toEqual(['Statut : Validée 2 ligne(s)', 'Statut : Brouillon 1 ligne(s)']);
        expect(headers.map((row) => row.getAttribute('aria-expanded'))).toEqual(['false', 'true']);
        expect(component.getQueryState()).toMatchObject({groupBy: 'statut', collapsedGroups: ['VALIDEE']});
      });

      it('sans résumés serveur : groupes non repliables (pas de chevron, pas d’arrêt de tabulation)', async () => {
        const {component, fixture} = await createTable({columns: groupColumns(), dataMode: 'remote', rows: serverPage, groupBy: 'statut'});
        await fixture.whenStable();

        const header = groupRows(fixture)[0];
        expect(header.querySelector('.group-chevron')).toBeNull();
        expect(header.getAttribute('tabindex')).toBeNull();
        expect(header.getAttribute('aria-expanded')).toBeNull();
        header.click();
        expect(component.displayedRows()).toHaveLength(3);
      });
    });
  });

  describe('défilement virtuel', () => {
    const manyRows: Row[] = Array.from({length: 1000}, (_, i) => ({
      id: `${i + 1}`, nom: `Client ${i + 1}`, montant: i, statut: i % 2 ? 'VALIDEE' : 'BROUILLON', actif: i % 3 === 0, date: '2026-01-01',
    }));
    const dataRows = (fixture: ComponentFixture<NgTableComponent>) =>
      [...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLTableRowElement>('tr.data-row')];
    const spacers = (fixture: ComponentFixture<NgTableComponent>) =>
      [...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLTableCellElement>('td.spacer-cell')].map((td) => td.style.height);

    async function scrollTo(fixture: ComponentFixture<NgTableComponent>, top: number) {
      const wrap = fixture.nativeElement.querySelector('.table-wrap') as HTMLElement;
      Object.defineProperty(wrap, 'scrollTop', {value: top, configurable: true});
      wrap.dispatchEvent(new Event('scroll'));
      await fixture.whenStable();
    }

    it('ne rend que les lignes visibles, entre deux espacements de la hauteur des autres', async () => {
      const {component, fixture} = await createTable({rows: manyRows, virtualScroll: true});

      // jsdom ne mesure rien : zone de 800 px par défaut, lignes de 48 px → 17 lignes + 8 de marge.
      expect(dataRows(fixture)).toHaveLength(25);
      expect(spacers(fixture)).toEqual(['0px', `${(1000 - 25) * 48}px`]);
      // Les lignes « affichées » restent toutes les lignes : sélection, export, compteurs inchangés.
      expect(component.displayedRows()).toHaveLength(1000);
      expect((fixture.nativeElement.querySelector('.table-wrap') as HTMLElement).style.maxHeight).toBe('70vh');
    });

    it('suit le défilement', async () => {
      const {fixture} = await createTable({rows: manyRows, virtualScroll: true});

      await scrollTo(fixture, 100 * 48);

      const first = dataRows(fixture)[0];
      expect(first.textContent).toContain('Client 93'); // ligne 100 visible, 8 lignes de marge au-dessus
      expect(spacers(fixture)[0]).toBe(`${92 * 48}px`);
    });

    it('navigation clavier : Entrée active la bonne ligne après défilement', async () => {
      const {component, fixture} = await createTable({rows: manyRows, virtualScroll: true, cellNavigation: true});
      const clicked: Row[] = [];
      component.rowClick.subscribe((row) => clicked.push(row));
      await scrollTo(fixture, 100 * 48);

      const cell = dataRows(fixture)[0].cells[1]; // colonne « montant », sans bouton
      cell.focus();
      cell.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true}));

      expect(clicked[0]?.nom).toBe('Client 93');
    });

    it('sans l’option, toutes les lignes sont rendues', async () => {
      const {fixture} = await createTable({rows: manyRows.slice(0, 60)});
      expect(dataRows(fixture)).toHaveLength(60);
      expect(spacers(fixture)).toEqual([]);
    });
  });

  describe('paginateur intégré', () => {
    const page = (pageIndex: number, pageSize: number) => ({pageIndex, pageSize, length: 3, previousPageIndex: 0});

    it('pagine seul, sans rien à relier, et revient en page 0 après un filtre', async () => {
      const {component, fixture} = await createTable({paginator: true, pageSize: 1});
      expect(fixture.nativeElement.querySelector('mat-paginator')).toBeTruthy();
      expect(ids(component.displayedRows())).toEqual(['1']);
      expect(component['paginatorLength']()).toBe(3);

      component['onPage'](page(2, 1));
      expect(ids(component.displayedRows())).toEqual(['3']);

      component['onFilterValue']('statut', 'VALIDEE');
      expect(component.pageIndex()).toBe(0);
      expect(component['paginatorLength']()).toBe(2);
    });

    it('recule sur la dernière page si les données rétrécissent', async () => {
      const {component, setInput} = await createTable({paginator: true, pageSize: 1});
      component['onPage'](page(2, 1));

      await setInput('rows', ROWS.slice(0, 1));

      expect(component.pageIndex()).toBe(0);
      expect(ids(component.displayedRows())).toEqual(['1']);
    });

    it('restaure la pagination d’une vue sans intervention du parent', async () => {
      const {component} = await createTable({paginator: true, pageSize: 1, viewsEnabled: true, viewsStorageKey: 'pg'});
      component['onPage'](page(1, 1));
      component.saveCurrentAsView('Page 2');
      component['onPage'](page(0, 1));

      component.activateView(component.viewsList()[0]);

      expect(component.pageIndex()).toBe(1);
      expect(ids(component.displayedRows())).toEqual(['2']);
    });

    it('mode remote : relance la requête au changement de page et affiche totalCount', async () => {
      const queries: NgTableRemoteQuery[] = [];
      const {component} = await createTable({dataMode: 'remote', paginator: true, pageSize: 25, totalCount: 480});
      component.remoteQueryChange.subscribe((q) => queries.push(q));
      expect(component['paginatorLength']()).toBe(480);

      component['onPage'](page(3, 25));
      expect(queries.at(-1)!.page).toEqual({index: 3, size: 25});

      component['onFilterValue']('statut', 'VALIDEE');
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
      component['onFilterValue']('statut', 'VALIDEE');

      component.applyQueryState({filters: {actif: 'false'}});
      await fixture.whenStable();

      expect(ids(component.displayedRows())).toEqual(['2']);
      expect(states.at(-1)).toMatchObject({filters: {actif: 'false'}});
    });
  });

  describe('mode remote', () => {
    it('n’applique aucun filtrage ni tri local', async () => {
      const {component} = await createTable({dataMode: 'remote'});

      component['onFilterValue']('statut', 'VALIDEE');
      component['onHeaderSort'](component.columns()[1]);

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

      component['onFilterValue']('statut', 'VALIDEE');

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

      component['onHeaderSort'](component.columns()[0]);

      expect(queries[0].sort).toEqual({columnId: 'nom', direction: 'asc'});
      expect(queries[0].page).toEqual({index: 0, size: 0});
    });

    it('n’émet ni filteredCountChange ni pageIndexChange', async () => {
      const events: string[] = [];
      const {component, fixture} = await createTable({dataMode: 'remote', pageTrackingEnabled: true, pageIndex: 2});
      component.filteredCountChange.subscribe(() => events.push('count'));
      component.pageIndex.subscribe(() => events.push('page'));

      component['onFilterValue']('statut', 'VALIDEE');
      await fixture.whenStable();

      expect(events).toEqual([]);
    });
  });

  describe('visibilité et ordre des colonnes', () => {
    it('colonne de référence : la choisir la fixe à gauche en premier, à la place des pinned déclarés', async () => {
      const cols = columns();
      cols[0] = {...cols[0], pinned: 'left'}; // "nom" fixée par défaut
      const {component} = await createTable({columns: cols, referenceColumnSelectable: true});
      const emitted: unknown[] = [];
      component.referenceColumn.subscribe((id) => emitted.push(id));
      const [nom, montant] = component.columns();
      expect(component['isReferenceColumn'](nom)).toBe(true);

      component['toggleReferenceColumn'](montant);

      expect(component.visibleColumns().map((c) => c.id)[0]).toBe('montant');
      expect(component['pinnedSide'](montant)).toBe('left');
      expect(component['pinnedSide'](nom)).toBeUndefined();
      expect(emitted).toEqual(['montant']);

      component['toggleReferenceColumn'](montant); // la libérer : plus aucune colonne fixée à gauche
      expect(component.referenceColumn()).toBeNull();
      expect(component['pinnedSide'](nom)).toBeUndefined();
      expect(component['hasLeftPinnedColumns']()).toBe(false);
    });

    it('colonne de référence : punaise dans le menu « Colonnes », désactivée pour une colonne masquée', async () => {
      const cols = columns();
      cols[3] = {...cols[3], visible: false};
      const {fixture} = await createTable({columns: cols, referenceColumnSelectable: true});

      (fixture.nativeElement.querySelector('.list-actions button') as HTMLButtonElement).click();
      await fixture.whenStable();

      const pins = [...document.querySelectorAll<HTMLButtonElement>('.ngt-columns-menu-panel .reference-pin')];
      expect(pins).toHaveLength(4);
      expect(pins.map((pin) => pin.disabled)).toEqual([false, false, false, true]);
      expect(pins[0].getAttribute('aria-label')).toBe('Fixer « Nom » à gauche (colonne de référence)');

      pins[1].click();
      await fixture.whenStable();
      expect(fixture.componentInstance.referenceColumn()).toBe('montant');
      expect(pins[1].getAttribute('aria-pressed')).toBe('true');
    });

    it('colonne de référence : sans l’option, pas de punaise dans le menu', async () => {
      const {fixture} = await createTable();
      (fixture.nativeElement.querySelector('.list-actions button') as HTMLButtonElement).click();
      await fixture.whenStable();
      expect(document.querySelectorAll('.ngt-columns-menu-panel .reference-pin')).toHaveLength(0);
    });

    it('colonne de référence : enregistrée dans les vues et restaurée', async () => {
      const {component} = await createTable({referenceColumnSelectable: true, viewsEnabled: true, viewsStorageKey: 'ref'});
      component.referenceColumn.set('statut');
      component.saveCurrentAsView('Statut fixé');
      component.referenceColumn.set(null);

      component.activateView(component.viewsList()[0]);

      expect(component.viewsList()[0].state.referenceColumnId).toBe('statut');
      expect(component.referenceColumn()).toBe('statut');
    });

    it('masque une colonne via le menu et notifie le parent', async () => {
      const emitted: Record<string, boolean>[] = [];
      const {component} = await createTable();
      component.columnVisibilityChange.subscribe((v) => emitted.push(v));

      component['onToggleColumnVisibility']('montant', false);

      expect(component['displayedColumnIds']()).toEqual(['nom', 'statut', 'actif']);
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

      expect(component['displayedColumnIds']()).toEqual(['nom', 'statut']);
    });

    it('affiche le bouton "Colonnes" par défaut, et le masque via columnsMenuEnabled=false', async () => {
      const {fixture: withDefault} = await createTable();
      expect(withDefault.nativeElement.textContent).toContain('Colonnes');

      const {fixture: withoutButton} = await createTable({columnsMenuEnabled: false});
      expect(withoutButton.nativeElement.textContent).not.toContain('Colonnes');
    });

    it('columnsMenuEnabled=false ne touche pas au fonctionnement sous-jacent de la visibilité', async () => {
      const {component} = await createTable({columnsMenuEnabled: false});

      component['onToggleColumnVisibility']('montant', false);

      expect(component['displayedColumnIds']()).toEqual(['nom', 'statut', 'actif']);
    });

    it('réordonne les colonnes au drop et notifie le nouvel ordre', async () => {
      const emitted: string[][] = [];
      const {component} = await createTable();
      component.columnOrderChange.subscribe((o) => emitted.push(o));
      const dragEvent = {preventDefault: () => undefined, dataTransfer: null} as unknown as DragEvent;

      component['onColumnDragStart'](dragEvent, component.columns()[3]); // `actif`
      component['onColumnDrop'](dragEvent, component.columns()[0]); // déposé sur `nom`

      expect(emitted.at(-1)).toEqual(['actif', 'nom', 'montant', 'statut']);
      expect(component['displayedColumnIds']()).toEqual(['actif', 'nom', 'montant', 'statut']);
    });

    it('ignore un drop sur la colonne d’origine', async () => {
      const emitted: string[][] = [];
      const {component} = await createTable();
      component.columnOrderChange.subscribe((o) => emitted.push(o));
      const dragEvent = {preventDefault: () => undefined, dataTransfer: null} as unknown as DragEvent;

      component['onColumnDragStart'](dragEvent, component.columns()[0]);
      component['onColumnDrop'](dragEvent, component.columns()[0]);

      expect(emitted).toEqual([]);
    });

    it("ne refiltre/retrie pas les lignes quand seul l'ordre des colonnes change (perf)", async () => {
      const {component} = await createTable();
      // Emprunte le pipeline filtre + tri de `filteredSortedRows` avant de réordonner.
      component['onFilterValue']('statut', 'VALIDEE');
      component['onHeaderSort'](component.columns()[0]);
      const before = component.displayedRows();

      const dragEvent = {preventDefault: () => undefined, dataTransfer: null} as unknown as DragEvent;
      component['onColumnDragStart'](dragEvent, component.columns()[3]); // `actif`
      component['onColumnDrop'](dragEvent, component.columns()[0]); // déposé sur `nom`

      // Même référence : `filteredSortedRows` (dépend de `visibleColumnsUnordered`,
      // pas `visibleColumns`) n'a pas été recalculé — seul l'ordre d'affichage
      // des colonnes doit changer, jamais le contenu/tri des lignes.
      expect(component.displayedRows()).toBe(before);
      expect(component['displayedColumnIds']()).toEqual(['actif', 'nom', 'montant', 'statut']);
    });
  });

  describe('sélection de lignes', () => {
    it('sélectionne une ligne et publie les lignes sélectionnées', async () => {
      const {component} = await createTable({rowSelectionEnabled: true, rowKeyAccessor: (r: Row) => r.id});
      const events: unknown[] = [];
      component.selectionChange.subscribe((e) => events.push(e));

      component['onToggleRowSelection']({checked: true} as MatCheckboxChange, ROWS[1]);

      expect(component.isRowSelected(ROWS[1])).toBe(true);
      expect(component.selectedRowsCount()).toBe(1);
      expect(events).toHaveLength(1);
      expect((events[0] as { selectedRows: Row[] }).selectedRows).toEqual([ROWS[1]]);
    });

    it('sélectionne / désélectionne toutes les lignes affichées', async () => {
      const {component} = await createTable({rowSelectionEnabled: true, rowKeyAccessor: (r: Row) => r.id});

      component['onToggleAllDisplayedRows']({checked: true} as MatCheckboxChange);
      expect(component['areAllDisplayedRowsSelected']()).toBe(true);

      component['onToggleAllDisplayedRows']({checked: false} as MatCheckboxChange);
      expect(component.selectedRowsCount()).toBe(0);
    });

    it('signale une sélection partielle', async () => {
      const {component} = await createTable({rowSelectionEnabled: true, rowKeyAccessor: (r: Row) => r.id});

      component['onToggleRowSelection']({checked: true} as MatCheckboxChange, ROWS[0]);

      expect(component['hasPartiallySelectedDisplayedRows']()).toBe(true);
      expect(component['areAllDisplayedRowsSelected']()).toBe(false);
    });

    it('conserve la sélection correcte après un changement de pageSize, sans id ni rowKeyAccessor', async () => {
      const rowsWithoutId = ROWS.map(({id: _id, ...rest}) => rest) as unknown as Row[];
      const {component, setInput} = await createTable({
        rows: rowsWithoutId,
        rowSelectionEnabled: true,
        pageTrackingEnabled: true,
        pageSize: 1,
      });

      const targetRow = rowsWithoutId[1]; // 'alice'
      component['onToggleRowSelection']({checked: true} as MatCheckboxChange, targetRow);
      expect(component.isRowSelected(targetRow)).toBe(true);

      await setInput('pageSize', 2); // ex. l'utilisateur change la taille de page

      expect(component.isRowSelected(targetRow)).toBe(true);
      expect(component.selectedRowsCount()).toBe(1);
    });

    it("ignore rowTrackBy pour la clé de sélection (c'est un trackBy de rendu, pas une clé métier)", async () => {
      // Un trackBy qui renvoie toujours la même valeur (ex. basé sur l'index de rendu,
      // non stable au tri/filtre/pagination) ne doit jamais faire confondre deux lignes.
      const degenerateTrackBy: TrackByFunction<Row> = () => 'same-for-every-row';
      const {component} = await createTable({rowSelectionEnabled: true, rowTrackBy: degenerateTrackBy});

      component['onToggleRowSelection']({checked: true} as MatCheckboxChange, ROWS[0]);

      expect(component.isRowSelected(ROWS[0])).toBe(true);
      expect(component.isRowSelected(ROWS[1])).toBe(false);
    });
  });

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
      source.component['onFilterValue']('statut', 'BROUILLON');
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
      component['onToggleColumnVisibility']('montant', false);
      component['onFilterValue']('statut', 'VALIDEE');

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
      component['onFilterValue']('statut', 'BROUILLON');
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
      component['onFilterValue']('statut', 'VALIDEE');
      component.saveCurrentAsView('Ma vue');
      const view = component.viewsList()[0];

      component['onFilterValue']('statut', 'BROUILLON');
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

      expect(component['viewUpdateIconName'](view)).toBe('sync');

      component.updateView(view);
      expect(component['viewUpdateIconName'](view)).toBe('check');

      vi.advanceTimersByTime(1400);
      expect(component['viewUpdateIconName'](view)).toBe('sync');
    });

    it('réapplique l’état complet à l’activation d’une vue', async () => {
      const {component} = await createTable({viewsEnabled: true, viewsStorageKey: 'test-list'});
      component['onFilterValue']('statut', 'VALIDEE');
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

      component['onResizeStart'](resizeEvent, column);
      component['onResizeMove']({clientX: 60} as MouseEvent);
      component['stopResize']();
      expect(component['columnWidthPx'](column)).toBe(260);

      component.saveCurrentAsView('Large');
      const view = component.viewsList()[0];
      expect(view.state.columnWidths?.[column.id]).toBe(260);

      // L'utilisateur remet la colonne à une autre largeur, puis réactive la vue.
      component['onResizeStart'](resizeEvent, column);
      component['onResizeMove']({clientX: -60} as MouseEvent);
      component['stopResize']();
      expect(component['columnWidthPx'](column)).toBe(200);

      component.activateView(view);

      expect(component['columnWidthPx'](column)).toBe(260);
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

  describe('chargement', () => {
    it("n'affiche pas d'overlay par défaut", async () => {
      const {fixture} = await createTable();

      expect(fixture.nativeElement.querySelector('.ngt-loading-overlay')).toBeFalsy();
    });

    it('affiche le spinner par défaut quand loading=true', async () => {
      const {fixture} = await createTable({loading: true});

      const overlay = fixture.nativeElement.querySelector('.ngt-loading-overlay');
      expect(overlay).toBeTruthy();
      expect(overlay.querySelector('.ngt-spinner')).toBeTruthy();
    });

    it('affiche le loadingTemplate fourni à la place du spinner par défaut', async () => {
      @Component({
        standalone: true,
        template: `<ng-template #tpl><div class="custom-loader">Chargement...</div></ng-template>`,
      })
      class HostComponent {
        readonly tpl = viewChild.required<TemplateRef<unknown>>('tpl');
      }

      const hostFixture = TestBed.createComponent(HostComponent);
      await hostFixture.whenStable();
      const template = hostFixture.componentInstance.tpl();

      const {fixture} = await createTable({loading: true, loadingTemplate: template});

      expect(fixture.nativeElement.querySelector('.custom-loader')?.textContent).toContain('Chargement...');
      expect(fixture.nativeElement.querySelector('.ngt-spinner')).toBeFalsy();
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

    it('exige une confirmation de plage quand plusieurs pages sont exportables', async () => {
      const {component} = await createTable({exportEnabled: true, pageTrackingEnabled: true, pageSize: 1});

      expect(component['exportTotalPages']()).toBe(3);

      const createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock');
      vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
      vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

      component.openExportDialog();
      expect(createObjectURLSpy).not.toHaveBeenCalled();
      expect(component['exportFromPage']()).toBe(1);
      expect(component['exportToPage']()).toBe(3);

      component['exportFromPage'].set(2);
      component['exportToPage'].set(3);
      component['confirmExportDialog']();
      expect(createObjectURLSpy).toHaveBeenCalledTimes(1);

      createObjectURLSpy.mockRestore();
    });
  });

  describe('labels', () => {
    it('utilise les textes par défaut de la librairie', async () => {
      const {component} = await createTable();

      expect(component['effectiveLabels']().columnsButton).toBe(NG_TABLE_DEFAULT_LABELS.columnsButton);
      expect(component['resolvedEmptyLabel']()).toBe(NG_TABLE_DEFAULT_LABELS.noData);
    });

    it('surcharge partiellement via [labels]', async () => {
      const {component} = await createTable({labels: {columnsButton: 'Columns'}});

      expect(component['effectiveLabels']().columnsButton).toBe('Columns');
      expect(component['effectiveLabels']().viewsButton).toBe(NG_TABLE_DEFAULT_LABELS.viewsButton);
    });

    it('interpole {field} dans filterBy', async () => {
      const {component} = await createTable({labels: {filterBy: 'Filter by {field}'}});

      expect(component['filterByAriaLabel'](component.columns()[0])).toBe('Filter by Nom');
    });

    it('garde la même référence de labels quand l’objet est recréé à l’identique', async () => {
      const {component, setInput} = await createTable({labels: {columnsButton: 'Columns'}});
      const first = component['effectiveLabels']();

      await setInput('labels', {columnsButton: 'Columns'}); // nouvel objet, mêmes valeurs

      expect(component['effectiveLabels']()).toBe(first);
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

      expect(component['effectiveLabels']().columnsButton).toBe('Local');
      expect(component['effectiveLabels']().viewsButton).toBe('Vues globales');
      expect(component['effectiveLabels']().ok).toBe(NG_TABLE_DEFAULT_LABELS.ok);
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
      expect(component['effectiveLabels']().columnsButton).toBe('Colonnes');

      lang.set('en');

      expect(component['effectiveLabels']().columnsButton).toBe('Columns');
    });
  });

  describe('copie de cellule', () => {
    it('copie la valeur et publie l’événement', async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'clipboard', {value: {writeText}, configurable: true});
      const {component} = await createTable();
      const copied: unknown[] = [];
      component.cellCopied.subscribe((e) => copied.push(e));

      component['onCopyCellValue'](
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

      expect(component['hasCopyAction'](component.columns()[0], ROWS[0])).toBe(true);
      expect(component['hasCopyAction'](component.columns()[1], ROWS[0])).toBe(false);
    });
  });

  describe('redimensionnement des colonnes', () => {
    it('ne laisse pas le tableau descendre sous la somme des largeurs mini des colonnes', async () => {
      const cols = columns().map((column) => ({...column}));
      cols[0].widthPx = 300;
      const {component, fixture} = await createTable({columns: cols, minTableWidthPx: 400, rowSelectionEnabled: true});

      // 300 (largeur fixée) + 3 colonnes × 120 (largeur mini par défaut) + 48 (cases à cocher)
      expect(component['tableMinWidthPx']()).toBe(708);
      expect((fixture.nativeElement.querySelector('table.ng-table') as HTMLElement).style.minWidth).toBe('708px');

      await fixture.componentRef.setInput('minTableWidthPx', 2000);
      expect(component['tableMinWidthPx']()).toBe(2000);
    });

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

      component['onResizeStart'](mouseEvent(), column);

      component['onResizeMove']({clientX: 500} as MouseEvent);
      expect(component['columnWidthPx'](column)).toBe(300);

      component['onResizeMove']({clientX: -500} as MouseEvent);
      expect(component['columnWidthPx'](column)).toBe(100);

      component['stopResize']();
    });

    it('ignore le double-clic pendant le drag (il déclenche l’auto-fit)', async () => {
      const {component} = await createTable({columns: resizableColumns()});
      const column = component.columns()[0];

      component['onResizeStart'](mouseEvent({detail: 2}), column);
      component['onResizeMove']({clientX: 500} as MouseEvent);

      expect(component['columnWidthPx'](column)).toBe(200); // largeur d'origine inchangée
    });

    it('ne redimensionne pas une colonne non redimensionnable', async () => {
      const {component} = await createTable();
      const column = component.columns()[0]; // `resizable` non défini

      component['onResizeStart'](mouseEvent(), column);
      component['onResizeMove']({clientX: 500} as MouseEvent);

      expect(component['columnWidthPx'](column)).toBeNull();
    });

    it('ne descend jamais sous minWidthPx en auto-fit', async () => {
      const {component} = await createTable({columns: resizableColumns()});
      const column = component.columns()[0];

      component['onResizeAutoFit'](mouseEvent(), column);

      expect(component['columnWidthPx'](column)).toBe(100);
    });

    it('restaure les styles inline après la mesure d’auto-fit', async () => {
      const {component, fixture} = await createTable({columns: resizableColumns()});
      // `measureNaturalWidth` cible en priorité `.header-button` dans l'en-tête
      const measured = fixture.nativeElement.querySelector('.mat-column-nom .header-button') as HTMLElement | null;
      expect(measured).not.toBeNull();

      component['onResizeAutoFit'](mouseEvent(), component.columns()[0]);

      // la mesure dé-contraint temporairement le nœud : rien ne doit rester appliqué
      expect(measured?.style.width ?? '').toBe('');
      expect(measured?.style.maxWidth ?? '').toBe('');
      expect(measured?.style.whiteSpace ?? '').toBe('');
    });

    it('redimensionne au clavier (flèches gauche/droite) sur la poignée', async () => {
      const {component, fixture} = await createTable({columns: resizableColumns()});
      const column = component.columns()[0];
      const handle = fixture.nativeElement.querySelector('.resize-handle') as HTMLElement;

      component['onResizeHandleKeydown'](
        {key: 'ArrowRight', target: handle, preventDefault: () => undefined} as unknown as KeyboardEvent,
        column,
      );
      expect(component['columnWidthPx'](column)).toBe(216); // 200 + le pas de 16px

      component['onResizeHandleKeydown'](
        {key: 'ArrowLeft', target: handle, preventDefault: () => undefined} as unknown as KeyboardEvent,
        column,
      );
      component['onResizeHandleKeydown'](
        {key: 'ArrowLeft', target: handle, preventDefault: () => undefined} as unknown as KeyboardEvent,
        column,
      );
      expect(component['columnWidthPx'](column)).toBe(200 - 16);
    });

    it('ignore les touches autres que les flèches, et une colonne non redimensionnable', async () => {
      const {component} = await createTable({columns: resizableColumns()});
      const column = component.columns()[0];
      const nonResizable = columns()[1];

      component['onResizeHandleKeydown']({key: 'Enter', target: null} as unknown as KeyboardEvent, column);
      expect(component['columnWidthPx'](column)).toBe(200);

      component['onResizeHandleKeydown'](
        {key: 'ArrowRight', target: null, preventDefault: () => undefined} as unknown as KeyboardEvent,
        nonResizable,
      );
      expect(component['columnWidthPx'](nonResizable)).toBeNull();
    });
  });

  describe('accessibilité', () => {
    describe('navigation cellule par cellule ([cellNavigation])', () => {
      const key = (el: Element, k: string, extra: KeyboardEventInit = {}) =>
        el.dispatchEvent(new KeyboardEvent('keydown', {key: k, bubbles: true, cancelable: true, ...extra}));
      const cells = (fixture: ComponentFixture<NgTableComponent>) =>
        [...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLTableRowElement>('tr.data-row')].map((row) => [...row.cells]);

      it('fait de la table un seul arrêt de tabulation, rôle grid', async () => {
        const {fixture} = await createTable({cellNavigation: true, detailRowTemplate: null});
        const table = fixture.nativeElement.querySelector('table') as HTMLElement;

        expect(table.getAttribute('role')).toBe('grid');
        const tabStops = [...table.querySelectorAll('tbody [tabindex="0"]')];
        expect(tabStops).toEqual([cells(fixture)[0][0]]);
        // Le bouton « copier » de la cellule n'est plus un arrêt de tabulation.
        expect((cells(fixture)[0][0].querySelector('button') as HTMLButtonElement).tabIndex).toBe(-1);
      });

      it('déplace le focus et le tabindex avec les flèches, Fin et Ctrl+Début', async () => {
        const {fixture} = await createTable({cellNavigation: true});
        const grid = cells(fixture);
        grid[0][0].focus();

        key(grid[0][0], 'ArrowRight');
        expect(document.activeElement).toBe(grid[0][1]);
        key(grid[0][1], 'ArrowDown');
        expect(document.activeElement).toBe(grid[1][1]);
        key(grid[1][1], 'End');
        expect(document.activeElement).toBe(grid[1][3]);
        expect(grid[1][3].tabIndex).toBe(0);
        expect(grid[0][0].tabIndex).toBe(-1);
        key(grid[1][3], 'Home', {ctrlKey: true});
        expect(document.activeElement).toBe(grid[0][0]);
      });

      it('Entrée entre dans le contenu interactif, Échap revient à la cellule', async () => {
        const {fixture} = await createTable({cellNavigation: true});
        const cell = cells(fixture)[0][0];
        cell.focus();

        key(cell, 'Enter');
        const copyButton = cell.querySelector('button') as HTMLButtonElement;
        expect(document.activeElement).toBe(copyButton);

        key(copyButton, 'Escape');
        expect(document.activeElement).toBe(cell);
      });

      it('Entrée sur une cellule simple active la ligne, Espace la sélectionne', async () => {
        const {component, fixture} = await createTable({cellNavigation: true, rowSelectionEnabled: true});
        const clicked: unknown[] = [];
        component.rowClick.subscribe((row) => clicked.push(row));
        const montantCell = cells(fixture)[1][2]; // [sélection, nom, montant, ...]
        montantCell.focus();

        key(montantCell, 'Enter');
        expect(clicked).toEqual([ROWS[1]]);

        key(montantCell, ' ');
        expect(component.isRowSelected(ROWS[1])).toBe(true);
      });

      it('sans l’option, rien ne change (lignes focusables, pas de rôle grid)', async () => {
        const {fixture} = await createTable({detailRowTemplate: null});
        const table = fixture.nativeElement.querySelector('table') as HTMLElement;
        expect(table.getAttribute('role')).toBeNull();
        expect(table.querySelectorAll('td[tabindex]')).toHaveLength(0);
      });
    });

    it('annonce le tri et le nombre de lignes dans une région aria-live', async () => {
      const {component, fixture} = await createTable();
      const region = () => (fixture.nativeElement.querySelector('.ngt-live-region') as HTMLElement);
      expect(region().getAttribute('role')).toBe('status');

      component['onHeaderSort'](component.columns()[0]);
      await fixture.whenStable();
      expect(region().textContent!.trim()).toBe('Nom, tri croissant. 3 ligne(s) affichée(s)');

      component['onFilterValue']('statut', 'VALIDEE');
      await fixture.whenStable();
      expect(region().textContent!.trim()).toBe('2 ligne(s) affichée(s)');

      component['onFilterValue']('statut', 'ANNULEE');
      expect(component['liveAnnouncement']()).toBe('Aucune ligne ne correspond');
    });

    it('réannonce un message identique (sinon le lecteur d’écran ne le relit pas)', async () => {
      const {component} = await createTable();
      component['onFilterValue']('statut', 'VALIDEE');
      const first = component['liveAnnouncement']();
      component['onFilterValue']('actif', 'true'); // même résultat : 2 lignes
      expect(component['liveAnnouncement']()).not.toBe(first);
      expect(component['liveAnnouncement']().trim()).toBe(first);
    });

    it('mode remote : n’annonce que le tri (le nombre de lignes n’est pas encore connu)', async () => {
      const {component} = await createTable({dataMode: 'remote'});
      component['onHeaderSort'](component.columns()[0]);
      expect(component['liveAnnouncement']()).toBe('Nom, tri croissant');
    });

    it('expose aria-sort sur les colonnes triables, rien sur les autres', async () => {
      const {component} = await createTable();
      const sortable = component.columns()[0]; // `nom`, sortable: true
      const nonSortableColumn = component.columns()[3]; // `actif`, sortable non défini

      expect(component['ariaSortValue'](sortable)).toBe('none');
      expect(component['ariaSortValue'](nonSortableColumn)).toBeNull();

      component['onHeaderSort'](sortable);
      expect(component['ariaSortValue'](sortable)).toBe('ascending');

      component['onHeaderSort'](sortable);
      expect(component['ariaSortValue'](sortable)).toBe('descending');
    });

    it('donne un aria-label à la case "tout sélectionner" et à chaque case de ligne', async () => {
      const {fixture} = await createTable({rowSelectionEnabled: true});

      const headerCheckboxInput = fixture.nativeElement.querySelector(
        '.selection-header-cell input[type="checkbox"]',
      );
      const rowCheckboxInputs = fixture.nativeElement.querySelectorAll('.selection-cell input[type="checkbox"]');

      expect(headerCheckboxInput.getAttribute('aria-label')).toBe(NG_TABLE_DEFAULT_LABELS.selectAllRows);
      expect(rowCheckboxInputs[0].getAttribute('aria-label')).toBe('Sélectionner la ligne 1');
      expect(rowCheckboxInputs[1].getAttribute('aria-label')).toBe('Sélectionner la ligne 2');
    });

    it('rend les lignes focusables au clavier seulement quand elles font quelque chose', async () => {
      const {fixture: plainFixture} = await createTable();
      expect(plainFixture.nativeElement.querySelector('tr.data-row').getAttribute('tabindex')).toBeNull();

      const {fixture: contextMenuFixture} = await createTable({
        rowContextMenuEnabled: true,
        rowContextMenuTemplate: {} as TemplateRef<unknown>,
      });
      expect(contextMenuFixture.nativeElement.querySelector('tr.data-row').getAttribute('tabindex')).toBe('0');
    });

    it('Entrée/Espace sur une ligne équivaut à un clic (bascule le détail)', async () => {
      @Component({
        standalone: true,
        template: `<ng-template #tpl let-row>{{ row.nom }}</ng-template>`,
      })
      class HostComponent {
        readonly tpl = viewChild.required<TemplateRef<unknown>>('tpl');
      }
      const hostFixture = TestBed.createComponent(HostComponent);
      await hostFixture.whenStable();

      const {component} = await createTable({detailRowTemplate: hostFixture.componentInstance.tpl()});
      const row = ROWS[0];

      component['onRowKeydown']({key: 'Enter', preventDefault: () => undefined} as unknown as KeyboardEvent, row);
      expect(component.isRowExpanded(row)).toBe(true);

      component['onRowKeydown']({key: ' ', preventDefault: () => undefined} as unknown as KeyboardEvent, row);
      expect(component.isRowExpanded(row)).toBe(false);
    });

    it('réordonne les colonnes au clavier (flèches gauche/droite sur la poignée)', async () => {
      const {component} = await createTable();
      const emitted: string[][] = [];
      component.columnOrderChange.subscribe((order) => emitted.push(order));
      const nomColumn = component.columns()[0];

      component['onColumnHandleKeydown'](
        {key: 'ArrowRight', preventDefault: () => undefined} as unknown as KeyboardEvent,
        nomColumn,
      );

      expect(emitted).toHaveLength(1);
      expect(emitted[0].indexOf('nom')).toBe(1); // décalée d'un cran vers la droite

      component['onColumnHandleKeydown'](
        {key: 'ArrowLeft', preventDefault: () => undefined} as unknown as KeyboardEvent,
        nomColumn,
      );
      expect(emitted[1].indexOf('nom')).toBe(0); // revenue à sa place
    });

    it('ne réordonne pas hors limites (première/dernière colonne)', async () => {
      const {component} = await createTable();
      const emitted: string[][] = [];
      component.columnOrderChange.subscribe((order) => emitted.push(order));
      const firstColumn = component.columns()[0];
      const lastColumn = component.columns()[component.columns().length - 1];

      component['onColumnHandleKeydown'](
        {key: 'ArrowLeft', preventDefault: () => undefined} as unknown as KeyboardEvent,
        firstColumn,
      );
      component['onColumnHandleKeydown'](
        {key: 'ArrowRight', preventDefault: () => undefined} as unknown as KeyboardEvent,
        lastColumn,
      );

      expect(emitted).toHaveLength(0);
    });

    it('donne un nom accessible à la table (aria-label), personnalisable', async () => {
      const {fixture: defaultFixture} = await createTable();
      expect(defaultFixture.nativeElement.querySelector('table.ng-table').getAttribute('aria-label')).toBe(
        NG_TABLE_DEFAULT_LABELS.tableLabel,
      );

      const {fixture: customFixture} = await createTable({ariaLabel: 'Liste des commandes'});
      expect(customFixture.nativeElement.querySelector('table.ng-table').getAttribute('aria-label')).toBe(
        'Liste des commandes',
      );
    });

    it('donne un aria-label au bouton de copie (jusque-là muet, seul le matTooltip le décrivait)', async () => {
      const {fixture} = await createTable();
      const copyBtn = fixture.nativeElement.querySelector('.copy-action-btn');
      expect(copyBtn.getAttribute('aria-label')).toBe(NG_TABLE_DEFAULT_LABELS.copy);
    });

    it('affiche un texte accessible (pas seulement une icône) pendant le chargement', async () => {
      const {fixture} = await createTable({loading: true});
      const hiddenText = fixture.nativeElement.querySelector('.ngt-loading-overlay .ngt-visually-hidden');
      expect(hiddenText?.textContent?.trim()).toBe(NG_TABLE_DEFAULT_LABELS.loading);
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

      component['onHeaderSort'](component.columns()[0]);

      expect(ids(component.displayedRows())).toEqual(['b', 'a']);
    });

    it('supporte une liste vide sans erreur', async () => {
      const {component} = await createTable({rows: []});

      expect(component.displayedRows()).toEqual([]);
      expect(component.activeFilterSummaries()).toEqual([]);
    });

    it('nettoie les filtres des colonnes retirées', async () => {
      const {component, setInput} = await createTable();
      component['onFilterValue']('statut', 'VALIDEE');

      await setInput('columns', columns().filter((c) => c.id !== 'statut'));

      expect(component['currentFilterValue']('statut')).toBe('');
      expect(ids(component.displayedRows())).toEqual(['1', '2', '3']);
    });
  });
});
