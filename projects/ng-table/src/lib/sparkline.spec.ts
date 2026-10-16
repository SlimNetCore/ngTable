import {describe, expect, it} from 'vitest';
import {buildSparkline, sparklineValues} from './sparkline';

describe('sparkline', () => {
  it('lit une série : nombres et textes numériques, le reste est ignoré', () => {
    expect(sparklineValues([1, '2', 'x', null, 3.5])).toEqual([1, 2, 3.5]);
    expect(sparklineValues('1,2,3')).toEqual([]);
    expect(sparklineValues(undefined)).toEqual([]);
  });

  it('une série vide n’a pas de forme', () => {
    expect(buildSparkline([], 'line', 100, 24)).toBeNull();
  });

  it('courbe : le plus petit en bas, le plus grand en haut, premier point à gauche', () => {
    const shape = buildSparkline([0, 10], 'line', 100, 24)!;
    expect(shape.line).toBe('M2 22 L98 2');
    expect(shape.lastPoint).toEqual({x: 98, y: 2});
    expect(shape).toMatchObject({min: 0, max: 10, last: 10, area: null});
  });

  it('zone : ferme le tracé sur la base', () => {
    const shape = buildSparkline([1, 2, 3], 'area', 100, 24)!;
    expect(shape.area).toBe(`${shape.line} L98 22 L2 22 Z`);
  });

  it('une série plate ou d’un seul point reste dessinable', () => {
    expect(buildSparkline([5, 5, 5], 'line', 100, 24)!.line).toBe('M2 2 L50 2 L98 2');
    expect(buildSparkline([7], 'line', 100, 24)!.lastPoint).toEqual({x: 50, y: 2});
  });

  it('barres : l’axe passe par zéro, les négatives sont signalées', () => {
    const shape = buildSparkline([10, -10], 'bar', 100, 24)!;
    expect(shape.bars).toHaveLength(2);
    expect(shape.bars[0]).toMatchObject({negative: false, y: 2});
    expect(shape.bars[1]).toMatchObject({negative: true});
    expect(shape.bars[1].y).toBeCloseTo(shape.bars[0].y + shape.bars[0].height, 1); // part de la ligne du zéro
  });

  it('des barres toutes positives partent du bas', () => {
    const [low, high] = buildSparkline([1, 4], 'bar', 100, 24)!.bars;
    expect(low.y + low.height).toBeCloseTo(22, 1);
    expect(high.y + high.height).toBeCloseTo(22, 1);
    expect(high.height).toBeGreaterThan(low.height);
  });
});
