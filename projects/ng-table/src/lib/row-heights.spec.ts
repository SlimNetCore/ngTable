import {describe, expect, it} from 'vitest';
import {computeVariableLayout, HeightIndex, mostCommonHeight, variableScrollTop} from './row-heights';
import {computeVirtualLayout} from './virtual-window';

const random = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);

describe('row-heights', () => {
  describe('HeightIndex', () => {
    it('sans mesure : toutes les lignes ont la hauteur estimée', () => {
      const heights = new HeightIndex(100, 48);
      expect(heights.hasDeviations).toBe(false);
      expect(heights.offsetOf(0)).toBe(0);
      expect(heights.offsetOf(10)).toBe(480);
      expect(heights.total).toBe(4800);
      expect(heights.indexAt(0)).toBe(0);
      expect(heights.indexAt(479)).toBe(9);
      expect(heights.indexAt(480)).toBe(10);
      expect(heights.indexAt(999_999)).toBe(99);
    });

    it('une ligne plus haute décale toutes les suivantes', () => {
      const heights = new HeightIndex(100, 48);
      expect(heights.set(3, 248)).toBe(true); // détail déplié : 200 px de plus
      expect(heights.hasDeviations).toBe(true);
      expect(heights.heightOf(3)).toBe(248);
      expect(heights.offsetOf(3)).toBe(144);
      expect(heights.offsetOf(4)).toBe(144 + 248);
      expect(heights.total).toBe(5000);
      expect(heights.indexAt(144)).toBe(3);
      expect(heights.indexAt(144 + 247)).toBe(3);
      expect(heights.indexAt(144 + 248)).toBe(4);
    });

    it('même mesure : rien ne change ; retour à l’estimation : l’écart est retiré', () => {
      const heights = new HeightIndex(10, 48);
      heights.set(2, 100);
      expect(heights.set(2, 100.3)).toBe(false);
      expect(heights.set(2, 48)).toBe(true);
      expect(heights.hasDeviations).toBe(false);
      expect(heights.total).toBe(480);
      expect(heights.set(5, 48.4), 'écart sous le demi-pixel : ignoré').toBe(false);
      expect(heights.set(99, 60), 'hors de la liste').toBe(false);
      expect(heights.set(1, 0), 'hauteur nulle (ligne masquée) : ignorée').toBe(false);
    });

    it('mêmes réponses qu’une addition ligne par ligne, sur 3 000 mesures aléatoires', () => {
      const next = random(9);
      const count = 500;
      const heights = new HeightIndex(count, 40);
      const plain = new Array<number>(count).fill(40);
      for (let round = 0; round < 3000; round++) {
        const index = Math.floor(next() * count);
        const height = next() < 0.3 ? 40 : 20 + Math.floor(next() * 300);
        heights.set(index, height);
        plain[index] = height;
        if (round % 50 === 0) {
          const at = Math.floor(next() * (count + 1));
          const expected = plain.slice(0, at).reduce((sum, value) => sum + value, 0);
          expect(heights.offsetOf(at)).toBeCloseTo(expected, 6);
          const offset = next() * heights.total;
          let line = 0;
          let top = 0;
          while (line < count - 1 && top + plain[line] <= offset) {
            top += plain[line++];
          }
          expect(heights.indexAt(offset), `distance ${offset}`).toBe(line);
        }
      }
    });
  });

  describe('computeVariableLayout', () => {
    it('sans écart : exactement le calcul des lignes uniformes', () => {
      const heights = new HeightIndex(10_000, 48);
      for (const scrollTop of [0, 100, 4800, 123_456, 479_000, 9_999_999]) {
        expect(computeVariableLayout(heights, scrollTop, 480)).toEqual(computeVirtualLayout(10_000, scrollTop, 480, 48));
      }
    });

    it('une ligne haute au-dessus : la tranche rendue suit la position réelle', () => {
      const heights = new HeightIndex(1000, 48);
      heights.set(5, 48 + 480); // un détail de 480 px sous la ligne 5
      // 100 lignes de 48 px plus 480 px de détail au-dessus : la ligne 100 commence à 5 280 px.
      const layout = computeVariableLayout(heights, 5280, 480, 2);
      expect(layout.start).toBe(98);
      expect(layout.end).toBe(100 + 10 + 1 + 2); // 480 / 48 = 10 lignes visibles, celle qui affleure, et la marge
      expect(layout.top).toBe(heights.offsetOf(98));
      expect(layout.top + (heights.offsetOf(layout.end) - heights.offsetOf(layout.start)) + layout.bottom).toBe(heights.total);
    });

    it('dans une ligne très haute : elle reste rendue', () => {
      const heights = new HeightIndex(100, 48);
      heights.set(10, 2000);
      const layout = computeVariableLayout(heights, 480 + 900, 480, 0);
      expect(layout.start).toBe(10);
      expect(layout.end).toBe(11);
    });

    it('la ligne visée est toujours dans la tranche, et les espacements recomposent la hauteur totale (2 000 tirages)', () => {
      const next = random(4);
      const heights = new HeightIndex(2000, 36);
      for (let i = 0; i < 300; i++) {
        heights.set(Math.floor(next() * 2000), 36 + Math.floor(next() * 400));
      }
      for (let round = 0; round < 2000; round++) {
        const scrollTop = next() * (heights.total - 600);
        const layout = computeVariableLayout(heights, scrollTop, 600);
        const first = heights.indexAt(scrollTop);
        const last = heights.indexAt(scrollTop + 600);
        expect(layout.start).toBeLessThanOrEqual(first);
        expect(layout.end).toBeGreaterThan(last);
        const rendered = heights.offsetOf(layout.end) - heights.offsetOf(layout.start);
        expect(layout.top + rendered + layout.bottom).toBeCloseTo(heights.total, 6);
      }
    });

    it('défilement au-delà de la fin : la dernière page est rendue', () => {
      const heights = new HeightIndex(50, 48);
      heights.set(0, 300);
      const layout = computeVariableLayout(heights, 999_999, 480);
      expect(layout.end).toBe(50);
      expect(layout.bottom).toBe(0);
    });

    it('liste trop longue pour le navigateur : retour au calcul uniforme (barre comprimée)', () => {
      const heights = new HeightIndex(1_000_000, 48);
      heights.set(10, 500);
      expect(computeVariableLayout(heights, 7_000_000, 800)).toEqual(computeVirtualLayout(1_000_000, 7_000_000, 800, 48));
      expect(variableScrollTop(heights, 500)).toBeNull();
    });
  });

  it('variableScrollTop : position réelle de la ligne visée, ou null quand le calcul uniforme suffit', () => {
    const heights = new HeightIndex(100, 48);
    expect(variableScrollTop(heights, 20)).toBeNull();
    heights.set(5, 248);
    expect(variableScrollTop(heights, 20)).toBe(20 * 48 + 200);
    expect(variableScrollTop(heights, 5000)).toBe(heights.offsetOf(99));
  });

  it('mostCommonHeight : la hauteur la plus fréquente, au demi-pixel près', () => {
    expect(mostCommonHeight([48, 48, 248, 48.2, 96])).toBe(48);
    expect(mostCommonHeight([36.5, 36.4, 36.6])).toBe(36.5);
    expect(mostCommonHeight([100, 48]), 'égalité : la plus petite').toBe(48);
    expect(mostCommonHeight([])).toBe(0);
  });
});
