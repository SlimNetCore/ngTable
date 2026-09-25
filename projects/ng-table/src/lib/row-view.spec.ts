import {describe, expect, it, vi} from 'vitest';
import type {NgTableColumn} from './ng-table.component';
import {buildRowViews, copyText} from './row-view';

interface Row {
  id: number;
  nom: string | null;
}

const nom: NgTableColumn<Row> = {id: 'nom', header: 'Nom', valueAccessor: (r) => r.nom, copy: true};
const id: NgTableColumn<Row> = {id: 'id', header: 'Id', valueAccessor: (r) => r.id};

describe('row-view', () => {
  it('calcule valeur, texte, texte copié et contexte de chaque cellule', () => {
    const row = {id: 1, nom: ' Alice '};
    const cell = buildRowViews([row], [nom, id], null).get(row)!.cells.get('nom')!;
    expect(cell).toEqual({value: ' Alice ', text: ' Alice ', copyText: 'Alice', context: {$implicit: row, row, value: ' Alice ', column: nom}});
  });

  it('valeur nulle : texte vide, pas de bouton de copie', () => {
    const row = {id: 2, nom: null};
    const cells = buildRowViews([row], [nom, id], null).get(row)!.cells;
    expect(cells.get('nom')).toMatchObject({text: '', copyText: ''});
    expect(cells.get('id')).toMatchObject({text: '2', copyText: ''}); // colonne sans `copy`
  });

  it('appelle rowClassFn une fois par ligne, même si la ligne revient deux fois (lignes de détail)', () => {
    const row = {id: 3, nom: 'Bob'};
    const rowClassFn = vi.fn(() => 'row--bob');
    const views = buildRowViews([row, row], [nom], rowClassFn);
    expect(views.get(row)!.classes).toBe('row--bob');
    expect(rowClassFn).toHaveBeenCalledTimes(1);
    expect(buildRowViews([row], [nom], null).get(row)!.classes).toBe('');
  });

  it('copie : accessor dédié de `copy` s’il existe', () => {
    const column: NgTableColumn<Row> = {...nom, copy: {valueAccessor: (r) => `#${r.id}`}};
    expect(copyText(column, {id: 7, nom: 'x'})).toBe('#7');
  });
});
