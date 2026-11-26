import {describe, expect, it} from 'vitest';
import type {NgTableColumn} from './ng-table.models';
import {columns, createTable, type Row, setupNgTableSpec} from './ng-table.spec-helpers';

describe('NgTableComponent : colonnes', () => {
  setupNgTableSpec();

  describe('visibilité et ordre des colonnes', () => {
    it('colonne de référence : la choisir la fixe à gauche en premier, à la place des pinned déclarés', async () => {
      const cols = columns();
      cols[0] = {...cols[0], pinned: 'left'}; // "nom" fixée par défaut
      const {component} = await createTable({columns: cols, referenceColumnSelectable: true});
      const emitted: unknown[] = [];
      component.referenceColumn.subscribe((id) => emitted.push(id));
      const [nom, montant] = component.columns();
      expect(component.columnLayout.isReferenceColumn(nom)).toBe(true);

      component.columnLayout.toggleReferenceColumn(montant);

      expect(component.visibleColumns().map((c) => c.id)[0]).toBe('montant');
      expect(component.columnLayout.pinnedSide(montant)).toBe('left');
      expect(component.columnLayout.pinnedSide(nom)).toBeUndefined();
      expect(emitted).toEqual(['montant']);

      component.columnLayout.toggleReferenceColumn(montant); // la libérer : plus aucune colonne fixée à gauche
      expect(component.referenceColumn()).toBeNull();
      expect(component.columnLayout.pinnedSide(nom)).toBeUndefined();
      expect(component.columnLayout.hasLeftPinnedColumns()).toBe(false);
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

      component.columnLayout.onToggleColumnVisibility('montant', false);

      expect(component.columnLayout.displayedColumnIds()).toEqual(['nom', 'statut', 'actif']);
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

      expect(component.columnLayout.displayedColumnIds()).toEqual(['nom', 'statut']);
    });

    it('affiche le bouton "Colonnes" par défaut, et le masque via columnsMenuEnabled=false', async () => {
      const {fixture: withDefault} = await createTable();
      expect(withDefault.nativeElement.textContent).toContain('Colonnes');

      const {fixture: withoutButton} = await createTable({columnsMenuEnabled: false});
      expect(withoutButton.nativeElement.textContent).not.toContain('Colonnes');
    });

    it('columnsMenuEnabled=false ne touche pas au fonctionnement sous-jacent de la visibilité', async () => {
      const {component} = await createTable({columnsMenuEnabled: false});

      component.columnLayout.onToggleColumnVisibility('montant', false);

      expect(component.columnLayout.displayedColumnIds()).toEqual(['nom', 'statut', 'actif']);
    });

    it('réordonne les colonnes au drop et notifie le nouvel ordre', async () => {
      const emitted: string[][] = [];
      const {component} = await createTable();
      component.columnOrderChange.subscribe((o) => emitted.push(o));
      const dragEvent = {preventDefault: () => undefined, dataTransfer: null} as unknown as DragEvent;

      component.columnMove.onColumnDragStart(dragEvent, component.columns()[3]); // `actif`
      component.columnMove.onColumnDrop(dragEvent, component.columns()[0]); // déposé sur `nom`

      expect(emitted.at(-1)).toEqual(['actif', 'nom', 'montant', 'statut']);
      expect(component.columnLayout.displayedColumnIds()).toEqual(['actif', 'nom', 'montant', 'statut']);
    });

    it('ignore un drop sur la colonne d’origine', async () => {
      const emitted: string[][] = [];
      const {component} = await createTable();
      component.columnOrderChange.subscribe((o) => emitted.push(o));
      const dragEvent = {preventDefault: () => undefined, dataTransfer: null} as unknown as DragEvent;

      component.columnMove.onColumnDragStart(dragEvent, component.columns()[0]);
      component.columnMove.onColumnDrop(dragEvent, component.columns()[0]);

      expect(emitted).toEqual([]);
    });

    it("ne refiltre/retrie pas les lignes quand seul l'ordre des colonnes change (perf)", async () => {
      const {component} = await createTable();
      // Emprunte le pipeline filtre + tri de `filteredSortedRows` avant de réordonner.
      component.filtering.onFilterValue('statut', 'VALIDEE');
      component.sorting.onHeaderSort(component.columns()[0]);
      const before = component.displayedRows();

      const dragEvent = {preventDefault: () => undefined, dataTransfer: null} as unknown as DragEvent;
      component.columnMove.onColumnDragStart(dragEvent, component.columns()[3]); // `actif`
      component.columnMove.onColumnDrop(dragEvent, component.columns()[0]); // déposé sur `nom`

      // Même référence : `filteredSortedRows` (dépend de `visibleColumnsUnordered`,
      // pas `visibleColumns`) n'a pas été recalculé — seul l'ordre d'affichage
      // des colonnes doit changer, jamais le contenu/tri des lignes.
      expect(component.displayedRows()).toBe(before);
      expect(component.columnLayout.displayedColumnIds()).toEqual(['actif', 'nom', 'montant', 'statut']);
    });
  });

  describe('redimensionnement des colonnes', () => {
    it('ne laisse pas le tableau descendre sous la somme des largeurs mini des colonnes', async () => {
      const cols = columns().map((column) => ({...column}));
      cols[0].widthPx = 300;
      const {component, fixture} = await createTable({columns: cols, minTableWidthPx: 400, rowSelectionEnabled: true});

      // 300 (largeur fixée) + 3 colonnes × 120 (largeur mini par défaut) + 48 (cases à cocher)
      expect(component.columnLayout.tableMinWidthPx()).toBe(708);
      expect((fixture.nativeElement.querySelector('table.ng-table') as HTMLElement).style.minWidth).toBe('708px');

      fixture.componentRef.setInput('minTableWidthPx', 2000);
      expect(component.columnLayout.tableMinWidthPx()).toBe(2000);
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

      component.columnResize.onResizeStart(mouseEvent(), column);

      component.columnResize.onResizeMove({clientX: 500} as MouseEvent);
      expect(component.columnLayout.columnWidthPx(column)).toBe(300);

      component.columnResize.onResizeMove({clientX: -500} as MouseEvent);
      expect(component.columnLayout.columnWidthPx(column)).toBe(100);

      component.columnResize.stopResize();
    });

    it('ignore le double-clic pendant le drag (il déclenche l’auto-fit)', async () => {
      const {component} = await createTable({columns: resizableColumns()});
      const column = component.columns()[0];

      component.columnResize.onResizeStart(mouseEvent({detail: 2}), column);
      component.columnResize.onResizeMove({clientX: 500} as MouseEvent);

      expect(component.columnLayout.columnWidthPx(column)).toBe(200); // largeur d'origine inchangée
    });

    it('ne redimensionne pas une colonne non redimensionnable', async () => {
      const {component} = await createTable();
      const column = component.columns()[0]; // `resizable` non défini

      component.columnResize.onResizeStart(mouseEvent(), column);
      component.columnResize.onResizeMove({clientX: 500} as MouseEvent);

      expect(component.columnLayout.columnWidthPx(column)).toBeNull();
    });

    it('ne descend jamais sous minWidthPx en auto-fit', async () => {
      const {component} = await createTable({columns: resizableColumns()});
      const column = component.columns()[0];

      component.columnResize.onResizeAutoFit(mouseEvent(), column);

      expect(component.columnLayout.columnWidthPx(column)).toBe(100);
    });

    it('restaure les styles inline après la mesure d’auto-fit', async () => {
      const {component, fixture} = await createTable({columns: resizableColumns()});
      // `measureNaturalWidth` cible en priorité `.header-button` dans l'en-tête
      const measured = fixture.nativeElement.querySelector('.cdk-column-nom .header-button') as HTMLElement | null;
      expect(measured).not.toBeNull();

      component.columnResize.onResizeAutoFit(mouseEvent(), component.columns()[0]);

      // la mesure dé-contraint temporairement le nœud : rien ne doit rester appliqué
      expect(measured?.style.width ?? '').toBe('');
      expect(measured?.style.maxWidth ?? '').toBe('');
      expect(measured?.style.whiteSpace ?? '').toBe('');
    });

    it('redimensionne au clavier (flèches gauche/droite) sur la poignée', async () => {
      const {component, fixture} = await createTable({columns: resizableColumns()});
      const column = component.columns()[0];
      const handle = fixture.nativeElement.querySelector('.resize-handle') as HTMLElement;

      component.columnResize.onResizeHandleKeydown(
        {key: 'ArrowRight', target: handle, preventDefault: () => undefined} as unknown as KeyboardEvent,
        column,
      );
      expect(component.columnLayout.columnWidthPx(column)).toBe(216); // 200 + le pas de 16px

      component.columnResize.onResizeHandleKeydown(
        {key: 'ArrowLeft', target: handle, preventDefault: () => undefined} as unknown as KeyboardEvent,
        column,
      );
      component.columnResize.onResizeHandleKeydown(
        {key: 'ArrowLeft', target: handle, preventDefault: () => undefined} as unknown as KeyboardEvent,
        column,
      );
      expect(component.columnLayout.columnWidthPx(column)).toBe(200 - 16);
    });

    it('ignore les touches autres que les flèches, et une colonne non redimensionnable', async () => {
      const {component} = await createTable({columns: resizableColumns()});
      const column = component.columns()[0];
      const nonResizable = columns()[1];

      component.columnResize.onResizeHandleKeydown({key: 'a', target: null} as unknown as KeyboardEvent, column);
      expect(component.columnLayout.columnWidthPx(column)).toBe(200);

      // Début et Fin vont aux butées (équivalents clavier, avec Entrée pour ajuster au contenu).
      const press = (key: string) => component.columnResize.onResizeHandleKeydown({key, target: null, preventDefault: () => undefined} as unknown as KeyboardEvent, column);
      press('End');
      expect(component.columnLayout.columnWidthPx(column)).toBe(column.maxWidthPx ?? 620);
      press('Home');
      expect(component.columnLayout.columnWidthPx(column)).toBe(column.minWidthPx ?? 80);

      component.columnResize.onResizeHandleKeydown(
        {key: 'ArrowRight', target: null, preventDefault: () => undefined} as unknown as KeyboardEvent,
        nonResizable,
      );
      expect(component.columnLayout.columnWidthPx(nonResizable)).toBeNull();
    });
  });
});
