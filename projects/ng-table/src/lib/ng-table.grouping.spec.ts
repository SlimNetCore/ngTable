import {ComponentFixture} from '@angular/core/testing';
import {describe, expect, it} from 'vitest';
import {NgTableComponent} from './ng-table.component';
import type {NgTableColumn, NgTableRemoteQuery} from './ng-table.models';
import {columns, createTable, ids, type Row, ROWS, setupNgTableSpec} from './ng-table.spec-helpers';

describe('NgTableComponent : regroupement', () => {
  setupNgTableSpec();

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

    describe('plusieurs niveaux et panneau de regroupement', () => {
      const levelColumns = () => groupColumns().map((column) => ({...column, groupable: true}));
      const panelChips = (fixture: ComponentFixture<NgTableComponent>) =>
        [...(fixture.nativeElement as HTMLElement).querySelectorAll('.ngt-group-chip')].map((chip) => text(chip).replace(/close$/, '').trim());

      it('regroupe sur deux niveaux : un en-tête par groupe et par sous-groupe, sous-groupes en retrait', async () => {
        const {component, fixture} = await createTable({columns: levelColumns(), groupBy: 'statut', groupLevels: ['actif']});
        await fixture.whenStable();

        const headers = groupRows(fixture);
        expect(headers.map((row) => groupLabel(row).split(' : ')[0])).toEqual(['Statut', 'Actif', 'Statut', 'Actif']);
        const indents = headers.map((row) => (row.querySelector('.group-label') as HTMLElement).style.paddingInlineStart);
        expect(indents).toEqual(['0px', '20px', '0px', '20px']);
        expect(ids(component.displayedRows())).toEqual(['2', '1', '3']);
      });

      it('replier un groupe parent masque ses sous-groupes ; l’état de requête garde les niveaux', async () => {
        const {component, fixture} = await createTable({columns: levelColumns(), groupBy: 'statut', groupLevels: ['actif']});
        await fixture.whenStable();

        groupRows(fixture)[2].click(); // VALIDEE
        await fixture.whenStable();
        expect(groupRows(fixture)).toHaveLength(3); // Brouillon, son sous-groupe, Validée replié
        expect(ids(component.displayedRows())).toEqual(['2']);
        expect(component.getQueryState().groupLevels).toEqual(['actif']);

        component.applyQueryState({groupBy: 'statut', groupLevels: []});
        await fixture.whenStable();
        expect(groupRows(fixture)).toHaveLength(2);
        expect(component.getQueryState().groupLevels).toBeUndefined();
      });

      it('le panneau liste les niveaux, retire un niveau, en ajoute un par le menu et par le glisser-déposer', async () => {
        const {component, fixture} = await createTable({columns: levelColumns(), groupingEnabled: true, groupPanel: true, groupBy: 'statut'});
        await fixture.whenStable();
        expect(panelChips(fixture)).toEqual(['Statut']);

        component.grouping.addGroupLevel('actif');
        await fixture.whenStable();
        expect(panelChips(fixture)).toEqual(['Statut', 'Actif']);
        expect(component.groupLevels()).toEqual(['actif']);

        // Un en-tête glissé sur le panneau devient un niveau de plus.
        component.columnMove.draggingColumnId.set('nom');
        const drop = new Event('drop', {cancelable: true}) as DragEvent;
        (fixture.nativeElement as HTMLElement).querySelector('.ngt-group-panel')!.dispatchEvent(drop);
        await fixture.whenStable();
        expect(panelChips(fixture)).toEqual(['Statut', 'Actif', 'Nom']);

        // Réordonner : « Nom » passe en premier.
        component.grouping.setGroupColumns(['nom', 'statut', 'actif']);
        await fixture.whenStable();
        expect(panelChips(fixture)).toEqual(['Nom', 'Statut', 'Actif']);

        component.grouping.removeGroupLevel(0);
        component.grouping.removeGroupLevel(1);
        await fixture.whenStable();
        expect(panelChips(fixture)).toEqual(['Statut']);
        component.grouping.setGroupBy(null);
        await fixture.whenStable();
        expect(component.groupLevels()).toEqual([]);
        expect((fixture.nativeElement as HTMLElement).querySelector('.ngt-group-panel__hint')).not.toBeNull();
      });

      it('sans option groupPanel, pas de panneau', async () => {
        const {fixture} = await createTable({columns: levelColumns(), groupingEnabled: true});
        await fixture.whenStable();
        expect((fixture.nativeElement as HTMLElement).querySelector('.ngt-group-panel')).toBeNull();
      });
    });
    it('pagine sur les lignes regroupées, un groupe replié comptant pour une ligne', async () => {
      const {component} = await createTable({columns: groupColumns(), groupBy: 'statut', paginator: true, pageSize: 2});
      expect(ids(component.displayedRows())).toEqual(['2', '1']);
      expect(component.paging.paginatorLength()).toBe(3);

      component.collapseAllGroups();
      expect(component.paging.paginatorLength()).toBe(2);
      expect(component.displayedRows()).toEqual([]);
    });

    it('ligne de totaux sur toutes les lignes filtrées', async () => {
      const {component, fixture} = await createTable({columns: groupColumns(), showTotals: true});
      await fixture.whenStable();
      const footer = () => fixture.nativeElement.querySelector('tr.totals-row') as HTMLTableRowElement;

      expect(text(footer().cells[0])).toBe('Total');
      expect(text(footer().cells[1])).toBe('Σ 600');

      component.filtering.onFilterValue('statut', 'VALIDEE');
      await fixture.whenStable();
      expect(text(footer().cells[1])).toBe('Σ 500');
    });

    it('menu « Grouper », changement de colonne et vues', async () => {
      const {component, fixture} = await createTable({columns: groupColumns(), groupingEnabled: true, viewsEnabled: true, viewsStorageKey: 'grp'});
      const button = [...fixture.nativeElement.querySelectorAll('.list-actions button')].find((b: Element) => b.textContent?.includes('Grouper')) as HTMLButtonElement;
      button.click();
      await fixture.whenStable();
      const entries = [...document.querySelectorAll('.ngt-menu-panel [role="menuitemradio"]')];
      expect(entries.map((el) => text(el))).toEqual(['Aucun regroupement', 'Nom', 'Montant', 'Statut', 'Actif']);
      expect(entries.map((el) => el.getAttribute('aria-checked'))).toEqual(['true', 'false', 'false', 'false', 'false']);

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
        // Formaté selon la locale du navigateur (`125 000` en français, `125,000` en anglais).
        expect(text(validee.cells[1])).toBe(`Σ ${new Intl.NumberFormat(undefined).format(125000)}`.replace(/\s+/g, ' '));
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

      it('tout replier depuis une page lointaine revient sur la dernière page qui existe encore', async () => {
        const summaries = [{key: 'VALIDEE', count: 30}, {key: 'BROUILLON', count: 12}];
        const queries: NgTableRemoteQuery[] = [];
        const {component, fixture} = await createTable({
          columns: groupColumns(), dataMode: 'remote', rows: [ROWS[1]], groupBy: 'statut', groupSummaries: summaries,
          paginator: true, pageSize: 10, pageIndex: 4, totalCount: 42,
        });
        component.remoteQueryChange.subscribe((q) => queries.push(q));
        await fixture.whenStable();

        // Page 5 = lignes 40-41, du groupe BROUILLON. Le replier laisse 30 lignes, soit 3 pages.
        groupRows(fixture)[0].click();
        expect(queries.at(-1)).toMatchObject({page: {index: 2}, collapsedGroups: ['BROUILLON']});
        expect(component.pageIndex()).toBe(2);

        component.collapseAllGroups();
        expect(queries.at(-1)).toMatchObject({page: {index: 0}, collapsedGroups: ['VALIDEE', 'BROUILLON']});
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

  describe('en-têtes de groupe collants ([stickyGroupHeaders])', () => {
    const grouped: Row[] = Array.from({length: 600}, (_, i) => ({
      id: `${i}`,
      nom: `Client ${i}`,
      montant: i,
      statut: i < 400 ? 'VALIDEE' : 'BROUILLON',
      actif: true,
      date: '2026-01-01',
    }));
    const groupRows = (fixture: ComponentFixture<NgTableComponent>) =>
      [...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('tr.group-row')];

    it('défilement virtuel : l’en-tête du groupe en cours est remis dans la tranche rendue', async () => {
      const {fixture, component} = await createTable({rows: grouped, groupBy: 'statut', virtualScroll: true, stickyGroupHeaders: true});
      expect(groupRows(fixture).map((row) => row.hasAttribute('data-ngt-group-extra'))).toEqual([false]);

      component.scrollToIndex(100); // au milieu du premier groupe (BROUILLON, 200 lignes) : son en-tête est loin au-dessus
      await fixture.whenStable();
      const rows = groupRows(fixture);
      expect(rows).toHaveLength(1);
      expect(rows[0].hasAttribute('data-ngt-group-extra')).toBe(true);
      expect(rows[0].classList.contains('group-row--sticky')).toBe(true);
      expect(rows[0].textContent).toContain('Brouillon');
      // L'espacement du haut cède la place de la ligne ajoutée : la tranche ne se décale pas.
      const top = parseFloat((fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('td.spacer-cell')!.style.height);
      expect(top).toBe((100 - 8) * 48 - 48);

      component.scrollToIndex(400); // dans le second groupe
      await fixture.whenStable();
      expect(groupRows(fixture).map((row) => row.textContent?.includes('Validée'))).toEqual([true]);
    });

    it('sans l’option, aucun en-tête n’est ajouté ni collé', async () => {
      const {fixture, component} = await createTable({rows: grouped, groupBy: 'statut', virtualScroll: true});
      component.scrollToIndex(100);
      await fixture.whenStable();
      expect(groupRows(fixture)).toHaveLength(0);
    });
  });

  describe('repères de la barre de défilement ([scrollMarkers])', () => {
    const marks = (fixture: ComponentFixture<NgTableComponent>) =>
      [...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('.ngt-scroll-marker')].map((mark) => `${mark.getAttribute('data-kind')}@${Math.round(parseFloat(mark.style.top))}%`);

    // Sous jsdom rien n'est mesuré : en-tête de 56 px et lignes de 48 px (valeurs de départ), soit 200 px de contenu
    // pour trois lignes. La ligne n° i commence donc à (56 + 48 × i) / 200.
    it('un repère par ligne signalée par [rowMarker], là où commence la ligne dans le contenu, masqué aux lecteurs d’écran', async () => {
      const {fixture} = await createTable({scrollMarkers: true, rowMarker: (row: Row) => (row.montant >= 300 ? 'danger' : row.montant === 100 ? 'warning' : null)});
      expect(marks(fixture)).toEqual(['danger@28%', 'warning@52%']);
      expect((fixture.nativeElement as HTMLElement).querySelector('.ngt-scroll-markers')?.getAttribute('aria-hidden')).toBe('true');
    });

    it('suit le tri, et repère les lignes sélectionnées', async () => {
      const {fixture, component} = await createTable({scrollMarkers: true, rowSelectionEnabled: true, selectedRowKeys: ['3']});
      expect(marks(fixture)).toEqual(['selection@76%']);
      component.sorting.onHeaderSort(component.columns()[1]); // montant croissant : Bob (200) passe au milieu
      await fixture.whenStable();
      expect(marks(fixture)).toEqual(['selection@52%']);
    });

    it('un clic sur un repère met sa ligne en évidence un instant', async () => {
      const {fixture} = await createTable({scrollMarkers: true, rowMarker: (row: Row) => (row.id === '3' ? 'danger' : null)});
      const root = fixture.nativeElement as HTMLElement;
      const located = () => [...root.querySelectorAll<HTMLElement>('tr.data-row[data-ngt-located]')].map((row) => row.textContent?.includes('Bob'));
      expect(located()).toEqual([]);
      root.querySelector<HTMLElement>('.ngt-scroll-marker')!.dispatchEvent(new MouseEvent('mousedown', {bubbles: true, cancelable: true}));
      await fixture.whenStable();
      expect(located()).toEqual([true]);
      await new Promise((resolve) => setTimeout(resolve, 1900));
      await fixture.whenStable();
      expect(located()).toEqual([]);
    });

    it('rien sans l’option, ni sans ligne à repérer', async () => {
      const without = await createTable({rowMarker: () => 'danger'});
      expect(marks(without.fixture)).toEqual([]);
      const nothing = await createTable({scrollMarkers: true});
      expect((nothing.fixture.nativeElement as HTMLElement).querySelector('.ngt-scroll-markers')).toBeNull();
    });
  });
});
