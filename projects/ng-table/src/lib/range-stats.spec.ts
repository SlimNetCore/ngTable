import {describe, expect, it} from 'vitest';
import {computeRangeStats, numericCellValue} from './range-stats';

describe('range-stats', () => {
  it('lit un nombre, y compris dans un texte (virgule, espaces)', () => {
    expect(numericCellValue(12)).toBe(12);
    expect(numericCellValue('1 250,5')).toBe(1250.5);
    expect(numericCellValue('abc')).toBeNull();
    expect(numericCellValue('')).toBeNull();
    expect(numericCellValue(NaN)).toBeNull();
    expect(numericCellValue(true)).toBeNull();
  });

  it('calcule nombre, somme, moyenne, min et max en ignorant le vide et le texte', () => {
    expect(computeRangeStats([10, '20', null, '', 'x', 30, undefined])).toEqual({
      count: 4,
      numericCount: 3,
      sum: 60,
      avg: 20,
      min: 10,
      max: 30,
    });
  });

  it('une plage sans nombre n’a ni moyenne, ni min, ni max', () => {
    expect(computeRangeStats(['a', 'b'])).toEqual({count: 2, numericCount: 0, sum: 0, avg: null, min: null, max: null});
    expect(computeRangeStats([])).toMatchObject({count: 0, avg: null});
  });
});
