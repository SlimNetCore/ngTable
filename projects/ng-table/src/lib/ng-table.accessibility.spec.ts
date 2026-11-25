import {Component, TemplateRef, viewChild} from '@angular/core';
import {ComponentFixture, TestBed} from '@angular/core/testing';
import {describe, expect, it} from 'vitest';
import {NgTableComponent} from './ng-table.component';
import {NG_TABLE_DEFAULT_LABELS} from './ng-table-labels';
import {columns, createTable, type Row, ROWS, setupNgTableSpec} from './ng-table.spec-helpers';

describe('NgTableComponent : accessibilité', () => {
  setupNgTableSpec();

  describe('accessibilité au clavier (audit de novembre 2026)', () => {
    const el = (fixture: ComponentFixture<NgTableComponent>) => fixture.nativeElement as HTMLElement;
    const key = (target: Element, name: string) => {
      const event = new KeyboardEvent('keydown', {key: name, bubbles: true, cancelable: true});
      target.dispatchEvent(event);
      return event;
    };

    it('[rowActivatable] : chaque ligne reçoit le focus, Entrée et Espace émettent rowClick', async () => {
      const off = await createTable();
      expect(el(off.fixture).querySelector('tr.data-row')?.getAttribute('tabindex')).toBeNull();

      const {fixture, component} = await createTable({rowActivatable: true});
      const clicks: string[] = [];
      component.rowClick.subscribe((row) => clicks.push((row as Row).id));
      const row = el(fixture).querySelector<HTMLElement>('tr.data-row')!;
      expect(row.getAttribute('tabindex')).toBe('0');
      expect(key(row, 'Enter').defaultPrevented).toBe(true);
      key(row, ' ');
      expect(clicks).toEqual(['1', '1']);
    });

    it('Entrée ou Espace sur un contrôle de la ligne lui appartient : la ligne ne capte pas la touche', async () => {
      const {fixture, component} = await createTable({rowActivatable: true, rowSelectionEnabled: true});
      const clicks: unknown[] = [];
      component.rowClick.subscribe((row) => clicks.push(row));
      const control = el(fixture).querySelector<HTMLElement>('tr.data-row .selection-cell input, tr.data-row .copy-action-btn')!;
      expect(control).not.toBeNull();
      const event = key(control, 'Enter');
      expect(event.defaultPrevented, 'l’action du contrôle n’est pas annulée').toBe(false);
      expect(key(control, ' ').defaultPrevented).toBe(false);
      expect(clicks).toEqual([]);
    });

    it('aria-expanded seulement sur une ligne qui peut se déplier', async () => {
      @Component({imports: [NgTableComponent], template: `<ng-table [columns]="cols" [rows]="rows" [detailRowTemplate]="tpl" [detailRowCanExpand]="can"/><ng-template #tpl>détail</ng-template>`})
      class Host {
        cols = columns();
        rows = ROWS;
        can = (row: Row) => row.id !== '2';
      }
      const fixture = TestBed.createComponent(Host);
      await fixture.whenStable();
      const expanded = [...(fixture.nativeElement as HTMLElement).querySelectorAll('tr.data-row')].map((row) => row.getAttribute('aria-expanded'));
      expect(expanded).toEqual(['false', null, 'false']);
    });

    it('champ « nom de la vue » nommé ; conteneur défilant avec marge de défilement sous l’en-tête collant', async () => {
      const {fixture} = await createTable({viewsEnabled: true, viewsStorageKey: 'a11y', stickyHeader: true, maxHeight: '200px'});
      const wrap = el(fixture).querySelector<HTMLElement>('.table-wrap')!;
      expect(parseFloat(wrap.style.scrollPaddingTop)).toBeGreaterThan(0);
    });

    it('panneau latéral : motif « tabs » complet (liste d’onglets seule, lien avec le contenu, flèches)', async () => {
      const {fixture, component} = await createTable({sidePanel: true});
      component.panel.toggleSidePanel();
      await fixture.whenStable();
      const list = el(fixture).querySelector<HTMLElement>('[role="tablist"]')!;
      const tabs = () => [...list.querySelectorAll<HTMLElement>('[role="tab"]')];
      expect(list.querySelectorAll('button')).toHaveLength(2); // épingler et fermer sont hors de la liste
      const panel = el(fixture).querySelector<HTMLElement>('[role="tabpanel"]')!;
      expect(tabs().map((tab) => tab.getAttribute('aria-controls'))).toEqual([panel.id, panel.id]);
      expect(panel.getAttribute('aria-labelledby')).toBe(tabs()[0].id);
      expect(tabs().map((tab) => tab.getAttribute('tabindex'))).toEqual(['0', '-1']);

      tabs()[0].focus();
      expect(key(tabs()[0], 'ArrowRight').defaultPrevented).toBe(true);
      await fixture.whenStable();
      expect(tabs().map((tab) => tab.getAttribute('aria-selected'))).toEqual(['false', 'true']);
      expect(tabs().map((tab) => tab.getAttribute('tabindex'))).toEqual(['-1', '0']);
      expect(panel.getAttribute('aria-labelledby')).toBe(tabs()[1].id);
      key(tabs()[1], 'Home');
      await fixture.whenStable();
      expect(tabs().map((tab) => tab.getAttribute('aria-selected'))).toEqual(['true', 'false']);
    });

    it('barre d’actions de sélection : F6 y mène depuis la table, les flèches passent d’un bouton à l’autre, F6 en revient', async () => {
      const {fixture} = await createTable({
        rowSelectionEnabled: true,
        selectionBar: true,
        selectedRowKeys: ['1'],
        selectionActions: [{id: 'a', label: 'Archiver'}, {id: 'b', label: 'Supprimer'}],
      });
      document.body.appendChild(fixture.nativeElement);
      try {
        const bar = el(fixture).querySelector<HTMLElement>('.ngt-action-bar')!;
        expect(bar.getAttribute('aria-keyshortcuts')).toBe('F6');
        const buttons = [...bar.querySelectorAll<HTMLElement>('button')];
        expect(buttons.length).toBeGreaterThan(2);
        const start = el(fixture).querySelector<HTMLElement>('tr.data-row input')!;
        start.focus();
        expect(key(start, 'F6').defaultPrevented).toBe(true);
        expect(document.activeElement).toBe(buttons[0]);
        key(buttons[0], 'ArrowRight');
        expect(document.activeElement).toBe(buttons[1]);
        key(buttons[1], 'End');
        expect(document.activeElement).toBe(buttons[buttons.length - 1]);
        key(buttons[buttons.length - 1], 'ArrowRight'); // boucle
        expect(document.activeElement).toBe(buttons[0]);
        key(buttons[0], 'F6');
        expect(document.activeElement).toBe(start);
      } finally {
        (fixture.nativeElement as HTMLElement).remove();
      }
    });

    it('première ligne cochée : l’annonce dit aussi le raccourci de la barre d’actions', async () => {
      const {fixture, component} = await createTable({rowSelectionEnabled: true, selectionBar: true});
      const said = () => el(fixture).querySelector('.ngt-live-region')?.textContent ?? '';
      component.keyboard.toggleRowSelectionFromKeyboard(ROWS[0]);
      await fixture.whenStable();
      expect(said()).toContain(NG_TABLE_DEFAULT_LABELS.selectionBarHint);
      component.keyboard.toggleRowSelectionFromKeyboard(ROWS[1]);
      await fixture.whenStable();
      expect(said()).not.toContain(NG_TABLE_DEFAULT_LABELS.selectionBarHint);
    });

    it('défilement virtuel : Ctrl+Fin atteint la dernière ligne de la liste, pas la dernière ligne rendue', async () => {
      const many: Row[] = Array.from({length: 3000}, (_, i) => ({id: `${i}`, nom: `Client ${i}`, montant: i, statut: 'VALIDEE', actif: true, date: '2026-01-01'}));
      const {fixture} = await createTable({rows: many, virtualScroll: true, cellNavigation: true});
      document.body.appendChild(fixture.nativeElement);
      const settle = async () => {
        await fixture.whenStable();
        await new Promise((resolve) => setTimeout(resolve, 0));
        await fixture.whenStable();
      };
      try {
        const first = el(fixture).querySelector<HTMLElement>('tr.data-row td')!;
        first.focus();
        const end = new KeyboardEvent('keydown', {key: 'End', ctrlKey: true, bubbles: true, cancelable: true});
        first.dispatchEvent(end);
        expect(end.defaultPrevented).toBe(true);
        await settle();
        const active = document.activeElement as HTMLElement;
        expect(active.tagName).toBe('TD');
        expect(active.parentElement?.textContent).toContain('Client 2999');

        active.dispatchEvent(new KeyboardEvent('keydown', {key: 'Home', ctrlKey: true, bubbles: true, cancelable: true}));
        await settle();
        expect((document.activeElement as HTMLElement).parentElement?.textContent).toContain('Client 0');
      } finally {
        (fixture.nativeElement as HTMLElement).remove();
      }
    });

    it('tri multi-niveaux sans Maj+clic : un bouton d’en-tête ajoute la colonne au tri', async () => {
      const {fixture, component} = await createTable({multiSort: true});
      expect(el(fixture).querySelector('.sort-level-button')).toBeNull(); // aucun tri : rien à compléter
      component.sorting.onHeaderSort(component.columns()[0]);
      await fixture.whenStable();
      const add = el(fixture).querySelector<HTMLElement>('th.cdk-column-montant .sort-level-button')!;
      expect(add.getAttribute('aria-label')).toBe(NG_TABLE_DEFAULT_LABELS.addSortLevel.replace('{column}', component.columns()[1].header));
      expect(el(fixture).querySelector('th.cdk-column-nom .sort-level-button'), 'pas sur le seul tri').toBeNull();
      add.click();
      await fixture.whenStable();
      expect(component.sorting.sortStates().map((sort) => sort.columnId)).toEqual(['nom', 'montant']);
    });

    it('vue enregistrée, vue supprimée et « tout replier » sont annoncés', async () => {
      const {fixture, component} = await createTable({viewsEnabled: true, viewsStorageKey: 'a11y-annonces', groupBy: 'statut'});
      const said = () => (el(fixture).querySelector('.ngt-live-region')?.textContent ?? '').replace(/\u00a0/g, '');
      component.saveCurrentAsView('Ma vue');
      await fixture.whenStable();
      expect(said()).toBe(NG_TABLE_DEFAULT_LABELS.announceViewSaved.replace('{name}', 'Ma vue'));
      component.deleteView(component.views.effectiveViewsStore().views[0]);
      await fixture.whenStable();
      expect(said()).toBe(NG_TABLE_DEFAULT_LABELS.announceViewDeleted.replace('{name}', 'Ma vue'));
      component.collapseAllGroups();
      await fixture.whenStable();
      expect(said()).toBe(NG_TABLE_DEFAULT_LABELS.announceAllCollapsed);
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

      component.sorting.onHeaderSort(component.columns()[0]);
      await fixture.whenStable();
      expect(region().textContent!.trim()).toBe('Nom, tri croissant. 3 ligne(s) affichée(s)');

      component.filtering.onFilterValue('statut', 'VALIDEE');
      await fixture.whenStable();
      expect(region().textContent!.trim()).toBe('2 ligne(s) affichée(s)');

      component.filtering.onFilterValue('statut', 'ANNULEE');
      expect(component['liveAnnouncement']()).toBe('Aucune ligne ne correspond');
    });

    it('réannonce un message identique (sinon le lecteur d’écran ne le relit pas)', async () => {
      const {component} = await createTable();
      component.filtering.onFilterValue('statut', 'VALIDEE');
      const first = component['liveAnnouncement']();
      component.filtering.onFilterValue('actif', 'true'); // même résultat : 2 lignes
      expect(component['liveAnnouncement']()).not.toBe(first);
      expect(component['liveAnnouncement']().trim()).toBe(first);
    });

    it('mode remote : n’annonce que le tri (le nombre de lignes n’est pas encore connu)', async () => {
      const {component} = await createTable({dataMode: 'remote'});
      component.sorting.onHeaderSort(component.columns()[0]);
      expect(component['liveAnnouncement']()).toBe('Nom, tri croissant');
    });

    it('expose aria-sort sur les colonnes triables, rien sur les autres', async () => {
      const {component} = await createTable();
      const sortable = component.columns()[0]; // `nom`, sortable: true
      const nonSortableColumn = component.columns()[3]; // `actif`, sortable non défini

      expect(component.sorting.ariaSortValue(sortable)).toBe('none');
      expect(component.sorting.ariaSortValue(nonSortableColumn)).toBeNull();

      component.sorting.onHeaderSort(sortable);
      expect(component.sorting.ariaSortValue(sortable)).toBe('ascending');

      component.sorting.onHeaderSort(sortable);
      expect(component.sorting.ariaSortValue(sortable)).toBe('descending');
    });

    it('donne un aria-label à la case "tout sélectionner" et à chaque case de ligne', async () => {
      const {fixture} = await createTable({rowSelectionEnabled: true});

      const headerCheckboxInput = fixture.nativeElement.querySelector(
        '.selection-header-cell input[type="checkbox"]',
      );
      const rowCheckboxInputs = fixture.nativeElement.querySelectorAll('.selection-cell input[type="checkbox"]');

      expect(headerCheckboxInput.getAttribute('aria-label')).toBe(NG_TABLE_DEFAULT_LABELS.selectAllRows);
      // La case est nommée par la valeur de la première colonne, stable au défilement, et non par son rang de rendu.
      expect(rowCheckboxInputs[0].getAttribute('aria-label')).toBe('Sélectionner la ligne Charlie');
      expect(rowCheckboxInputs[1].getAttribute('aria-label')).toBe('Sélectionner la ligne alice');
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
        template: `<ng-template #tpl let-row>{{ row.nom }}</ng-template>`,
      })
      class HostComponent {
        readonly tpl = viewChild.required<TemplateRef<unknown>>('tpl');
      }
      const hostFixture = TestBed.createComponent(HostComponent);
      await hostFixture.whenStable();

      // Une table dont les lignes se déplient se parcourt cellule par cellule (rôle treegrid) : Entrée sur une cellule
      // sans contrôle équivaut à un clic sur la ligne.
      const {component, fixture} = await createTable({detailRowTemplate: hostFixture.componentInstance.tpl()});
      const row = ROWS[0];
      const root = fixture.nativeElement as HTMLElement;
      expect(root.querySelector('table')?.getAttribute('role')).toBe('treegrid');
      expect(root.querySelector('tr.data-row')?.getAttribute('tabindex'), 'la ligne n’est plus un arrêt de tabulation').toBeNull();
      const cell = root.querySelector<HTMLElement>('tr.data-row td.cdk-column-montant')!;
      expect(root.querySelectorAll('tr.data-row td[tabindex="0"]'), 'une seule cellule atteinte par Tab').toHaveLength(1);

      cell.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true, cancelable: true}));
      expect(component.isRowExpanded(row)).toBe(true);
      cell.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true, cancelable: true}));
      expect(component.isRowExpanded(row)).toBe(false);
    });

    it('en-têtes de groupe dans la grille : flèches pour y aller, Flèche droite / gauche pour déplier / replier, niveaux annoncés', async () => {
      const {component, fixture} = await createTable({groupBy: 'statut'});
      const root = fixture.nativeElement as HTMLElement;
      expect(root.querySelector('table')?.getAttribute('role')).toBe('treegrid');
      const group = () => root.querySelector<HTMLElement>('tr.group-row')!;
      expect(group().getAttribute('tabindex')).toBeNull();
      expect(group().getAttribute('aria-level')).toBe('1');
      expect(root.querySelector('tr.data-row')?.getAttribute('aria-level')).toBe('2');

      const press = (target: Element, key: string) => target.dispatchEvent(new KeyboardEvent('keydown', {key, bubbles: true, cancelable: true}));
      const cell = group().querySelector<HTMLElement>('td')!;
      cell.focus();
      expect(group().getAttribute('aria-expanded')).toBe('true');
      press(cell, 'ArrowLeft');
      await fixture.whenStable();
      expect(group().getAttribute('aria-expanded')).toBe('false');
      expect(component.grouping.collapsedGroups().size).toBe(1);
      press(group().querySelector('td')!, 'ArrowRight');
      await fixture.whenStable();
      expect(group().getAttribute('aria-expanded')).toBe('true');

      // Depuis l'en-tête de groupe, Flèche bas atteint la première ligne de données.
      press(group().querySelector('td')!, 'ArrowDown');
      expect((document.activeElement as HTMLElement).closest('tr')?.classList.contains('data-row')).toBe(true);
    });

    it('réordonne les colonnes au clavier (flèches gauche/droite sur la poignée)', async () => {
      const {component} = await createTable();
      const emitted: string[][] = [];
      component.columnOrderChange.subscribe((order) => emitted.push(order));
      const nomColumn = component.columns()[0];

      component.columnMove.onColumnHandleKeydown(
        {key: 'ArrowRight', preventDefault: () => undefined} as unknown as KeyboardEvent,
        nomColumn,
      );

      expect(emitted).toHaveLength(1);
      expect(emitted[0].indexOf('nom')).toBe(1); // décalée d'un cran vers la droite

      component.columnMove.onColumnHandleKeydown(
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

      component.columnMove.onColumnHandleKeydown(
        {key: 'ArrowLeft', preventDefault: () => undefined} as unknown as KeyboardEvent,
        firstColumn,
      );
      component.columnMove.onColumnHandleKeydown(
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

  describe('barre d’état et panneau latéral', () => {
    const el = (fixture: ComponentFixture<NgTableComponent>) => fixture.nativeElement as HTMLElement;
    const statusText = (fixture: ComponentFixture<NgTableComponent>) =>
      el(fixture).querySelector('.ngt-status-bar')?.textContent?.replace(/\s+/g, ' ').trim() ?? null;

    it('la barre d’état n’existe que sur demande et compte les lignes filtrées', async () => {
      const {fixture, setInput} = await createTable();
      expect(statusText(fixture)).toBeNull();

      await setInput('statusBar', true);
      expect(statusText(fixture)).toBe('3 lignes');

      await setInput('filters', {statut: 'VALIDEE'});
      expect(statusText(fixture)).toBe('2 sur 3 lignes');
    });

    it('elle affiche nombre, somme, moyenne, min et max de la plage sélectionnée', async () => {
      const {fixture, component, setInput} = await createTable({statusBar: true, rangeSelection: true});
      await setInput('rangeSelection', true);
      const mouse = (target: Element, type: string) => target.dispatchEvent(new MouseEvent(type, {bubbles: true, cancelable: true, button: 0}));
      const cell = (row: number) => el(fixture).querySelectorAll('tr.data-row')[row].querySelector('td.cdk-column-montant')!;

      mouse(cell(0), 'mousedown');
      mouse(cell(2), 'mousemove');
      mouse(document.body, 'mouseup');
      await fixture.whenStable();

      expect(component.getSelectedRange()?.rows).toHaveLength(3);
      const text = statusText(fixture)!;
      expect(text).toContain('3 cellules');
      expect(text).toContain('Somme : 600');
      expect(text).toContain('Moyenne : 200');
      expect(text).toContain('Min : 100');
      expect(text).toContain('Max : 300');
    });

    it('un clic à l’extérieur ferme le panneau, sauf s’il est fixé à droite', async () => {
      const {fixture, component} = await createTable({sidePanel: true});
      component.toggleSidePanel();
      await fixture.whenStable();
      el(fixture).querySelector('.ngt-side-panel')!.dispatchEvent(new MouseEvent('click', {bubbles: true}));
      await fixture.whenStable();
      expect(component.sidePanelOpen()).toBe(true); // clic dans le panneau

      document.body.appendChild(document.createElement('p')).dispatchEvent(new MouseEvent('click', {bubbles: true}));
      el(fixture).querySelector('tr.data-row')!.dispatchEvent(new MouseEvent('click', {bubbles: true}));
      await fixture.whenStable();
      expect(component.sidePanelOpen()).toBe(false);

      component.sidePanelPinned.set(true);
      component.toggleSidePanel();
      await fixture.whenStable();
      expect(el(fixture).querySelector('.table-viewport--docked')).not.toBeNull();
      el(fixture).querySelector('tr.data-row')!.dispatchEvent(new MouseEvent('click', {bubbles: true}));
      await fixture.whenStable();
      expect(component.sidePanelOpen()).toBe(true);
    });

    it('le panneau propose une punaise par colonne, qui fixe la colonne à gauche', async () => {
      const {fixture, component} = await createTable({sidePanel: true});
      component.toggleSidePanel();
      await fixture.whenStable();
      const pins = el(fixture).querySelectorAll('.ngt-side-panel .reference-pin');
      expect(pins).toHaveLength(4);
      (pins[1] as HTMLButtonElement).click();
      await fixture.whenStable();
      expect(component.referenceColumn()).toBe('montant');
    });

    it('les largeurs viennent d’un colgroup : colonne de poignées étroite même avec des en-têtes groupés', async () => {
      const cols = columns().map((column) => (column.id === 'nom' ? {...column, headerGroup: 'G', widthPx: 200} : column));
      const {fixture} = await createTable({columns: cols, rowDrag: true});
      const widths = [...el(fixture).querySelectorAll('colgroup col')].map((col) => (col as HTMLElement).style.width);
      expect(widths.slice(0, 2)).toEqual(['40px', '200px']);
    });

    it('le panneau latéral liste les colonnes et les filtres actifs, et se ferme', async () => {
      const {fixture, component, setInput} = await createTable({sidePanel: true, filters: {statut: 'VALIDEE'}});
      expect(el(fixture).querySelector('.ngt-side-panel')).toBeNull();

      component.toggleSidePanel();
      await fixture.whenStable();
      expect(el(fixture).querySelectorAll('.ngt-side-panel__item')).toHaveLength(4);

      component.toggleSidePanel('filters');
      await fixture.whenStable();
      expect(el(fixture).querySelector('.ngt-side-panel__body')?.textContent).toContain('Statut');
      (el(fixture).querySelector('.ngt-side-panel__filter button') as HTMLButtonElement).click();
      await fixture.whenStable();
      expect(el(fixture).querySelector('.ngt-side-panel__empty')).not.toBeNull();

      (el(fixture).querySelector('.ngt-side-panel__close') as HTMLButtonElement).click();
      await fixture.whenStable();
      expect(el(fixture).querySelector('.ngt-side-panel')).toBeNull();
      await setInput('sidePanel', false);
    });
  });
});
