import {ComponentFixture} from '@angular/core/testing';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {NgTableComponent} from './ng-table.component';
import type {NgTableColumn, NgTableRangePasteEvent} from './ng-table.models';
import {columns, createTable, type Row, ROWS, setupNgTableSpec} from './ng-table.spec-helpers';

describe('NgTableComponent : édition et plages de cellules', () => {
  setupNgTableSpec();

  describe('sélection de plage et presse-papiers ([rangeSelection])', () => {
    // Colonnes visibles : nom (0), montant (1), statut (2), actif (3).
    const cell = (fixture: ComponentFixture<NgTableComponent>, row: number, columnId: string) =>
      (fixture.nativeElement as HTMLElement).querySelectorAll('tr.data-row')[row].querySelector(`td.cdk-column-${columnId}`) as HTMLTableCellElement;
    const mouse = (target: Element, type: string, init: MouseEventInit = {}) =>
      target.dispatchEvent(new MouseEvent(type, {bubbles: true, cancelable: true, button: 0, ...init}));
    const inRange = (fixture: ComponentFixture<NgTableComponent>) =>
      [...(fixture.nativeElement as HTMLElement).querySelectorAll('tr.data-row')].map((tr) =>
        [...tr.querySelectorAll('td[data-ngt-col]')].map((td) => (td.getAttribute('data-ngt-range')?.includes('in') ? 'x' : '.')).join(''),
      );
    const keydown = (target: Element, key: string, init: KeyboardEventInit = {}) =>
      target.dispatchEvent(new KeyboardEvent('keydown', {key, bubbles: true, cancelable: true, ...init}));
    const writeText = vi.fn().mockResolvedValue(undefined);

    beforeEach(() => {
      writeText.mockClear();
      Object.defineProperty(navigator, 'clipboard', {value: {writeText}, configurable: true});
    });
    afterEach(() => {
      Reflect.deleteProperty(navigator, 'clipboard');
    });

    it('glisser d’une cellule à une autre sélectionne le rectangle, avec son contour', async () => {
      const {fixture} = await createTable({rangeSelection: true});

      mouse(cell(fixture, 0, 'montant'), 'mousedown');
      mouse(cell(fixture, 1, 'actif'), 'mousemove');
      await fixture.whenStable();
      mouse(document.body, 'mouseup');

      expect(inRange(fixture)).toEqual(['.xxx', '.xxx', '....']);
      expect(cell(fixture, 0, 'montant').getAttribute('data-ngt-range')).toBe('in top left');
      expect(cell(fixture, 1, 'actif').getAttribute('data-ngt-range')).toBe('in right bottom');
      expect(cell(fixture, 0, 'statut').getAttribute('data-ngt-range')).toBe('in top');

      // Après le relâchement, le glissement est terminé : la plage ne bouge plus.
      mouse(cell(fixture, 2, 'nom'), 'mousemove');
      await fixture.whenStable();
      expect(inRange(fixture)).toEqual(['.xxx', '.xxx', '....']);
    });

    it('Maj+clic étend la plage depuis l’ancre ; un clic simple en démarre une autre', async () => {
      const {fixture} = await createTable({rangeSelection: true});

      mouse(cell(fixture, 0, 'nom'), 'mousedown');
      mouse(document.body, 'mouseup');
      mouse(cell(fixture, 2, 'statut'), 'mousedown', {shiftKey: true});
      mouse(document.body, 'mouseup');
      await fixture.whenStable();
      expect(inRange(fixture)).toEqual(['xxx.', 'xxx.', 'xxx.']);

      mouse(cell(fixture, 1, 'actif'), 'mousedown');
      mouse(document.body, 'mouseup');
      await fixture.whenStable();
      expect(inRange(fixture)).toEqual(['....', '...x', '....']);
    });

    it('les boutons des cellules, la colonne de sélection et les lignes épinglées ne démarrent pas de plage', async () => {
      const {fixture, component} = await createTable({rangeSelection: true, rowSelectionEnabled: true, pinnedTopRows: [{...ROWS[0], id: 'p'}]});

      mouse(cell(fixture, 1, 'nom').querySelector('button')!, 'mousedown'); // bouton « copier »
      mouse((fixture.nativeElement as HTMLElement).querySelector('td.selection-cell')!, 'mousedown');
      mouse(cell(fixture, 0, 'nom'), 'mousedown'); // ligne épinglée (index 0 du DOM)
      mouse(document.body, 'mouseup');
      await fixture.whenStable();

      expect(component.getSelectedRange()).toBeNull();
    });

    it('Ctrl+C copie la plage en texte tabulé ; avec [rangeCopyHeaders], en-têtes comprises', async () => {
      const {fixture, component} = await createTable({rangeSelection: true});
      const copied: unknown[] = [];
      component.rangeCopied.subscribe((e) => copied.push(e));
      mouse(cell(fixture, 0, 'nom'), 'mousedown');
      mouse(cell(fixture, 1, 'montant'), 'mousemove');
      mouse(document.body, 'mouseup');
      await fixture.whenStable();

      keydown(cell(fixture, 1, 'montant'), 'c', {ctrlKey: true});
      await Promise.resolve();
      await Promise.resolve();
      expect(writeText).toHaveBeenCalledWith('Charlie\t300\nalice\t100');
      expect(copied).toEqual([{text: 'Charlie\t300\nalice\t100', rowCount: 2, columnCount: 2}]);

      fixture.componentRef.setInput('rangeCopyHeaders', true);
      expect(component.getSelectedRange()!.text).toBe('Nom\tMontant\nCharlie\t300\nalice\t100');
    });

    it('Ctrl+C dans un bouton ou sans plage ne copie rien ; Ctrl+A sélectionne tout ; Échap efface', async () => {
      const {fixture} = await createTable({rangeSelection: true});
      mouse(cell(fixture, 0, 'montant'), 'mousedown');
      mouse(document.body, 'mouseup');

      keydown(cell(fixture, 0, 'nom').querySelector('button')!, 'c', {ctrlKey: true}); // focus dans le bouton « copier »
      await Promise.resolve();
      expect(writeText).not.toHaveBeenCalled();

      keydown(cell(fixture, 0, 'montant'), 'a', {ctrlKey: true});
      await fixture.whenStable();
      expect(inRange(fixture)).toEqual(['xxxx', 'xxxx', 'xxxx']);

      keydown(cell(fixture, 0, 'montant'), 'Escape');
      await fixture.whenStable();
      expect(inRange(fixture)).toEqual(['....', '....', '....']);
    });

    it('Ctrl+V émet les cellules cibles à partir du haut à gauche, sans modifier les données', async () => {
      const {fixture, component} = await createTable({rangeSelection: true});
      const pastes: NgTableRangePasteEvent<Row>[] = [];
      component.rangePasted.subscribe((e) => pastes.push(e));
      mouse(cell(fixture, 1, 'montant'), 'mousedown');
      mouse(document.body, 'mouseup');

      const event = new Event('paste', {bubbles: true, cancelable: true});
      Object.defineProperty(event, 'clipboardData', {value: {getData: () => '10\tA\r\n20\tB\r\n30\tC\r\n'}});
      cell(fixture, 1, 'montant').dispatchEvent(event);

      expect(event.defaultPrevented).toBe(true);
      expect(pastes[0].values).toEqual([['10', 'A'], ['20', 'B'], ['30', 'C']]);
      // Ligne 1 + 2 lignes collées : la 3e dépasse la grille (3 lignes) et est écartée.
      expect(pastes[0].assignments.map((a) => `${a.row.id}/${a.column.id}=${a.value}`)).toEqual([
        '2/montant=10', '2/statut=A', '3/montant=20', '3/statut=B',
      ]);
      expect(component.displayedRows()[1].montant).toBe(100); // inchangé
    });

    it('une valeur unique collée remplit toute la plage', async () => {
      const {fixture, component} = await createTable({rangeSelection: true});
      mouse(cell(fixture, 0, 'montant'), 'mousedown');
      mouse(cell(fixture, 1, 'montant'), 'mousemove');
      mouse(document.body, 'mouseup');
      const pastes: NgTableRangePasteEvent<Row>[] = [];
      component.rangePasted.subscribe((e) => pastes.push(e));

      component.pasteIntoRange('0');

      expect(pastes[0].assignments.map((a) => `${a.row.id}=${a.value}`)).toEqual(['1=0', '2=0']);
    });

    it('la plage disparaît au tri, au filtre ou au changement de page, mais survit aux transactions', async () => {
      const {fixture, component} = await createTable({rangeSelection: true});
      mouse(cell(fixture, 0, 'nom'), 'mousedown');
      mouse(document.body, 'mouseup');

      component.applyTransaction({update: [{...ROWS[0], montant: 999}]});
      await fixture.whenStable();
      expect(component.getSelectedRange()?.rows).toHaveLength(1);

      component.sorting.onHeaderSort(component.columns()[1]);
      await fixture.whenStable();
      expect(component.getSelectedRange()).toBeNull();
    });

    it('Maj+flèches étendent la plage avec [cellNavigation] ; une flèche seule la réduit à la cellule atteinte', async () => {
      const {fixture, component} = await createTable({rangeSelection: true, cellNavigation: true});
      const start = cell(fixture, 0, 'nom');
      start.focus();
      mouse(start, 'mousedown');
      mouse(document.body, 'mouseup');

      keydown(start, 'ArrowDown', {shiftKey: true});
      keydown(cell(fixture, 1, 'nom'), 'ArrowRight', {shiftKey: true});
      await fixture.whenStable();
      expect(inRange(fixture)).toEqual(['xx..', 'xx..', '....']);
      expect(cell(fixture, 0, 'nom').getAttribute('aria-selected')).toBe('true');

      keydown(cell(fixture, 1, 'montant'), 'ArrowDown');
      await fixture.whenStable();
      expect(inRange(fixture)).toEqual(['....', '....', '.x..']);
      expect(component.getSelectedRange()!.rows.map((r) => r.id)).toEqual(['3']);
    });
  });

  describe('édition de cellules', () => {
    const editableColumns = (): NgTableColumn<Row>[] =>
      columns().map((column) => {
        const setters: Record<string, (r: Row, v: unknown) => Row> = {
          nom: (r, v) => ({...r, nom: v as string}),
          montant: (r, v) => ({...r, montant: v as number}),
          actif: (r, v) => ({...r, actif: v as boolean}),
        };
        if (column.id === 'montant') {
          return {
            ...column,
            editable: true,
            editor: 'number' as const,
            valueSetter: setters['montant'],
            validate: (v) => ((v as number) < 0 ? 'Négatif interdit' : null),
          };
        }
        return setters[column.id] ? {...column, editable: true, valueSetter: setters[column.id]} : column;
      });
    const cell = (fixture: ComponentFixture<NgTableComponent>, row: number, columnId: string) =>
      (fixture.nativeElement as HTMLElement).querySelectorAll('tr.data-row')[row].querySelector(`td.cdk-column-${columnId}`) as HTMLTableCellElement;
    const editor = (fixture: ComponentFixture<NgTableComponent>) =>
      (fixture.nativeElement as HTMLElement).querySelector('.ngt-editor') as HTMLInputElement | null;
    const type = async (fixture: ComponentFixture<NgTableComponent>, value: string) => {
      const input = editor(fixture)!;
      input.value = value;
      input.dispatchEvent(new Event('input', {bubbles: true}));
      await fixture.whenStable();
    };
    const press = async (fixture: ComponentFixture<NgTableComponent>, target: Element, key: string, init: KeyboardEventInit = {}) => {
      target.dispatchEvent(new KeyboardEvent('keydown', {key, bubbles: true, cancelable: true, ...init}));
      await fixture.whenStable();
    };
    const dbl = async (fixture: ComponentFixture<NgTableComponent>, target: Element) => {
      target.dispatchEvent(new MouseEvent('dblclick', {bubbles: true, cancelable: true}));
      await fixture.whenStable();
    };

    it('un double-clic ouvre l’éditeur, Entrée valide : la ligne est remplacée et (cellEdited) émis', async () => {
      const {fixture, component} = await createTable({columns: editableColumns()});
      const edits: unknown[] = [];
      component.cellEdited.subscribe((e) => edits.push(e));

      await dbl(fixture, cell(fixture, 1, 'montant'));
      expect(editor(fixture)?.value).toBe('100');
      await type(fixture, '150,5');
      await press(fixture, editor(fixture)!, 'Enter');

      expect(editor(fixture)).toBeNull();
      expect(component.displayedRows()[1].montant).toBe(150.5);
      expect(edits).toHaveLength(1);
      expect(edits[0]).toMatchObject({oldValue: 100, newValue: 150.5, source: 'edit'});
    });

    it('Échap abandonne ; une colonne non éditable ne s’ouvre pas', async () => {
      const {fixture, component} = await createTable({columns: editableColumns()});
      await dbl(fixture, cell(fixture, 0, 'statut'));
      expect(editor(fixture)).toBeNull();

      await dbl(fixture, cell(fixture, 0, 'montant'));
      await type(fixture, '999');
      await press(fixture, editor(fixture)!, 'Escape');
      expect(editor(fixture)).toBeNull();
      expect(component.displayedRows()[0].montant).toBe(300);
    });

    it('une saisie invalide reste ouverte avec son message, puis (cellEditRejected)', async () => {
      const {fixture, component} = await createTable({columns: editableColumns()});
      const rejected: string[] = [];
      component.cellEditRejected.subscribe((e) => rejected.push(e.error));

      await dbl(fixture, cell(fixture, 0, 'montant'));
      await type(fixture, 'abc');
      await press(fixture, editor(fixture)!, 'Enter');
      expect(editor(fixture)?.getAttribute('aria-invalid')).toBe('true');
      expect((fixture.nativeElement as HTMLElement).querySelector('.ngt-editor-error')?.textContent).toContain('Nombre invalide');

      await type(fixture, '-5');
      await press(fixture, editor(fixture)!, 'Enter');
      expect((fixture.nativeElement as HTMLElement).querySelector('.ngt-editor-error')?.textContent).toContain('Négatif interdit');
      expect(rejected).toEqual(['Nombre invalide', 'Négatif interdit']);
      expect(component.displayedRows()[0].montant).toBe(300);
    });

    it('taper un caractère sur une cellule (avec [cellNavigation]) ouvre l’éditeur avec ce caractère', async () => {
      const {fixture} = await createTable({columns: editableColumns(), cellNavigation: true});
      await press(fixture, cell(fixture, 0, 'nom'), 'x');
      expect(editor(fixture)?.value).toBe('x');
    });

    it('Ctrl+Z défait, Ctrl+Y rétablit', async () => {
      const {fixture, component} = await createTable({columns: editableColumns()});
      await dbl(fixture, cell(fixture, 0, 'montant'));
      await type(fixture, '1');
      await press(fixture, editor(fixture)!, 'Enter');
      expect(component.canUndo()).toBe(true);

      await press(fixture, cell(fixture, 0, 'montant'), 'z', {ctrlKey: true});
      expect(component.displayedRows()[0].montant).toBe(300);
      expect(component.canRedo()).toBe(true);

      await press(fixture, cell(fixture, 0, 'montant'), 'y', {ctrlKey: true});
      expect(component.displayedRows()[0].montant).toBe(1);
    });

    it('la case à cocher éditable bascule la valeur d’un clic', async () => {
      const {fixture, component} = await createTable({columns: editableColumns()});
      const box = cell(fixture, 1, 'actif').querySelector('input.ngt-inline-check') as HTMLInputElement;
      box.checked = true;
      box.dispatchEvent(new Event('change', {bubbles: true}));
      await fixture.whenStable();
      expect(component.displayedRows()[1].actif).toBe(true);
    });

    it('un collage sur une plage écrit les cellules éditables, en un seul lot annulable', async () => {
      const {fixture, component} = await createTable({columns: editableColumns(), rangeSelection: true});
      const pastes: NgTableRangePasteEvent<Row>[] = [];
      component.rangePasted.subscribe((e) => pastes.push(e));
      cell(fixture, 0, 'nom').dispatchEvent(new MouseEvent('mousedown', {bubbles: true, button: 0}));
      document.body.dispatchEvent(new MouseEvent('mouseup', {bubbles: true}));

      component.pasteIntoRange('Zoé\t10\nYan\t20');
      await fixture.whenStable();

      expect(pastes[0].applied).toBe(4);
      expect(component.displayedRows().map((r) => `${r.nom}/${r.montant}`)).toEqual(['Zoé/10', 'Yan/20', 'Bob/200']);

      component.undo();
      await fixture.whenStable();
      expect(component.displayedRows().map((r) => `${r.nom}/${r.montant}`)).toEqual(['Charlie/300', 'alice/100', 'Bob/200']);
    });

    describe('poignée de recopie ([fillHandle])', () => {
      const montants = (component: NgTableComponent) => component.displayedRows().map((r) => r.montant);
      const select = (fixture: ComponentFixture<NgTableComponent>, from: number, to: number) => {
        cell(fixture, from, 'montant').dispatchEvent(new MouseEvent('mousedown', {bubbles: true, button: 0}));
        if (to !== from) {
          cell(fixture, to, 'montant').dispatchEvent(new MouseEvent('mousemove', {bubbles: true}));
        }
        document.body.dispatchEvent(new MouseEvent('mouseup', {bubbles: true}));
      };
      const handle = (fixture: ComponentFixture<NgTableComponent>) => (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('.ngt-fill-handle');

      it('tirer la poignée recopie la valeur vers le bas, en un lot annulable', async () => {
        const {fixture, component} = await createTable({columns: editableColumns(), rangeSelection: true, fillHandle: true});
        const sources: string[] = [];
        component.cellEdited.subscribe((event) => sources.push(event.source));
        select(fixture, 0, 0);
        await fixture.whenStable();
        expect(handle(fixture)?.closest('td')).toBe(cell(fixture, 0, 'montant'));

        handle(fixture)!.dispatchEvent(new MouseEvent('mousedown', {bubbles: true, button: 0}));
        cell(fixture, 2, 'montant').dispatchEvent(new MouseEvent('mousemove', {bubbles: true}));
        await fixture.whenStable();
        // Aperçu : les deux cellules sous la source seront remplies.
        expect((fixture.nativeElement as HTMLElement).querySelectorAll('td[data-ngt-fill]')).toHaveLength(2);
        document.body.dispatchEvent(new MouseEvent('mouseup', {bubbles: true}));
        await fixture.whenStable();

        expect(montants(component)).toEqual([300, 300, 300]);
        expect(sources).toEqual(['fill', 'fill']);
        expect((fixture.nativeElement as HTMLElement).querySelectorAll('td[data-ngt-fill]')).toHaveLength(0);
        // La sélection couvre maintenant toute la zone remplie, et la poignée a suivi.
        expect(component.getSelectedRange()?.rows).toHaveLength(3);
        expect(handle(fixture)?.closest('td')).toBe(cell(fixture, 2, 'montant'));

        component.undo();
        await fixture.whenStable();
        expect(montants(component)).toEqual([300, 100, 200]);
      });

      it('deux nombres : la suite est prolongée, ici vers le haut', async () => {
        const {fixture, component} = await createTable({columns: editableColumns(), rangeSelection: true, fillHandle: true});
        select(fixture, 1, 2); // 100, 200 : pas de 100
        await fixture.whenStable();
        handle(fixture)!.dispatchEvent(new MouseEvent('mousedown', {bubbles: true, button: 0}));
        cell(fixture, 0, 'montant').dispatchEvent(new MouseEvent('mousemove', {bubbles: true}));
        document.body.dispatchEvent(new MouseEvent('mouseup', {bubbles: true}));
        await fixture.whenStable();
        expect(montants(component), 'vers le haut : 100 − 100').toEqual([0, 100, 200]);
      });

      it('au clavier : Ctrl+D recopie la première ligne de la plage vers le bas', async () => {
        const {fixture, component} = await createTable({columns: editableColumns(), rangeSelection: true, fillHandle: true});
        select(fixture, 0, 2);
        await fixture.whenStable();
        const first = cell(fixture, 0, 'montant');
        first.dispatchEvent(new KeyboardEvent('keydown', {key: 'd', ctrlKey: true, bubbles: true, cancelable: true}));
        await fixture.whenStable();
        expect(montants(component)).toEqual([300, 300, 300]);
      });

      it('pas de poignée sans [fillHandle]', async () => {
        const {fixture} = await createTable({columns: editableColumns(), rangeSelection: true});
        select(fixture, 0, 0);
        await fixture.whenStable();
        expect(handle(fixture)).toBeNull();
      });
    });

    it('[editOnPaste]="false" laisse le collage à l’application', async () => {
      const {fixture, component} = await createTable({columns: editableColumns(), rangeSelection: true, editOnPaste: false});
      cell(fixture, 0, 'nom').dispatchEvent(new MouseEvent('mousedown', {bubbles: true, button: 0}));
      document.body.dispatchEvent(new MouseEvent('mouseup', {bubbles: true}));
      component.pasteIntoRange('Zoé');
      await fixture.whenStable();
      expect(component.displayedRows()[0].nom).toBe('Charlie');
    });
  });

  describe('copie de cellule', () => {
    it('copie la valeur et publie l’événement', async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'clipboard', {value: {writeText}, configurable: true});
      const {component} = await createTable();
      const copied: unknown[] = [];
      component.cellCopied.subscribe((e) => copied.push(e));

      component.cellCopy.onCopyCellValue(
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

      expect(component.render.cellView(ROWS[0], component.columns()[0]).copyText).not.toBe('');
      expect(component.render.cellView(ROWS[0], component.columns()[1]).copyText).toBe('');
    });
  });
});
