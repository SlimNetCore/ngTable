import {describe, expect, it} from 'vitest';
import {decimateIndices, effectiveRange, isFullRange, panRange, rangeFromBrush, zoomRange} from './chart-zoom';

describe('chart-zoom', () => {
  it('sans fenêtre, tout est visible ; une fenêtre est bornée au graphique', () => {
    expect(effectiveRange(null, 100)).toEqual({start: 0, end: 100});
    expect(effectiveRange({start: -5, end: 500}, 100)).toEqual({start: 0, end: 100});
    expect(isFullRange(null, 100)).toBe(true);
    expect(isFullRange({start: 10, end: 20}, 100)).toBe(false);
  });

  it('zoomer rapproche autour du point visé, qui reste en place', () => {
    expect(zoomRange(null, 100, 0.5)).toEqual({start: 25, end: 75});
    // Point à 0 : la fenêtre se resserre vers la gauche ; à 1 : vers la droite.
    expect(zoomRange(null, 100, 0.5, 0)).toEqual({start: 0, end: 50});
    expect(zoomRange(null, 100, 0.5, 1)).toEqual({start: 50, end: 100});
  });

  it('on ne zoome pas sous 2 catégories, ni au-delà du graphique', () => {
    expect(zoomRange({start: 10, end: 13}, 100, 0.1)).toEqual({start: 11, end: 13});
    expect(zoomRange({start: 10, end: 60}, 100, 10)).toEqual({start: 0, end: 100});
    expect(zoomRange(null, 1, 0.5)).toEqual({start: 0, end: 1});
  });

  it('se déplace sans sortir du graphique', () => {
    expect(panRange({start: 10, end: 30}, 100, 5)).toEqual({start: 15, end: 35});
    expect(panRange({start: 10, end: 30}, 100, -50)).toEqual({start: 0, end: 20});
    expect(panRange({start: 80, end: 100}, 100, 30)).toEqual({start: 80, end: 100});
  });

  it('une sélection à la souris donne les catégories sous la sélection', () => {
    const plot = {left: 100, right: 300};
    expect(rangeFromBrush(150, 250, plot, null, 100)).toEqual({start: 25, end: 75});
    expect(rangeFromBrush(250, 150, plot, null, 100)).toEqual({start: 25, end: 75}); // à l'envers
    expect(rangeFromBrush(0, 1000, plot, null, 100)).toEqual({start: 0, end: 100}); // hors du tracé : borné
    expect(rangeFromBrush(150, 150, plot, null, 100).end - rangeFromBrush(150, 150, plot, null, 100).start).toBe(2);
    // Dans une fenêtre déjà zoomée, la sélection se rapporte à elle.
    expect(rangeFromBrush(100, 200, plot, {start: 20, end: 40}, 100)).toEqual({start: 20, end: 30});
  });

  describe('decimateIndices', () => {
    it('garde tout quand il y a peu de points', () => {
      expect(decimateIndices([1, 2, 3], 10)).toEqual([0, 1, 2]);
    });

    it('réduit en gardant extrêmes, premier et dernier point', () => {
      const values = Array.from({length: 10_000}, (_, i) => (i === 4321 ? 1_000_000 : i === 7777 ? -1_000_000 : Math.sin(i / 50)));
      const kept = decimateIndices(values, 400);
      expect(kept.length).toBeLessThanOrEqual(400);
      expect(kept[0]).toBe(0);
      expect(kept.at(-1)).toBe(9_999);
      expect(kept).toContain(4321);
      expect(kept).toContain(7777);
      expect([...kept].sort((a, b) => a - b)).toEqual(kept); // ordre croissant
      expect(new Set(kept).size).toBe(kept.length);
    });

    it('ignore les valeurs vides', () => {
      const values = Array.from({length: 1000}, (_, i) => (i % 3 === 0 ? null : i));
      expect(decimateIndices(values, 100).every((i) => i === 0 || i === 999 || values[i] !== null)).toBe(true);
    });
  });
});
