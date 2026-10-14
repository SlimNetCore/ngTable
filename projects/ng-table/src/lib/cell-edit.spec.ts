import {describe, expect, it} from 'vitest';
import {draftFromValue, EditChange, EditHistory, editorKindFor, parseDraft, sameCellValue} from './cell-edit';

describe('cell-edit', () => {
  describe('editorKindFor', () => {
    it('déclaré, sinon déduit du filtre, sinon texte', () => {
      expect(editorKindFor({editor: 'select', filter: {type: 'number'}})).toBe('select');
      expect(editorKindFor({filter: {type: 'number'}})).toBe('number');
      expect(editorKindFor({filter: {type: 'numberRange'}})).toBe('number');
      expect(editorKindFor({filter: {type: 'date'}})).toBe('date');
      expect(editorKindFor({filter: {type: 'boolean'}})).toBe('checkbox');
      expect(editorKindFor({filter: {type: 'enum'}})).toBe('select');
      expect(editorKindFor({filter: {type: 'text'}})).toBe('text');
      expect(editorKindFor({})).toBe('text');
    });
  });

  describe('draftFromValue / parseDraft', () => {
    it('propose le texte de la valeur actuelle', () => {
      expect(draftFromValue('text', 'Dupont')).toBe('Dupont');
      expect(draftFromValue('number', 12.5)).toBe('12.5');
      expect(draftFromValue('date', new Date(2026, 2, 5))).toBe('2026-03-05');
      expect(draftFromValue('date', '2026-03-05T08:00:00Z')).toBe('2026-03-05');
      expect(draftFromValue('text', null)).toBe('');
    });

    it('nombre : virgule ou point, espaces ignorés, vide = null, texte refusé', () => {
      expect(parseDraft('number', '12,5')).toEqual({ok: true, value: 12.5});
      expect(parseDraft('number', ' 1 250.75 ')).toEqual({ok: true, value: 1250.75});
      expect(parseDraft('number', '')).toEqual({ok: true, value: null});
      expect(parseDraft('number', 'douze')).toEqual({ok: false, error: 'number'});
      expect(parseDraft('number', '1e999')).toEqual({ok: false, error: 'number'});
    });

    it('date : AAAA-MM-JJ réel, vide = null', () => {
      expect(parseDraft('date', '2026-02-28')).toEqual({ok: true, value: '2026-02-28'});
      expect(parseDraft('date', '2026-02-30')).toEqual({ok: false, error: 'date'}); // 30 février
      expect(parseDraft('date', '12/03/2026')).toEqual({ok: false, error: 'date'});
      expect(parseDraft('date', '')).toEqual({ok: true, value: null});
    });

    it('texte, liste et case à cocher', () => {
      expect(parseDraft('text', ' tel quel ')).toEqual({ok: true, value: ' tel quel '});
      expect(parseDraft('select', 'VALIDEE')).toEqual({ok: true, value: 'VALIDEE'});
      expect(parseDraft('checkbox', 'true')).toEqual({ok: true, value: true});
      expect(parseDraft('checkbox', 'Non')).toEqual({ok: true, value: false});
    });
  });

  describe('sameCellValue', () => {
    it('ne compte pas pour une modification ce qui revient au même', () => {
      expect(sameCellValue(12, '12')).toBe(true);
      expect(sameCellValue(null, '')).toBe(true);
      expect(sameCellValue(undefined, null)).toBe(true);
      expect(sameCellValue(new Date(2026, 0, 1), new Date(2026, 0, 1))).toBe(true);
      expect(sameCellValue(12, 13)).toBe(false);
      expect(sameCellValue('a', 'b')).toBe(false);
      expect(sameCellValue(0, '')).toBe(false);
    });
  });

  describe('EditHistory', () => {
    interface Row {
      id: number;
      a: number;
      b: number;
    }
    const r = (id: number, a: number, b: number): Row => ({id, a, b});
    const change = (previous: Row, current: Row, columnId: string): EditChange<Row> => ({key: previous.id, columnId, previous, current});

    it('défait puis rétablit un lot, dans l’ordre inverse des enregistrements', () => {
      const history = new EditHistory<Row>();
      const v0 = r(1, 0, 0);
      const v1 = r(1, 1, 0);
      const v2 = r(1, 1, 2);
      history.record([change(v0, v1, 'a')]);
      history.record([change(v1, v2, 'b')]);

      expect(history.undo()?.rows).toEqual([v1]);
      expect(history.undo()?.rows).toEqual([v0]);
      expect(history.undo()).toBeNull();
      expect(history.redo()?.rows).toEqual([v1]);
      expect(history.redo()?.rows).toEqual([v2]);
      expect(history.canRedo).toBe(false);
    });

    it('un lot qui touche deux colonnes d’une même ligne se défait d’un seul coup', () => {
      const history = new EditHistory<Row>();
      const v0 = r(1, 0, 0);
      const v1 = r(1, 5, 0);
      const v2 = r(1, 5, 7);
      history.record([change(v0, v1, 'a'), change(v1, v2, 'b')]);

      expect(history.undo()?.rows).toEqual([v0]); // l'état d'avant la première modification
      expect(history.redo()?.rows).toEqual([v2]); // l'état d'après la dernière
    });

    it('une nouvelle modification efface ce qu’on pouvait rétablir ; la taille est limitée', () => {
      const history = new EditHistory<Row>(2);
      history.record([change(r(1, 0, 0), r(1, 1, 0), 'a')]);
      history.undo();
      expect(history.canRedo).toBe(true);

      history.record([change(r(1, 0, 0), r(1, 9, 0), 'a')]);
      expect(history.canRedo).toBe(false);

      history.record([change(r(2, 0, 0), r(2, 1, 0), 'a')]);
      history.record([change(r(3, 0, 0), r(3, 1, 0), 'a')]);
      expect(history.undo()).not.toBeNull();
      expect(history.undo()).not.toBeNull();
      expect(history.undo()).toBeNull(); // le plus ancien a été oublié
    });
  });
});
