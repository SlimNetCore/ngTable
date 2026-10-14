import {describe, expect, it} from 'vitest';
import {dropPositionFor, moveRow} from './row-drag';

describe('row-drag', () => {
  const rows = ['a', 'b', 'c', 'd'].map((id) => ({id}));
  const ids = (list: {id: string}[]) => list.map((row) => row.id).join('');
  const move = (from: string, target: string, position: 'before' | 'after') => moveRow(rows, (row) => row.id, from, target, position);

  it('déplace une ligne avant ou après une autre, vers le haut comme vers le bas', () => {
    expect(ids(move('d', 'b', 'before')!.rows)).toBe('adbc');
    expect(ids(move('d', 'b', 'after')!.rows)).toBe('abdc');
    expect(ids(move('a', 'c', 'before')!.rows)).toBe('bacd');
    expect(ids(move('a', 'c', 'after')!.rows)).toBe('bcad');
    expect(ids(move('a', 'd', 'after')!.rows)).toBe('bcda');
  });

  it('renvoie les positions avant et après', () => {
    expect(move('d', 'b', 'before')).toMatchObject({fromIndex: 3, toIndex: 1});
    expect(move('a', 'c', 'after')).toMatchObject({fromIndex: 0, toIndex: 2});
  });

  it('ne fait rien si la ligne ne change pas de place, ou si une clé est inconnue', () => {
    expect(move('b', 'b', 'before')).toBeNull();
    expect(move('b', 'c', 'before')).toBeNull(); // déjà juste avant c
    expect(move('c', 'b', 'after')).toBeNull(); // déjà juste après b
    expect(move('z', 'b', 'before')).toBeNull();
    expect(move('a', 'z', 'before')).toBeNull();
  });

  it('ne modifie pas le tableau d’origine', () => {
    move('d', 'a', 'before');
    expect(ids(rows)).toBe('abcd');
  });

  it('choisit « avant » dans la moitié haute d’une ligne, « après » dans la moitié basse', () => {
    expect(dropPositionFor(110, {top: 100, height: 40})).toBe('before');
    expect(dropPositionFor(130, {top: 100, height: 40})).toBe('after');
  });
});
