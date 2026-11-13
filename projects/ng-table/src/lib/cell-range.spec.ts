import {describe, expect, it} from 'vitest';
import {
  buildFillAssignments,
  buildPasteAssignments,
  fillTarget,
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

describe('poignée de recopie', () => {
  const source = {row1: 2, col1: 1, row2: 3, col2: 2};

  it('fillTarget : la plage est prolongée dans la direction où la souris sort le plus', () => {
    expect(fillTarget(source, {row: 6, col: 2})).toEqual({range: {row1: 2, col1: 1, row2: 6, col2: 2}, direction: 'down'});
    expect(fillTarget(source, {row: 0, col: 1})).toEqual({range: {row1: 0, col1: 1, row2: 3, col2: 2}, direction: 'up'});
    expect(fillTarget(source, {row: 3, col: 5})).toEqual({range: {row1: 2, col1: 1, row2: 3, col2: 5}, direction: 'right'});
    expect(fillTarget(source, {row: 2, col: 0})).toEqual({range: {row1: 2, col1: 0, row2: 3, col2: 2}, direction: 'left'});
    // En diagonale : la plus grande sortie l'emporte (3 lignes contre 1 colonne).
    expect(fillTarget(source, {row: 6, col: 3})?.direction).toBe('down');
    expect(fillTarget(source, {row: 3, col: 1}), 'dans la source : rien à recopier').toBeNull();
  });

  const grid: unknown[][] = [
    ['a', 1, 10],
    ['b', 2, 10],
    ['c', 4, null],
    ['d', 8, null],
    ['e', 0, null],
  ];
  const read = (row: number, col: number) => grid[row][col];
  const fill = (from: [number, number, number, number], to: [number, number, number, number], direction: 'down' | 'up' | 'right' | 'left') =>
    buildFillAssignments({row1: from[0], col1: from[1], row2: from[2], col2: from[3]}, {row1: to[0], col1: to[1], row2: to[2], col2: to[3]}, direction, read).map(
      ({row, col, value}) => `${row},${col}=${String(value)}`,
    );

  it('une seule valeur est répétée ; plusieurs valeurs sont répétées dans l’ordre', () => {
    expect(fill([0, 0, 0, 0], [0, 0, 2, 0], 'down')).toEqual(['1,0=a', '2,0=a']);
    expect(fill([0, 0, 1, 0], [0, 0, 4, 0], 'down')).toEqual(['2,0=a', '3,0=b', '4,0=a']);
  });

  it('une suite de nombres à pas constant est prolongée, dans les deux sens', () => {
    expect(fill([0, 1, 1, 1], [0, 1, 4, 1], 'down')).toEqual(['2,1=3', '3,1=4', '4,1=5']);
    expect(fill([3, 1, 4, 1], [1, 1, 4, 1], 'up'), '8, 0 : pas de -8, vers le haut 16 puis 24').toEqual(['2,1=16', '1,1=24']);
    // Pas nul (10, 10) : la valeur est répétée, ce qui revient au même.
    expect(fill([0, 2, 1, 2], [0, 2, 3, 2], 'down')).toEqual(['2,2=10', '3,2=10']);
  });

  it('des nombres sans pas constant sont répétés, pas prolongés', () => {
    expect(fill([0, 1, 2, 1], [0, 1, 4, 1], 'down'), '1, 2, 4').toEqual(['3,1=1', '4,1=2']);
  });

  it('vers le haut, la répétition part de la dernière valeur', () => {
    expect(fill([3, 0, 4, 0], [0, 0, 4, 0], 'up')).toEqual(['2,0=e', '1,0=d', '0,0=e']);
  });

  it('vers la droite et la gauche : chaque ligne est recopiée pour elle-même', () => {
    expect(fill([0, 0, 1, 0], [0, 0, 1, 2], 'right')).toEqual(['0,1=a', '0,2=a', '1,1=b', '1,2=b']);
    expect(fill([0, 1, 1, 2], [0, 0, 1, 2], 'left'), 'ligne 0 : 1, 10 → pas de 9, donc -8 à gauche').toEqual(['0,0=-8', '1,0=-6']);
  });

  it('pas d’erreur d’arrondi sur les décimales', () => {
    const decimals = buildFillAssignments({row1: 0, col1: 0, row2: 1, col2: 0}, {row1: 0, col1: 0, row2: 3, col2: 0}, 'down', (row) => [0.1, 0.2][row]);
    expect(decimals.map((a) => a.value)).toEqual([0.3, 0.4]);
  });
});
