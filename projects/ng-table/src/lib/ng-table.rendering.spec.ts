import {Component, computed, provideZonelessChangeDetection, signal, TemplateRef, viewChild} from '@angular/core';
import {ComponentFixture, TestBed} from '@angular/core/testing';
import {By} from '@angular/platform-browser';
import {NgTableCheckboxChange} from './ng-table-checkbox.component';
import {describe, expect, it, vi} from 'vitest';
import {NgTableComponent} from './ng-table.component';
import type {NgTableColumn} from './ng-table.models';
import {NG_TABLE_DEFAULT_LABELS, provideNgTableLabels} from './ng-table-labels';
import {TruncateTooltipDirective} from './truncate-tooltip.directive';
import {columns, createTable, ids, type Row, ROWS, setupNgTableSpec} from './ng-table.spec-helpers';

describe('NgTableComponent : rendu', () => {
  setupNgTableSpec();

  describe('rendu de base', () => {
    it('affiche toutes les lignes et les colonnes déclarées', async () => {
      const {component} = await createTable();

      expect(ids(component.displayedRows())).toEqual(['1', '2', '3']);
      expect(component.columnLayout.displayedColumnIds()).toEqual(['nom', 'montant', 'statut', 'actif']);
      expect(component.columnLayout.hasColumns()).toBe(true);
    });

    it('masque les colonnes déclarées `visible: false`', async () => {
      const withHidden = columns();
      withHidden[1] = {...withHidden[1], visible: false};
      const {component} = await createTable({columns: withHidden});

      expect(component.columnLayout.displayedColumnIds()).toEqual(['nom', 'statut', 'actif']);
    });

    it('tronque le texte de cellule par défaut, et le fait retourner à la ligne avec textOverflow: "wrap"', async () => {
      const withOverflow = columns();
      withOverflow[0] = {...withOverflow[0], textOverflow: 'wrap'};
      const {fixture} = await createTable({columns: withOverflow});
      const cells = fixture.nativeElement.querySelectorAll('td.cdk-cell');

      expect(cells[0].querySelector('.cell-text--wrap')).toBeTruthy();
      expect(cells[0].querySelector('.cell-text--truncate')).toBeFalsy();
      expect(cells[1].querySelector('.cell-text--truncate')).toBeTruthy();
    });

    it('porte la tooltip de troncature sur le libellé d’en-tête, avec le texte de la colonne', async () => {
      const {fixture} = await createTable();
      const headerLabelEl = fixture.debugElement.query(By.css('th.cdk-header-cell .header-label'));
      const directive = headerLabelEl.injector.get(TruncateTooltipDirective);

      expect(directive.text).toBe('Nom');
    });

    it('force le layout fixe de la table (sans lui, une cellule `nowrap` élargit sa colonne et rien ne peut être tronqué)', async () => {
      const {fixture} = await createTable();
      const table = fixture.nativeElement.querySelector('table.ng-table');

      // `[fixedLayout]="true"` : le CdkTable pose sa classe de layout fixe, en plus de la règle `.ng-table`.
      expect(table.classList.contains('cdk-table-fixed-layout')).toBe(true);
    });

    it('tronque par défaut le rendu d’un cellTemplate, comme pour valueAccessor, sauf textOverflow: "wrap" explicite', async () => {
      @Component({
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
      const defaultCells = defaultFixture.nativeElement.querySelectorAll('td.cdk-cell');
      expect(defaultCells[0].querySelector('.cell-text--truncate')).toBeTruthy();

      const {fixture: wrapFixture} = await createTable({columns: withWrap});
      const wrapCells = wrapFixture.nativeElement.querySelectorAll('td.cdk-cell');
      expect(wrapCells[1].querySelector('.cell-text--wrap')).toBeTruthy();
      expect(wrapCells[1].querySelector('.cell-text--truncate')).toBeFalsy();
    });

    it('ajoute la colonne technique de sélection quand elle est activée', async () => {
      const {component} = await createTable({rowSelectionEnabled: true});

      expect(component.columnLayout.displayedColumnIds()[0]).toBe('__row_selection__');
    });

    it('garde la même référence de displayedColumnIds quand les ids sont identiques', async () => {
      const {component, setInput} = await createTable();
      const first = component.columnLayout.displayedColumnIds();

      // nouveau tableau de colonnes (donc recalcul), mais mêmes ids dans le même ordre :
      // `equal` doit conserver la référence pour ne pas faire retravailler mat-table.
      await setInput('columns', columns());

      expect(component.columnLayout.displayedColumnIds()).toBe(first);
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

  describe('réutilisation des lignes en défilement virtuel ([rowReuse])', () => {
    const many: Row[] = Array.from({length: 5000}, (_, i) => ({id: `${i}`, nom: `Client ${i}`, montant: i, statut: i % 2 ? 'VALIDEE' : 'BROUILLON', actif: true, date: '2026-01-01'}));
    const plain = (): NgTableColumn<Row>[] => [
      {id: 'nom', header: 'Nom', valueAccessor: (r) => r.nom, sortable: true},
      {id: 'montant', header: 'Montant', valueAccessor: (r) => r.montant, sortable: true},
    ];
    const rowsOf = (fixture: ComponentFixture<NgTableComponent>) => [...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('tr.data-row')];
    const names = (fixture: ComponentFixture<NgTableComponent>) => rowsOf(fixture).map((row) => row.querySelector('td')?.textContent?.trim());

    it('un saut ne recrée aucune ligne : les mêmes éléments montrent les nouvelles données, dans l’ordre', async () => {
      const {fixture, component} = await createTable({columns: plain(), rows: many, virtualScroll: true});
      // Depuis le haut de liste, la tranche n'a pas de marge au-dessus : on part d'une position au milieu.
      component.scrollToIndex(1000);
      await fixture.whenStable();
      const before = new Set(rowsOf(fixture));
      expect(before.size).toBeGreaterThan(10);

      component.scrollToIndex(3000);
      await fixture.whenStable();
      const after = rowsOf(fixture);
      expect(after.filter((row) => before.has(row)), 'éléments repris').toHaveLength(after.length);
      // Tranche rendue : 8 lignes de marge au-dessus de la ligne visée.
      expect(names(fixture).slice(0, 3)).toEqual(['Client 2992', 'Client 2993', 'Client 2994']);
      const all = names(fixture);
      expect(all).toEqual(Array.from({length: all.length}, (_, i) => `Client ${2992 + i}`));
    });

    it('défiler d’une ligne garde toutes les lignes communes intactes : une créée, une détruite, aucune déplacée ni réécrite', async () => {
      const {fixture, component} = await createTable({columns: plain(), rows: many, virtualScroll: true});
      component.scrollToIndex(100);
      await fixture.whenStable();
      const before = rowsOf(fixture);
      const texts = new Map(before.map((row) => [row, row.textContent]));

      component.scrollToIndex(101);
      await fixture.whenStable();
      const after = rowsOf(fixture);
      expect(after.filter((row) => !before.includes(row)), 'une ligne créée').toHaveLength(1);
      expect(before.filter((row) => !after.includes(row)), 'une ligne détruite').toHaveLength(1);
      expect(after.filter((row) => before.includes(row) && texts.get(row) !== row.textContent), 'aucune ligne commune réécrite').toEqual([]);
      expect(after.slice(0, -1)).toEqual(before.slice(1)); // même ordre dans le document
      expect(names(fixture)[0]).toBe('Client 93');

      // Puis un saut : toutes les lignes sont reprises, y compris celle créée à l'instant.
      component.scrollToIndex(4000);
      await fixture.whenStable();
      expect(rowsOf(fixture)).toEqual(after);
      expect(names(fixture)[0]).toBe('Client 3992');
    });

    it('tri, filtre et sélection restent justes sur des lignes reprises', async () => {
      const {fixture, component} = await createTable({columns: plain(), rows: many, virtualScroll: true, rowSelectionEnabled: true, selectedRowKeys: ['4999']});
      component.sorting.onHeaderSort(component.columns()[1]);
      component.sorting.onHeaderSort(component.columns()[1]); // montant décroissant
      await fixture.whenStable();
      expect(rowsOf(fixture)[0].textContent).toContain('Client 4999');
      expect(rowsOf(fixture)[0].querySelector('ng-table-checkbox input, ng-table-checkbox [aria-checked="true"], input:checked')).not.toBeNull();
      component.scrollToIndex(2000);
      await fixture.whenStable();
      expect(rowsOf(fixture).some((row) => row.textContent?.includes('Client 4999'))).toBe(false);
      expect((fixture.nativeElement as HTMLElement).querySelector('tr.data-row input:checked')).toBeNull();
    });

    it('mode auto : pas de réutilisation avec un cellTemplate ou un détail ; [rowReuse]="false" la coupe', async () => {
      const off = await createTable({columns: plain(), rows: many, virtualScroll: true, rowReuse: false});
      const before = new Set(rowsOf(off.fixture));
      off.component.scrollToIndex(3000);
      await off.fixture.whenStable();
      expect(rowsOf(off.fixture).filter((row) => before.has(row))).toHaveLength(0);
    });
  });

  describe('aspect (version 6.0)', () => {
    const el = (fixture: ComponentFixture<NgTableComponent>) => fixture.nativeElement as HTMLElement;

    it('une colonne de nombres est alignée à droite (en-tête et cellules) ; `align` l’emporte', async () => {
      const {fixture, setInput} = await createTable();
      expect(el(fixture).querySelector('th.cdk-column-montant')!.classList.contains('ngt-align-end')).toBe(true);
      expect(el(fixture).querySelector('td.cdk-column-montant')!.classList.contains('ngt-align-end')).toBe(true);
      expect(el(fixture).querySelector('td.cdk-column-nom')!.classList.contains('ngt-align-end')).toBe(false);

      const cols = columns();
      cols[1] = {...cols[1], align: 'center'};
      cols[0] = {...cols[0], align: 'end'};
      await setInput('columns', cols);
      expect(el(fixture).querySelector('td.cdk-column-montant')!.className).toContain('ngt-align-center');
      expect(el(fixture).querySelector('td.cdk-column-montant')!.className).not.toContain('ngt-align-end');
      expect(el(fixture).querySelector('th.cdk-column-nom')!.className).toContain('ngt-align-end');
    });

    it('numberFormat et dateFormat changent l’affichage, pas la valeur : le tri reste numérique', async () => {
      const cols = columns();
      cols[1] = {...cols[1], numberFormat: {minimumFractionDigits: 2}};
      cols.push({id: 'date', header: 'Date', valueAccessor: (r) => r.date, dateFormat: {year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'UTC'}});
      const big: Row = {id: '9', nom: 'Zoé', montant: 1234567.5, statut: 'VALIDEE', actif: true, date: '2026-03-09'};
      const {fixture, component} = await createTable({columns: cols, rows: [...ROWS, big]});
      const cellText = (id: string, column: string) =>
        [...el(fixture).querySelectorAll('tr.data-row')].find((row) => row.textContent?.includes(id))!.querySelector(`td.cdk-column-${column}`)!.textContent!.trim();
      expect(cellText('Zoé', 'montant')).toBe(new Intl.NumberFormat(undefined, {minimumFractionDigits: 2}).format(1234567.5));
      expect(cellText('Zoé', 'date')).toBe(new Intl.DateTimeFormat(undefined, {year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'UTC'}).format(new Date('2026-03-09')));
      component.sorting.onHeaderSort(component.columns()[1]);
      component.sorting.onHeaderSort(component.columns()[1]);
      expect((component.displayedRows() as Row[])[0].id).toBe('9'); // 1 234 567,5 est bien le plus grand nombre, pas un texte
    });

    it('ligne sélectionnée et lignes alternées portent une classe', async () => {
      const {fixture, setInput} = await createTable({rowSelectionEnabled: true, selectedRowKeys: ['2']});
      const rows = () => [...el(fixture).querySelectorAll('tr.data-row')];
      expect(rows().map((row) => row.classList.contains('ngt-row-selected'))).toEqual([false, true, false]);
      expect(rows().some((row) => row.classList.contains('ngt-row-alt'))).toBe(false);
      await setInput('striped', true);
      expect(rows().map((row) => row.classList.contains('ngt-row-alt'))).toEqual([false, true, false]);
    });

    it('liste vidée par un filtre : un seul bouton de réinitialisation quand la barre des filtres est affichée', async () => {
      const without = await createTable({filters: {statut: 'INCONNU'}});
      expect(el(without.fixture).querySelectorAll('.no-data-cell__action')).toHaveLength(1);
      const withBar = await createTable({filters: {statut: 'INCONNU'}, showActiveFiltersBar: true});
      expect(el(withBar.fixture).querySelector('.active-filters-bar__reset')).not.toBeNull();
      expect(el(withBar.fixture).querySelectorAll('.no-data-cell__action')).toHaveLength(0);
    });

    it('table à l’étroit : les colonnes épinglées sont libérées, sauf avec [pinColumnsOnMobile]', async () => {
      const cols = columns();
      cols[0] = {...cols[0], pinned: 'left'};
      const {fixture, component, setInput} = await createTable({columns: cols});
      const sticky = () => el(fixture).querySelector('th.cdk-column-nom')!.classList.contains('cdk-table-sticky');
      expect(sticky()).toBe(true);
      component.columnLayout.isMobileView.set(true);
      await fixture.whenStable();
      expect(component.columnLayout.pinnedSide(component.columns()[0])).toBeUndefined();
      expect(sticky()).toBe(false);
      await setInput('pinColumnsOnMobile', true);
      expect(component.columnLayout.pinnedSide(component.columns()[0])).toBe('left');
    });

    it('filtre : même entonnoir au repos et actif, l’état actif est porté par une classe', async () => {
      const {fixture, setInput} = await createTable();
      const button = () => el(fixture).querySelector<HTMLElement>('th.cdk-column-nom .filter-button')!;
      expect(button().classList.contains('filter-active')).toBe(false);
      expect(button().querySelector('ng-table-icon')!.getAttribute('name')).toBe('filter_alt');
      await setInput('filters', {nom: 'a'});
      expect(button().classList.contains('filter-active')).toBe(true);
      expect(button().querySelector('ng-table-icon')!.getAttribute('name')).toBe('filter_alt');
    });

    it('cellule de texte simple : chemin court, même structure que les autres cellules', async () => {
      const {fixture} = await createTable();
      const plain = el(fixture).querySelector('td.cdk-column-montant')!;
      expect(plain.querySelector(':scope > .cell-content > .cell-text.cell-text--truncate')).not.toBeNull();
      // « nom » a un bouton de copie : il garde le chemin complet.
      expect(el(fixture).querySelector('td.cdk-column-nom .copy-action-btn')).not.toBeNull();
    });
  });

  describe('virtualisation horizontale ([virtualColumns])', () => {
    interface Wide {
      id: string;
      [key: string]: string;
    }
    const wideColumns: NgTableColumn<Wide>[] = Array.from({length: 100}, (_, i) => ({
      id: `c${i}`,
      header: `Col ${i}`,
      valueAccessor: (row: Wide) => row[`c${i}`],
      widthPx: 100,
      ...(i === 0 ? {pinned: 'left' as const} : {}),
    }));
    const wideRows: Wide[] = Array.from({length: 3}, (_, r) =>
      Object.fromEntries([['id', `${r}`], ...wideColumns.map((c) => [c.id, `${c.id}-r${r}`])]) as Wide,
    );
    const headerIds = (fixture: ComponentFixture<NgTableComponent>) =>
      [...(fixture.nativeElement as HTMLElement).querySelectorAll('tr.cdk-header-row th')].map(
        (th) => [...th.classList].find((c) => c.startsWith('cdk-column-'))!.replace('cdk-column-', ''),
      );

    async function scrollLeft(fixture: ComponentFixture<NgTableComponent>, left: number) {
      const wrap = fixture.nativeElement.querySelector('.table-wrap') as HTMLElement;
      Object.defineProperty(wrap, 'scrollLeft', {value: left, configurable: true, writable: true});
      wrap.dispatchEvent(new Event('scroll'));
      await fixture.whenStable();
    }

    it('ne rend que les colonnes de la zone visible, la colonne épinglée toujours', async () => {
      const {fixture, component} = await createTable({columns: wideColumns, rows: wideRows, virtualColumns: true});

      // Zone supposée de 1 200 px + 300 px de marge : 15 colonnes libres (c1..c15), plus c0 épinglée.
      const ids = headerIds(fixture);
      expect(ids[0]).toBe('c0');
      expect(ids).toContain('c15');
      expect(ids).not.toContain('c16');
      expect(ids.filter((id) => id.startsWith('c'))).toHaveLength(16);
      expect(component.columnLayout.columnSpacerWidth('left')).toBe(0);
      expect(component.columnLayout.columnSpacerWidth('right')).toBe((99 - 15) * 100);
      // Largeur du tableau = toutes les colonnes : la barre de défilement couvre les 100.
      expect((fixture.nativeElement.querySelector('table.ng-table') as HTMLElement).style.width).toBe('10000px');
    });

    it('suit le défilement horizontal, avec des espacements de la largeur des colonnes non rendues', async () => {
      const {fixture, component} = await createTable({columns: wideColumns, rows: wideRows, virtualColumns: true});

      await scrollLeft(fixture, 5000);

      const ids = headerIds(fixture);
      expect(ids[0]).toBe('c0'); // toujours là
      expect(ids).toContain('c55');
      expect(ids).not.toContain('c10');
      const window = component.columnLayout.columnWindow()!;
      expect(component.columnLayout.columnSpacerWidth('left') + (window.end - window.start) * 100 + component.columnLayout.columnSpacerWidth('right')).toBe(9900);
      expect((fixture.nativeElement as HTMLElement).querySelector('tr.data-row td.cdk-column-c55')!.textContent).toContain('c55-r0');
    });

    it('le modèle de vue n’est calculé que pour les colonnes rendues ; l’export garde toutes les colonnes', async () => {
      const accessor = vi.fn((row: Wide) => row['c90']);
      const cols = wideColumns.map((c) => (c.id === 'c90' ? {...c, valueAccessor: accessor} : c));
      const {component} = await createTable({columns: cols, rows: wideRows, virtualColumns: true});

      component.render.rowViews();
      expect(accessor).not.toHaveBeenCalled(); // c90 hors de la zone visible
      expect(component.visibleColumns()).toHaveLength(100);
    });
  });

  describe('lignes épinglées en haut et en bas', () => {
    const TOP: Row = {id: 'top-1', nom: 'Synthèse', montant: 0, statut: 'VALIDEE', actif: true, date: '2026-01-01'};
    const BOTTOM: Row = {id: 'total', nom: 'Total', montant: 600, statut: 'VALIDEE', actif: true, date: '2026-01-01'};
    const trs = (fixture: ComponentFixture<NgTableComponent>) =>
      [...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLTableRowElement>('tr.data-row')];
    const names = (fixture: ComponentFixture<NgTableComponent>) => trs(fixture).map((tr) => tr.querySelector('td.cdk-column-nom')?.textContent?.replace('content_copy', '').trim());

    it('rend les lignes épinglées avant et après le corps, avec leur côté et leur rang', async () => {
      const {fixture, component} = await createTable({pinnedTopRows: [TOP], pinnedBottomRows: [BOTTOM, {...BOTTOM, id: 't2', nom: 'Moyenne'}]});

      expect(names(fixture)).toEqual(['Synthèse', 'Charlie', 'alice', 'Bob', 'Total', 'Moyenne']);
      const pins = trs(fixture).map((tr) => tr.getAttribute('data-ngt-pin'));
      expect(pins).toEqual(['top', null, null, null, 'bottom', 'bottom']);
      // Rang compté depuis le bord le plus proche : la dernière ligne du bas a le rang 0.
      expect(trs(fixture).map((tr) => tr.style.getPropertyValue('--ngt-pin-index'))).toEqual(['0', '', '', '', '1', '0']);
      expect(trs(fixture)[0].hasAttribute('data-ngt-pin-edge')).toBe(true);
      expect(trs(fixture)[4].hasAttribute('data-ngt-pin-edge')).toBe(true);
      expect(trs(fixture)[5].hasAttribute('data-ngt-pin-edge')).toBe(false);
      // Ce ne sont pas des lignes de [rows].
      expect(component.displayedRows()).toHaveLength(3);
    });

    it('ni filtrées, ni triées, ni sélectionnables, sans ligne détail', async () => {
      const {component, fixture} = await createTable({
        pinnedTopRows: [TOP], rowSelectionEnabled: true, detailRowTemplate: null,
      });
      component.filtering.onFilterValue('statut', 'BROUILLON');
      component.sorting.onHeaderSort(component.columns()[1]);
      await fixture.whenStable();

      expect(names(fixture)).toEqual(['Synthèse', 'alice']); // le filtre ne touche pas la ligne épinglée
      const checkboxes = trs(fixture).map((tr) => !!tr.querySelector('td.selection-cell ng-table-checkbox'));
      expect(checkboxes).toEqual([false, true]);
    });

    it('une ligne épinglée ne déplie pas de détail', async () => {
      const {component} = await createTable({pinnedTopRows: [TOP], detailRowTemplate: {} as never});
      // `detailRowRenderWhen` écarte les lignes épinglées : aucune ligne détail pour elles.
      expect(component.detail.detailRowRenderWhen(0, TOP)).toBe(false);
      expect(component.detail.detailRowRenderWhen(0, ROWS[0])).toBe(true);
    });

    it('en défilement virtuel, restent hors de la tranche : ni comptées dans la liste, ni fenêtrées', async () => {
      const many: Row[] = Array.from({length: 500}, (_, i) => ({...ROWS[0], id: `r${i}`, nom: `Client ${i}`}));
      const {fixture} = await createTable({rows: many, virtualScroll: true, pinnedTopRows: [TOP], pinnedBottomRows: [BOTTOM]});

      const rows = names(fixture);
      expect(rows[0]).toBe('Synthèse');
      expect(rows.at(-1)).toBe('Total');
      expect(rows).toHaveLength(25 + 2); // tranche virtuelle (zone de 800 px) + 2 lignes épinglées
      // Les espacements encadrent la tranche, pas les lignes épinglées.
      const body = [...(fixture.nativeElement as HTMLElement).querySelectorAll('tbody tr')].map((tr) => tr.className.match(/spacer-row|data-row/)?.[0]);
      expect(body[0]).toBe('data-row');
      expect(body[1]).toBe('spacer-row');
      expect(body.at(-2)).toBe('spacer-row');
      expect(body.at(-1)).toBe('data-row');
    });

    it('la navigation clavier retrouve la bonne ligne, épinglée ou non', async () => {
      const {component, fixture} = await createTable({cellNavigation: true, pinnedTopRows: [TOP]});
      const clicked: Row[] = [];
      component.rowClick.subscribe((row) => clicked.push(row));

      const montant = (index: number) => trs(fixture)[index].cells[1]; // colonne « montant », sans bouton
      montant(0).focus();
      montant(0).dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true}));
      montant(1).focus();
      montant(1).dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true}));

      expect(clicked.map((row) => row.id)).toEqual(['top-1', '1']);
    });

    it('les mesures d’en-tête et de ligne sont exposées au CSS', async () => {
      const {fixture} = await createTable({pinnedTopRows: [TOP], stickyHeader: true});
      const table = fixture.nativeElement.querySelector('table.ng-table') as HTMLElement;
      expect(table.style.getPropertyValue('--ngt-row-h')).toBe('48px');
      expect(table.style.getPropertyValue('--ngt-header-h')).toBe('56px'); // valeurs par défaut sous jsdom (pas de mise en page)
    });
  });

  describe('en-têtes de colonnes groupés ([headerGroup])', () => {
    const grouped = (): NgTableColumn<Row>[] => [
      {id: 'nom', header: 'Nom', valueAccessor: (r) => r.nom, headerGroup: ['Client', 'Identité']},
      {id: 'statut', header: 'Statut', valueAccessor: (r) => r.statut, headerGroup: ['Client', 'Identité']},
      {id: 'date', header: 'Date', valueAccessor: (r) => r.date, headerGroup: ['Client', 'Suivi']},
      {id: 'montant', header: 'Montant', valueAccessor: (r) => r.montant, headerGroup: 'Finance'},
      {id: 'actif', header: 'Actif', valueAccessor: (r) => r.actif},
    ];
    const groupRowsOf = (fixture: ComponentFixture<NgTableComponent>) =>
      [...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLTableRowElement>('tr.header-group-row')].map((tr) =>
        [...tr.cells].map((th) => `${th.textContent?.trim() || '·'}×${th.colSpan}`).join(' '),
      );

    it('ajoute une ligne d’en-tête par niveau, au-dessus de celle des colonnes, avec des colspan', async () => {
      const {fixture} = await createTable({columns: grouped()});

      expect(groupRowsOf(fixture)).toEqual(['Client×3 Finance×1 ·×1', 'Identité×2 Suivi×1 ·×2']);
      const headerRows = [...(fixture.nativeElement as HTMLElement).querySelectorAll('tr.cdk-header-row')].map((tr) => tr.className.includes('header-group-row') ? 'groupe' : 'colonnes');
      expect(headerRows).toEqual(['groupe', 'groupe', 'colonnes']);
    });

    it('sans colonne groupée, aucune ligne supplémentaire', async () => {
      const {fixture} = await createTable();
      expect(groupRowsOf(fixture)).toEqual([]);
    });

    it('la colonne de sélection a sa cellule vide ; la somme des colspan = nombre de colonnes affichées', async () => {
      const {fixture, component} = await createTable({columns: grouped(), rowSelectionEnabled: true});

      expect(groupRowsOf(fixture)[0]).toBe('·×1 Client×3 Finance×1 ·×1');
      const spans = [...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLTableRowElement>('tr.header-group-row')[0].cells]
        .reduce((sum, th) => sum + th.colSpan, 0);
      expect(spans).toBe(component.columnLayout.displayedColumnIds().length);
    });

    it('un groupe suit le masquage et le déplacement des colonnes', async () => {
      const {fixture, component} = await createTable({columns: grouped()});

      component.columnLayout.onToggleColumnVisibility('statut', false);
      await fixture.whenStable();
      expect(groupRowsOf(fixture)).toEqual(['Client×2 Finance×1 ·×1', 'Identité×1 Suivi×1 ·×2']);

      component.columnLayout.onToggleColumnVisibility('statut', true);
      component.columnMove.moveColumnNextTo('montant', 'nom'); // Finance passe avant Client
      await fixture.whenStable();
      expect(groupRowsOf(fixture)[0]).toBe('Finance×1 Client×3 ·×1');
    });

    it('colonne épinglée : son groupe est une cellule à part, épinglée comme elle', async () => {
      const cols = grouped();
      cols[0] = {...cols[0], pinned: 'left'};
      const {fixture} = await createTable({columns: cols});

      expect(groupRowsOf(fixture)[0]).toBe('Client×1 Client×2 Finance×1 ·×1');
      const first = (fixture.nativeElement as HTMLElement).querySelector('tr.header-group-row th')!;
      expect(first.classList).toContain('cdk-table-sticky');
    });
  });

  describe('modèle de vue des lignes', () => {
    const rowsEl = (fixture: ComponentFixture<NgTableComponent>) =>
      [...(fixture.nativeElement as HTMLElement).querySelectorAll('tr.data-row')] as HTMLTableRowElement[];

    it('une détection de changements sans rapport avec les données ne rappelle pas valueAccessor', async () => {
      const accessor = vi.fn((r: Row) => r.montant);
      const cols = columns().map((column) => (column.id === 'montant' ? {...column, valueAccessor: accessor} : column));
      const {component, fixture} = await createTable({columns: cols, rowSelectionEnabled: true, rowKeyAccessor: (r: Row) => r.id});
      const callsAfterRender = accessor.mock.calls.length;
      expect(callsAfterRender).toBe(ROWS.length); // une fois par ligne affichée

      component.selection.onToggleRowSelection({checked: true} as NgTableCheckboxChange, ROWS[1]);
      await fixture.whenStable();

      const checked = rowsEl(fixture).map((row) => row.querySelector<HTMLInputElement>('input[type=checkbox]')?.checked);
      expect(checked).toEqual([false, true, false]); // le rendu a bien été refait
      expect(accessor.mock.calls.length).toBe(callsAfterRender);
    });

    it('suit les signaux lus par rowClassFn', async () => {
      const highlighted = signal('1');
      const {fixture} = await createTable({rowClassFn: (r: Row) => ({highlighted: r.id === highlighted()})});
      const highlightedIds = () => rowsEl(fixture).map((row) => row.classList.contains('highlighted'));
      expect(highlightedIds()).toEqual([true, false, false]);

      highlighted.set('3');
      await fixture.whenStable();
      expect(highlightedIds()).toEqual([false, false, true]);
    });

    it('relit les valeurs quand les lignes sont remplacées', async () => {
      const {fixture, setInput} = await createTable();
      await setInput('rows', ROWS.map((row) => (row.id === '1' ? {...row, nom: 'Charlotte'} : row)));
      expect((fixture.nativeElement as HTMLElement).textContent).toContain('Charlotte');
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

  describe('surlignage de la recherche et état vide', () => {
    const el = (fixture: ComponentFixture<NgTableComponent>) => fixture.nativeElement as HTMLElement;

    it('[highlightSearch] marque le texte trouvé, sans changer le texte des cellules', async () => {
      const {fixture, component} = await createTable({globalSearchEnabled: true, highlightSearch: true});
      expect(el(fixture).querySelectorAll('mark.ngt-search-hit')).toHaveLength(0);

      component.filtering.globalSearchTerm.set('li');
      await fixture.whenStable();
      const marks = [...el(fixture).querySelectorAll('mark.ngt-search-hit')].map((mark) => mark.textContent);
      // Ligne par ligne : Charlie + VALIDEE, alice, puis Bob retenu par son statut VALIDEE (casse ignorée).
      expect(marks).toEqual(['li', 'LI', 'li', 'LI']);
      const names = [...el(fixture).querySelectorAll('tr.data-row td:first-child .cell-text')].map((cell) => cell.textContent?.trim());
      expect(names).toEqual(['Charlie', 'alice', 'Bob']);
    });

    it('sans [highlightSearch], rien n’est marqué', async () => {
      const {fixture, component} = await createTable({globalSearchEnabled: true});
      component.filtering.globalSearchTerm.set('li');
      await fixture.whenStable();
      expect(el(fixture).querySelectorAll('mark')).toHaveLength(0);
    });

    it('liste vidée par les filtres : message dédié et bouton qui les réinitialise', async () => {
      const {fixture, component} = await createTable({globalSearchEnabled: true});
      component.filtering.globalSearchTerm.set('introuvable');
      await fixture.whenStable();
      const cell = el(fixture).querySelector('.no-data-cell')!;
      expect(cell.textContent).toContain(NG_TABLE_DEFAULT_LABELS.noDataFiltered);

      cell.querySelector<HTMLButtonElement>('.no-data-cell__action')!.click();
      await fixture.whenStable();
      expect(el(fixture).querySelectorAll('tr.data-row')).toHaveLength(3);
      expect(component.filtering.globalSearchTerm()).toBe('');
    });

    it('liste vide sans filtre : message habituel, pas de bouton', async () => {
      const {fixture} = await createTable({rows: [], emptyLabel: 'Aucune commande'});
      const cell = el(fixture).querySelector('.no-data-cell')!;
      expect(cell.textContent?.trim()).toBe('Aucune commande');
      expect(cell.querySelector('button')).toBeNull();
    });
  });

  describe('labels', () => {
    it('utilise les textes par défaut de la librairie', async () => {
      const {component} = await createTable();

      expect(component['effectiveLabels']().columnsButton).toBe(NG_TABLE_DEFAULT_LABELS.columnsButton);
      expect(component.render.resolvedEmptyLabel()).toBe(NG_TABLE_DEFAULT_LABELS.noData);
    });

    it('surcharge partiellement via [labels]', async () => {
      const {component} = await createTable({labels: {columnsButton: 'Columns'}});

      expect(component['effectiveLabels']().columnsButton).toBe('Columns');
      expect(component['effectiveLabels']().viewsButton).toBe(NG_TABLE_DEFAULT_LABELS.viewsButton);
    });

    it('interpole {field} dans filterBy', async () => {
      const {component} = await createTable({labels: {filterBy: 'Filter by {field}'}});

      expect(component.filtering.filterByAriaLabel(component.columns()[0])).toBe('Filter by Nom');
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

  describe('robustesse', () => {
    it('trie les valeurs nulles en dernier', async () => {
      const rows: Row[] = [
        {...ROWS[0], id: 'a', nom: ''},
        {...ROWS[1], id: 'b', nom: 'zoe'},
      ];
      const cols = columns();
      cols[0] = {...cols[0], valueAccessor: (r) => (r.nom === '' ? null : r.nom)};
      const {component} = await createTable({columns: cols, rows});

      component.sorting.onHeaderSort(component.columns()[0]);

      expect(ids(component.displayedRows())).toEqual(['b', 'a']);
    });

    it('supporte une liste vide sans erreur', async () => {
      const {component} = await createTable({rows: []});

      expect(component.displayedRows()).toEqual([]);
      expect(component.activeFilterSummaries()).toEqual([]);
    });

    it('nettoie les filtres des colonnes retirées', async () => {
      const {component, setInput} = await createTable();
      component.filtering.onFilterValue('statut', 'VALIDEE');

      await setInput('columns', columns().filter((c) => c.id !== 'statut'));

      expect(component.filtering.currentFilterValue('statut')).toBe('');
      expect(ids(component.displayedRows())).toEqual(['1', '2', '3']);
    });
  });
});
