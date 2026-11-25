import {TrackByFunction} from '@angular/core';
import {ComponentFixture} from '@angular/core/testing';
import {NgTableCheckboxChange} from './ng-table-checkbox.component';
import {describe, expect, it} from 'vitest';
import {NgTableComponent} from './ng-table.component';
import type {NgTableRowMoveEvent} from './ng-table.models';
import {createTable, type Row, ROWS, setupNgTableSpec} from './ng-table.spec-helpers';

describe('NgTableComponent : lignes', () => {
  setupNgTableSpec();

  describe('sélection de lignes', () => {
    it('sélectionne une ligne et publie les lignes sélectionnées', async () => {
      const {component} = await createTable({rowSelectionEnabled: true, rowKeyAccessor: (r: Row) => r.id});
      const events: unknown[] = [];
      component.selectionChange.subscribe((e) => events.push(e));

      component.selection.onToggleRowSelection({checked: true} as NgTableCheckboxChange, ROWS[1]);

      expect(component.isRowSelected(ROWS[1])).toBe(true);
      expect(component.selectedRowsCount()).toBe(1);
      expect(events).toHaveLength(1);
      expect((events[0] as { selectedRows: Row[] }).selectedRows).toEqual([ROWS[1]]);
    });

    it('sélectionne / désélectionne toutes les lignes affichées', async () => {
      const {component} = await createTable({rowSelectionEnabled: true, rowKeyAccessor: (r: Row) => r.id});

      component.selection.onToggleAllDisplayedRows({checked: true} as NgTableCheckboxChange);
      expect(component.selection.areAllDisplayedRowsSelected()).toBe(true);

      component.selection.onToggleAllDisplayedRows({checked: false} as NgTableCheckboxChange);
      expect(component.selectedRowsCount()).toBe(0);
    });

    it('signale une sélection partielle', async () => {
      const {component} = await createTable({rowSelectionEnabled: true, rowKeyAccessor: (r: Row) => r.id});

      component.selection.onToggleRowSelection({checked: true} as NgTableCheckboxChange, ROWS[0]);

      expect(component.selection.hasPartiallySelectedDisplayedRows()).toBe(true);
      expect(component.selection.areAllDisplayedRowsSelected()).toBe(false);
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
      component.selection.onToggleRowSelection({checked: true} as NgTableCheckboxChange, targetRow);
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

      component.selection.onToggleRowSelection({checked: true} as NgTableCheckboxChange, ROWS[0]);

      expect(component.isRowSelected(ROWS[0])).toBe(true);
      expect(component.isRowSelected(ROWS[1])).toBe(false);
    });
  });

  describe('déplacer une ligne sans glisser', () => {
    it('un clic sur une poignée saisit la ligne, un clic sur une autre l’y dépose ; un second clic sur la même annule', async () => {
      const {fixture, component} = await createTable({rowDrag: true});
      const handles = () => [...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('.ngt-row-handle')];
      const ids = () => (component.displayedRows() as Row[]).map((row) => row.id);
      expect(ids()).toEqual(['1', '2', '3']);

      handles()[0].click();
      await fixture.whenStable();
      expect(handles()[0].getAttribute('aria-pressed')).toBe('true');
      handles()[0].click(); // même poignée : annulé
      await fixture.whenStable();
      expect(handles()[0].getAttribute('aria-pressed')).toBe('false');
      expect(ids()).toEqual(['1', '2', '3']);

      handles()[0].click();
      await fixture.whenStable();
      const moves: NgTableRowMoveEvent<Row>[] = [];
      component.rowMoved.subscribe((event) => moves.push(event as NgTableRowMoveEvent<Row>));
      handles()[2].click(); // dépose la ligne 1 après la ligne 3 : même événement qu'un glisser-déposer
      await fixture.whenStable();
      expect(moves.map((move) => `${move.position}:${move.rows.map((row) => row.id).join(',')}`)).toEqual(['after:2,3,1']);
      expect(handles().map((handle) => handle.getAttribute('aria-pressed'))).toEqual(['false', 'false', 'false']);
    });
  });

  describe('glisser-déposer de lignes ([rowDrag])', () => {
    const el = (fixture: ComponentFixture<NgTableComponent>) => fixture.nativeElement as HTMLElement;
    const rowEl = (fixture: ComponentFixture<NgTableComponent>, index: number) => el(fixture).querySelectorAll('tr.data-row')[index] as HTMLElement;
    const drag = (target: Element, type: string, clientY = 0) => {
      const event = new Event(type, {bubbles: true, cancelable: true}) as DragEvent;
      Object.defineProperties(event, {
        clientY: {value: clientY},
        dataTransfer: {value: {setData: () => undefined, setDragImage: () => undefined, effectAllowed: '', dropEffect: ''}},
      });
      target.dispatchEvent(event);
      return event;
    };

    it('affiche une poignée par ligne seulement avec [rowDrag]', async () => {
      const {fixture, setInput} = await createTable();
      expect(el(fixture).querySelector('.ngt-row-handle')).toBeNull();
      await setInput('rowDrag', true);
      expect(el(fixture).querySelectorAll('.ngt-row-handle')).toHaveLength(3);
    });

    it('déposer une ligne émet (rowMoved) avec le nouvel ordre complet', async () => {
      const {fixture, component} = await createTable({rowDrag: true});
      const moves: NgTableRowMoveEvent<Row>[] = [];
      component.rowMoved.subscribe((e) => moves.push(e));

      drag(rowEl(fixture, 2).querySelector('.ngt-row-handle')!, 'dragstart');
      const target = rowEl(fixture, 0);
      target.getBoundingClientRect = () => ({top: 100, height: 40}) as DOMRect;
      drag(target, 'dragover', 105); // moitié haute : avant
      await fixture.whenStable();
      expect(target.getAttribute('data-ngt-drop')).toBe('before');
      drag(target, 'drop', 105);
      await fixture.whenStable();

      expect(moves).toHaveLength(1);
      expect(moves[0].rows.map((r) => r.id)).toEqual(['3', '1', '2']);
      expect(moves[0]).toMatchObject({fromIndex: 2, toIndex: 0, position: 'before'});
      expect(target.getAttribute('data-ngt-drop')).toBeNull();
    });

    it('Alt + flèche sur la poignée déplace la ligne d’un cran', async () => {
      const {fixture, component} = await createTable({rowDrag: true});
      const moves: NgTableRowMoveEvent<Row>[] = [];
      component.rowMoved.subscribe((e) => moves.push(e));

      rowEl(fixture, 1).querySelector('.ngt-row-handle')!.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowDown', altKey: true, bubbles: true, cancelable: true}));
      expect(moves[0].rows.map((r) => r.id)).toEqual(['1', '3', '2']);

      rowEl(fixture, 0).querySelector('.ngt-row-handle')!.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowUp', altKey: true, bubbles: true, cancelable: true}));
      expect(moves).toHaveLength(1); // déjà en tête : rien à faire
    });

    it('est inactif avec un tri ou un regroupement : la poignée disparaît', async () => {
      const {fixture, component, setInput} = await createTable({rowDrag: true});
      component.sorting.onHeaderSort(component.columns()[1]);
      await fixture.whenStable();
      expect(el(fixture).querySelector('.ngt-row-handle')).toBeNull();

      await setInput('rowDrag', false);
      expect(component.moveRow(ROWS[2], ROWS[0], 'before')).toBe(true);
    });
  });
});
