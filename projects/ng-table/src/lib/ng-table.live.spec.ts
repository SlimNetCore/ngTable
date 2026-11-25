import {NgTableCheckboxChange} from './ng-table-checkbox.component';
import {describe, expect, it, vi} from 'vitest';
import {NgTableComponent} from './ng-table.component';
import type {NgTableSelectionChangeEvent} from './ng-table.models';
import {NG_TABLE_DEFAULT_LABELS} from './ng-table-labels';
import {columns, createTable, ids, type Row, ROWS, setupNgTableSpec} from './ng-table.spec-helpers';

describe('NgTableComponent : mises à jour en direct', () => {
  setupNgTableSpec();

  describe('mode live (transactions, surbrillance)', () => {
    const montantDesc = async (component: NgTableComponent) => {
      component.sorting.onHeaderSort(component.columns()[1]);
      component.sorting.onHeaderSort(component.columns()[1]); // montant décroissant
    };

    it('applyTransaction : ajoute, met à jour et retire, en gardant filtres et tri', async () => {
      const {component} = await createTable();
      await montantDesc(component);
      component.filtering.onFilterValue('actif', 'true'); // garde 1 (300) et 3 (200)
      expect(ids(component.displayedRows())).toEqual(['1', '3']);

      const result = component.applyTransaction({
        update: [{...ROWS[2], montant: 900}],
        add: [{id: '4', nom: 'Dan', montant: 250, statut: 'VALIDEE', actif: true, date: '2026-04-01'}],
        remove: [{id: '1'} as Row],
      });

      expect(result.update.map((r) => r.id)).toEqual(['3']);
      expect(result.remove.map((r) => r.id)).toEqual(['1']);
      expect(ids(component.displayedRows())).toEqual(['3', '4']);
    });

    it('une ligne mise à jour qui ne passe plus le filtre disparaît, et réapparaît', async () => {
      const {component} = await createTable();
      component.filtering.onFilterValue('actif', 'true');

      component.applyTransaction({update: [{...ROWS[0], actif: false}]});
      expect(ids(component.displayedRows())).toEqual(['3']);

      component.applyTransaction({update: [{...ROWS[0], actif: true}]});
      expect(ids(component.displayedRows())).toEqual(['1', '3']);
    });

    it('un nouveau tableau [rows] n’est traité que pour les lignes changées (fusion, pas de recalcul)', async () => {
      const {component, setInput} = await createTable();
      await montantDesc(component);
      component.displayedRows();
      const before = {...component.data.pipeline.stats};

      await setInput('rows', [ROWS[0], {...ROWS[1], montant: 999}, ROWS[2]]);

      expect(ids(component.displayedRows())).toEqual(['2', '1', '3']);
      expect(component.data.pipeline.stats.merges).toBe(before.merges + 1);
      expect(component.data.pipeline.stats.rebuilds).toBe(before.rebuilds);
    });

    it('applyTransactionAsync : regroupe les transactions en un seul passage', async () => {
      const {component} = await createTable({asyncTransactionWaitMillis: 50});
      vi.useFakeTimers();
      const flushed: unknown[] = [];
      component.asyncTransactionsFlushed.subscribe((results) => flushed.push(results));
      const callback = vi.fn();

      component.applyTransactionAsync({update: [{...ROWS[0], nom: 'Charles'}]}, callback);
      component.applyTransactionAsync({remove: [{id: '2'} as Row]});
      expect(component.displayedRows()).toHaveLength(3); // rien d'appliqué avant le délai

      vi.advanceTimersByTime(50);
      expect(ids(component.displayedRows())).toEqual(['1', '3']);
      expect(component.displayedRows()[0].nom).toBe('Charles');
      expect(callback).toHaveBeenCalledOnce();
      expect(flushed).toHaveLength(1);
    });

    it('surligne les cellules modifiées, vert à la hausse, rouge à la baisse, et redémarre l’animation', async () => {
      const {component, fixture} = await createTable({flashCells: true});
      const cell = (rowId: string, column: string) =>
        [...(fixture.nativeElement as HTMLElement).querySelectorAll('tr.data-row')]
          .find((tr) => tr.textContent?.includes(ROWS.find((r) => r.id === rowId)!.nom))!
          .querySelector(`td.cdk-column-${column}`)!;

      component.applyTransaction({update: [{...ROWS[0], montant: 350}, {...ROWS[1], montant: 50}]});
      await fixture.whenStable();
      expect(cell('1', 'montant').getAttribute('data-ngt-flash')).toBe('up-0');
      expect(cell('2', 'montant').getAttribute('data-ngt-flash')).toBe('down-0');
      expect(cell('1', 'nom').hasAttribute('data-ngt-flash')).toBe(false); // valeur inchangée

      component.applyTransaction({update: [{...ROWS[0], montant: 400}]});
      await fixture.whenStable();
      expect(cell('1', 'montant').getAttribute('data-ngt-flash')).toBe('up-1'); // nouvelle valeur : l'animation repart
    });

    it('sans [flashCells], aucune surbrillance ; flashOnChange l’active colonne par colonne', async () => {
      const cols = columns();
      cols[1] = {...cols[1], flashOnChange: true};
      const {component, fixture} = await createTable({columns: cols});

      component.applyTransaction({update: [{...ROWS[0], montant: 1, nom: 'Zoé'}]});
      await fixture.whenStable();

      const flashed = [...(fixture.nativeElement as HTMLElement).querySelectorAll('td[data-ngt-flash]')];
      expect(flashed.map((td) => [...td.classList].find((c) => c.startsWith('cdk-column-')))).toEqual(['cdk-column-montant']);
    });

    it('la sélection renvoie les lignes à jour après une transaction', async () => {
      const {component} = await createTable({rowSelectionEnabled: true});
      const events: NgTableSelectionChangeEvent<Row>[] = [];
      component.selectionChange.subscribe((e) => events.push(e));
      component.applyTransaction({update: [{...ROWS[0], nom: 'Charles'}]});

      component.selection.onToggleRowSelection({checked: true} as NgTableCheckboxChange, component.displayedRows()[0]);

      expect(events[0].selectedRows.map((r) => r.nom)).toEqual(['Charles']);
    });

    it('ligne de totaux en direct : somme et moyenne suivent les transactions', async () => {
      const cols = columns();
      cols[1] = {...cols[1], aggregate: 'sum'};
      const {component, fixture} = await createTable({columns: cols, showTotals: true});
      const footer = () => (fixture.nativeElement as HTMLElement).querySelector('tr.totals-row td.cdk-column-montant')!.textContent!.trim();
      expect(footer()).toBe('Σ 600');

      component.applyTransaction({update: [{...ROWS[0], montant: 1300}], remove: [{id: '2'} as Row]});
      await fixture.whenStable();
      expect(footer()).toMatch(/^Σ 1[\s\u202f,.\u00a0]?500$/); // 1300 + 200

      component.filtering.onFilterValue('actif', 'true');
      component.applyTransaction({update: [{...ROWS[2], montant: 0}]});
      await fixture.whenStable();
      expect(footer()).toMatch(/^Σ 1[\s\u202f,.\u00a0]?300$/);
    });

    it('mode remote : les transactions sont ignorées (le serveur est la source)', async () => {
      const {component} = await createTable({dataMode: 'remote'});
      expect(component.applyTransaction({remove: [ROWS[0]]})).toEqual({add: [], update: [], remove: []});
      expect(component.displayedRows()).toHaveLength(3);
    });
  });

  describe('suspendre les mises à jour en direct ([livePauseButton], liveUpdatesPaused)', () => {
    it('un lot déjà programmé au moment de la pause attend lui aussi la reprise', async () => {
      const {fixture, component} = await createTable();
      component.applyTransactionAsync({update: [{...ROWS[0], montant: 777}]});
      component.liveUpdatesPaused.set(true);
      await new Promise((resolve) => setTimeout(resolve, 90));
      await fixture.whenStable();
      expect((component.displayedRows() as Row[]).find((row) => row.id === '1')?.montant).toBe(ROWS[0].montant);
      component.liveUpdatesPaused.set(false);
      await fixture.whenStable();
      expect((component.displayedRows() as Row[]).find((row) => row.id === '1')?.montant).toBe(777);
    });

    it('en pause, [rows] et les transactions attendent ; à la reprise tout est appliqué', async () => {
      const {fixture, component, setInput} = await createTable({livePauseButton: true});
      const button = () => (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('.ngt-live-pause')!;
      expect(button().textContent).toContain(NG_TABLE_DEFAULT_LABELS.livePause);
      button().click();
      await fixture.whenStable();
      expect(component.liveUpdatesPaused()).toBe(true);
      expect(button().textContent).toContain(NG_TABLE_DEFAULT_LABELS.liveResume);
      expect((fixture.nativeElement as HTMLElement).querySelector('.ngt-live-region')?.textContent).toContain(NG_TABLE_DEFAULT_LABELS.announceLivePaused);

      const extra: Row = {id: '4', nom: 'Dan', montant: 250, statut: 'VALIDEE', actif: true, date: '2026-04-01'};
      await setInput('rows', [...ROWS, extra]);
      component.applyTransactionAsync({update: [{...ROWS[0], montant: 999}]});
      expect(component.applyTransaction({add: [{...extra, id: '5'}]}).add).toEqual([]);
      await new Promise((resolve) => setTimeout(resolve, 80));
      await fixture.whenStable();
      expect(ids(component.displayedRows())).toEqual(['1', '2', '3']);

      button().click();
      await fixture.whenStable();
      expect(component.liveUpdatesPaused()).toBe(false);
      expect(ids(component.displayedRows()).sort()).toEqual(['1', '2', '3', '4', '5']);
      expect((component.displayedRows() as Row[]).find((row) => row.id === '1')?.montant).toBe(999);
    });
  });
});
