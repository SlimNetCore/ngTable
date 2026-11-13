import {describe, expect, it} from 'vitest';
import {badgeTone, cellNumber, colorScale, dataBar, effectiveRange, initials, progressRatio, ratingParts, valueRange} from './cell-format';

describe('cell-format', () => {
  it('cellNumber : nombres finis et textes numériques seulement', () => {
    expect(cellNumber(12.5)).toBe(12.5);
    expect(cellNumber('12,5')).toBe(12.5);
    expect(cellNumber(' 7 ')).toBe(7);
    for (const value of [null, undefined, '', '  ', 'abc', NaN, Infinity, true, new Date(), {}]) {
      expect(cellNumber(value), String(value)).toBeNull();
    }
  });

  it('valueRange : minimum et maximum des valeurs numériques, les autres ignorées', () => {
    expect(valueRange([5, null, '12', 'x', -3, undefined])).toEqual({min: -3, max: 12});
    expect(valueRange([7])).toEqual({min: 7, max: 7});
    expect(valueRange([null, 'x'])).toBeNull();
    expect(valueRange([])).toBeNull();
  });

  it('effectiveRange : les bornes du format passent avant celles mesurées', () => {
    expect(effectiveRange({}, {min: 2, max: 9})).toEqual({min: 2, max: 9});
    expect(effectiveRange({min: 0}, {min: 2, max: 9})).toEqual({min: 0, max: 9});
    expect(effectiveRange({min: 0, max: 100}, null)).toEqual({min: 0, max: 100});
    expect(effectiveRange({max: 100}, null)).toBeNull();
    expect(effectiveRange({min: 10, max: 5}, null)).toBeNull();
  });

  it('badgeTone : table ou fonction, neutre par défaut', () => {
    expect(badgeTone({type: 'badge', tone: {Validée: 'success'}}, 'Validée', null)).toBe('success');
    expect(badgeTone({type: 'badge', tone: {Validée: 'success'}}, 'Autre', null)).toBe('neutral');
    expect(badgeTone({type: 'badge'}, 'Validée', null)).toBe('neutral');
    expect(badgeTone({type: 'badge', tone: (_value, row: {late: boolean}) => (row.late ? 'danger' : 'info')}, 'x', {late: true})).toBe('danger');
    expect(badgeTone({type: 'badge', tone: {'': 'warning'}}, null, null)).toBe('warning');
  });

  it('progressRatio : borné entre 0 et 1', () => {
    expect(progressRatio(45)).toBe(0.45);
    expect(progressRatio(3, 4)).toBe(0.75);
    expect(progressRatio(150)).toBe(1);
    expect(progressRatio(-5)).toBe(0);
    expect(progressRatio('abc')).toBeNull();
    expect(progressRatio(5, 0)).toBeNull();
  });

  it('ratingParts : étoiles pleines, demi-étoile arrondie, étoiles vides', () => {
    expect(ratingParts(3)).toEqual({full: 3, half: false, empty: 2, value: 3, max: 5});
    expect(ratingParts(3.5)).toEqual({full: 3, half: true, empty: 1, value: 3.5, max: 5});
    expect(ratingParts(3.2)).toMatchObject({full: 3, half: false, empty: 2});
    expect(ratingParts(3.3)).toMatchObject({full: 3, half: true, empty: 1});
    expect(ratingParts(4.8)).toMatchObject({full: 5, half: false, empty: 0});
    expect(ratingParts(9, 3)).toMatchObject({full: 3, half: false, empty: 0});
    expect(ratingParts(-1)).toMatchObject({full: 0, half: false, empty: 5});
    expect(ratingParts(null)).toBeNull();
    for (let value = 0; value <= 5; value += 0.1) {
      const parts = ratingParts(value)!;
      expect(parts.full + (parts.half ? 1 : 0) + parts.empty).toBe(5);
    }
  });

  it('initials : première lettre des deux premiers mots', () => {
    expect(initials('Dupont SA')).toBe('DS');
    expect(initials('élodie martin-durand')).toBe('ÉM');
    expect(initials('  Bernard & Fils ')).toBe('BF');
    expect(initials('Leroy')).toBe('L');
    expect(initials('(42) x')).toBe('4X');
    expect(initials('')).toBe('');
    expect(initials('&&&')).toBe('');
  });

  it('dataBar : valeurs positives depuis le bord, négatives à gauche de l’axe zéro', () => {
    expect(dataBar(50, {min: 0, max: 200})).toEqual({start: 0, width: 0.25, negative: false});
    // Colonne toute positive qui ne part pas de zéro : l'axe reste à zéro, les barres se comparent honnêtement.
    expect(dataBar(150, {min: 100, max: 200})).toEqual({start: 0, width: 0.75, negative: false});
    expect(dataBar(50, {min: -100, max: 100})).toEqual({start: 0.5, width: 0.25, negative: false});
    expect(dataBar(-50, {min: -100, max: 100})).toEqual({start: 0.25, width: 0.25, negative: true});
    expect(dataBar(-30, {min: -60, max: -10})).toEqual({start: 0.5, width: 0.5, negative: true});
    expect(dataBar(500, {min: 0, max: 200}), 'valeur hors bornes : barre pleine').toEqual({start: 0, width: 1, negative: false});
    expect(dataBar('x', {min: 0, max: 200})).toBeNull();
    expect(dataBar(5, null)).toBeNull();
    expect(dataBar(0, {min: 0, max: 0})).toBeNull();
  });

  it('dataBar : la barre reste toujours dans la cellule (1 000 tirages)', () => {
    let seed = 3;
    const next = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
    for (let round = 0; round < 1000; round++) {
      const a = (next() - 0.5) * 1000;
      const b = (next() - 0.5) * 1000;
      const bar = dataBar((next() - 0.5) * 1500, {min: Math.min(a, b), max: Math.max(a, b)});
      if (bar) {
        expect(bar.start).toBeGreaterThanOrEqual(0);
        expect(bar.width).toBeGreaterThanOrEqual(0);
        expect(bar.start + bar.width).toBeLessThanOrEqual(1 + 1e-9);
      }
    }
  });

  it('colorScale : position dans l’étendue, ou distance à zéro en mode divergent', () => {
    expect(colorScale(15, {min: 10, max: 20})).toEqual({ratio: 0.5, negative: false});
    expect(colorScale(99, {min: 10, max: 20})).toEqual({ratio: 1, negative: false});
    expect(colorScale(5, {min: 5, max: 5})).toEqual({ratio: 0, negative: false});
    expect(colorScale(-25, {min: -50, max: 100}, true)).toEqual({ratio: 0.25, negative: true});
    expect(colorScale(100, {min: -50, max: 100}, true)).toEqual({ratio: 1, negative: false});
    expect(colorScale(0, {min: 0, max: 0}, true)).toEqual({ratio: 0, negative: false});
    expect(colorScale('x', {min: 0, max: 1})).toBeNull();
    expect(colorScale(1, null)).toBeNull();
  });
});
