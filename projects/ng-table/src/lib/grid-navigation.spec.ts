import {describe, expect, it} from 'vitest';
import {GRID_PAGE_STEP, nextGridPosition} from './grid-navigation';

describe('grid-navigation', () => {
  const at = (row: number, col: number) => ({row, col});

  it('déplace d’une cellule avec les flèches', () => {
    expect(nextGridPosition('ArrowRight', false, at(1, 1), 5, 4)).toEqual(at(1, 2));
    expect(nextGridPosition('ArrowLeft', false, at(1, 1), 5, 4)).toEqual(at(1, 0));
    expect(nextGridPosition('ArrowDown', false, at(1, 1), 5, 4)).toEqual(at(2, 1));
    expect(nextGridPosition('ArrowUp', false, at(1, 1), 5, 4)).toEqual(at(0, 1));
  });

  it('va aux bords avec Début / Fin, et aux coins avec Ctrl', () => {
    expect(nextGridPosition('Home', false, at(2, 3), 5, 4)).toEqual(at(2, 0));
    expect(nextGridPosition('End', false, at(2, 0), 5, 4)).toEqual(at(2, 3));
    expect(nextGridPosition('Home', true, at(2, 3), 5, 4)).toEqual(at(0, 0));
    expect(nextGridPosition('End', true, at(0, 0), 5, 4)).toEqual(at(4, 3));
  });

  it('saute de plusieurs lignes avec Page préc. / suiv., sans sortir de la grille', () => {
    expect(nextGridPosition('PageDown', false, at(0, 1), 50, 4)).toEqual(at(GRID_PAGE_STEP, 1));
    expect(nextGridPosition('PageDown', false, at(45, 1), 50, 4)).toEqual(at(49, 1));
    expect(nextGridPosition('PageUp', false, at(3, 1), 50, 4)).toEqual(at(0, 1));
  });

  it('renvoie null au bord, pour une autre touche ou une grille vide', () => {
    expect(nextGridPosition('ArrowLeft', false, at(0, 0), 5, 4)).toBeNull();
    expect(nextGridPosition('ArrowDown', false, at(4, 0), 5, 4)).toBeNull();
    expect(nextGridPosition('a', false, at(1, 1), 5, 4)).toBeNull();
    expect(nextGridPosition('ArrowDown', false, at(0, 0), 0, 0)).toBeNull();
  });
});
