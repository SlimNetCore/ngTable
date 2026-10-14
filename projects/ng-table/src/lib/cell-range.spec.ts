import {describe, expect, it} from 'vitest';
import {
  buildPasteAssignments,
  clampRange,
  normalizeRange,
  parseClipboardText,
  rangeContains,
  rangeEdges,
  toClipboardText,
} from './cell-range';

describe('cell-range', () => {
  describe('plages', () => {
    it('normalise dans les deux sens et teste l’appartenance', () => {
      const range = normalizeRange({row: 4, col: 3}, {row: 1, col: 1});
      expect(range).toEqual({row1: 1, row2: 4, col1: 1, col2: 3});
      expect(rangeContains(range, 2, 2)).toBe(true);
      expect(rangeContains(range, 5, 2)).toBe(false);
      expect(rangeContains(range, 2, 4)).toBe(false);
    });

    it('trace le contour : côtés de la plage', () => {
      const range = {row1: 1, row2: 3, col1: 1, col2: 2};
      expect(rangeEdges(range, 1, 1)).toEqual({top: true, left: true, bottom: false, right: false});
      expect(rangeEdges(range, 3, 2)).toEqual({top: false, left: false, bottom: true, right: true});
      expect(rangeEdges(range, 2, 1)).toEqual({top: false, left: true, bottom: false, right: false});
    });

    it('ramène une plage à la grille, ou la rejette', () => {
      expect(clampRange({row1: 2, row2: 50, col1: 0, col2: 9}, 10, 4)).toEqual({row1: 2, row2: 9, col1: 0, col2: 3});
      expect(clampRange({row1: 12, row2: 15, col1: 0, col2: 1}, 10, 4)).toBeNull();
      expect(clampRange({row1: 0, row2: 0, col1: 0, col2: 0}, 0, 4)).toBeNull();
    });
  });

  describe('presse-papiers', () => {
    it('écrit des tabulations et des sauts de ligne, et protège les cas ambigus par des guillemets', () => {
      expect(toClipboardText([['a', 'b'], ['c', 'd']])).toBe('a\tb\nc\td');
      expect(toClipboardText([['a\tb', 'il dit "oui"'], ['ligne 1\nligne 2', '']])).toBe('"a\tb"\t"il dit ""oui"""\n"ligne 1\nligne 2"\t');
    });

    it('relit ce qu’il a écrit (aller-retour), y compris les cas ambigus', () => {
      const matrix = [['a\tb', 'il dit "oui"', ''], ['ligne 1\nligne 2', 'x', 'y\r\nz']];
      expect(parseClipboardText(toClipboardText(matrix))).toEqual(matrix);
    });

    it('lit un collage d’Excel : \\r\\n, saut de ligne final ignoré, cellules vides', () => {
      expect(parseClipboardText('1\t2\r\n3\t\r\n')).toEqual([['1', '2'], ['3', '']]);
      expect(parseClipboardText('seule valeur')).toEqual([['seule valeur']]);
      expect(parseClipboardText('')).toEqual([]);
    });
  });

  describe('collage', () => {
    const at = (row: number, col: number, value: string) => ({row, col, value});

    it('pose la matrice à partir de la cellule en haut à gauche', () => {
      const target = {row1: 2, row2: 2, col1: 1, col2: 1};
      expect(buildPasteAssignments([['a', 'b'], ['c', 'd']], target, 10, 5)).toEqual([at(2, 1, 'a'), at(2, 2, 'b'), at(3, 1, 'c'), at(3, 2, 'd')]);
    });

    it('ignore ce qui dépasse de la grille', () => {
      const target = {row1: 3, row2: 3, col1: 3, col2: 3};
      expect(buildPasteAssignments([['a', 'b'], ['c', 'd']], target, 4, 4)).toEqual([at(3, 3, 'a')]);
    });

    it('une valeur unique remplit toute la plage sélectionnée', () => {
      const target = {row1: 0, row2: 1, col1: 0, col2: 1};
      expect(buildPasteAssignments([['x']], target, 10, 10)).toEqual([at(0, 0, 'x'), at(0, 1, 'x'), at(1, 0, 'x'), at(1, 1, 'x')]);
      // Une seule cellule cible : juste cette cellule.
      expect(buildPasteAssignments([['x']], {row1: 2, row2: 2, col1: 2, col2: 2}, 10, 10)).toEqual([at(2, 2, 'x')]);
    });

    it('rien à coller : aucune cellule', () => {
      expect(buildPasteAssignments([], {row1: 0, row2: 0, col1: 0, col2: 0}, 10, 10)).toEqual([]);
    });
  });
});
