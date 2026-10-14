import {describe, expect, it} from 'vitest';
import {buildChartLayout, chartDataFromRange, niceScale, NgTableChartData, slicePath} from './chart';

interface Row {
  name: string;
  a: number | string | null;
  b: number;
}

const ROWS: Row[] = [
  {name: 'Nord', a: 10, b: 1},
  {name: 'Sud', a: '20', b: 2},
  {name: 'Est', a: null, b: 3},
];
const column = (header: string, key: keyof Row) => ({header, valueAccessor: (row: Row) => row[key]});

describe('chart', () => {
  describe('chartDataFromRange', () => {
    it('les colonnes numériques deviennent des séries, la première colonne de texte les catégories', () => {
      expect(chartDataFromRange(ROWS, [column('Région', 'name'), column('A', 'a'), column('B', 'b')])).toEqual({
        categories: ['Nord', 'Sud', 'Est'],
        series: [
          {name: 'A', values: [10, 20, null]},
          {name: 'B', values: [1, 2, 3]},
        ],
      });
    });

    it('sans colonne de texte les catégories sont 1, 2, 3 ; sans colonne numérique, pas de graphique', () => {
      expect(chartDataFromRange(ROWS, [column('B', 'b')])?.categories).toEqual(['1', '2', '3']);
      expect(chartDataFromRange(ROWS, [column('Région', 'name')])).toBeNull();
      expect(chartDataFromRange([], [column('B', 'b')])).toBeNull();
    });
  });

  describe('niceScale', () => {
    it('arrondit à des pas de 1, 2 ou 5 × 10ⁿ qui contiennent les données', () => {
      expect(niceScale(0, 87)).toMatchObject({min: 0, max: 100, step: 20});
      expect(niceScale(0, 7)).toMatchObject({min: 0, max: 8, step: 2});
      expect(niceScale(-30, 120).ticks).toEqual([-50, 0, 50, 100, 150]);
    });

    it('survit à une plage nulle ou à des valeurs non finies', () => {
      const flat = niceScale(5, 5);
      expect(flat.min).toBeLessThan(5);
      expect(flat.max).toBeGreaterThan(5);
      expect(niceScale(0, 0).max).toBeGreaterThan(0);
      expect(niceScale(NaN, 1).ticks.length).toBeGreaterThan(1);
    });
  });

  describe('buildChartLayout', () => {
    const data: NgTableChartData = {categories: ['A', 'B', 'C'], series: [{name: 's', values: [10, 20, null]}, {name: 't', values: [5, -5, 15]}]};

    it('barres : une par valeur non nulle, partant de la ligne du zéro', () => {
      const layout = buildChartLayout(data, 'bar', 300);
      expect(layout.bars).toHaveLength(5);
      const positive = layout.bars.find((bar) => bar.value === 20)!;
      const negative = layout.bars.find((bar) => bar.value === -5)!;
      expect(positive.y + positive.height).toBeCloseTo(layout.zeroY, 1);
      expect(negative.y).toBeCloseTo(layout.zeroY, 1);
      expect(layout.yTicks[0].y).toBeGreaterThan(layout.yTicks.at(-1)!.y); // les valeurs croissent vers le haut
    });

    it('courbes : une par série, interrompue par rien, la zone se referme sur le zéro', () => {
      const line = buildChartLayout(data, 'line', 300);
      expect(line.lines).toHaveLength(2);
      expect(line.lines[0].points).toHaveLength(2); // la valeur nulle est sautée
      expect(line.lines[0].area).toBeNull();
      const area = buildChartLayout(data, 'area', 300);
      expect(area.lines[0].area).toContain('Z');
    });

    it('secteurs : parts proportionnelles aux valeurs positives de la première série', () => {
      const layout = buildChartLayout(data, 'pie', 300);
      expect(layout.slices.map((slice) => slice.index)).toEqual([0, 1]);
      expect(layout.slices[0].share).toBeCloseTo(1 / 3, 5);
      expect(layout.pie?.inner).toBe(0);
      expect(buildChartLayout(data, 'donut', 300).pie!.inner).toBeGreaterThan(0);
    });

    it('un secteur unique est un cercle complet', () => {
      const layout = buildChartLayout({categories: ['x'], series: [{name: 's', values: [3]}]}, 'pie', 300);
      expect(layout.slices).toHaveLength(1);
      expect(layout.slices[0].path.match(/A/g)).toHaveLength(2);
    });

    it('des données vides donnent un graphique vide', () => {
      const layout = buildChartLayout({categories: [], series: []}, 'bar', 300);
      expect(layout.bars).toEqual([]);
      expect(layout.lines).toEqual([]);
    });

    it('n’affiche qu’une étiquette sur plusieurs quand il y a beaucoup de catégories', () => {
      const many = {categories: Array.from({length: 40}, (_, i) => `c${i}`), series: [{name: 's', values: Array.from({length: 40}, (_, i) => i)}]};
      expect(buildChartLayout(many, 'line', 300).xLabels.length).toBeLessThanOrEqual(14);
    });
  });

  describe('zoom et réduction des points', () => {
    const big: NgTableChartData = {
      categories: Array.from({length: 5000}, (_, i) => `c${i}`),
      series: [{name: 's', values: Array.from({length: 5000}, (_, i) => (i === 2500 ? 9999 : Math.sin(i / 30) * 10))}],
    };

    it('une fenêtre ne dessine que les catégories visibles, avec leur numéro d’origine', () => {
      const layout = buildChartLayout({categories: ['A', 'B', 'C', 'D'], series: [{name: 's', values: [1, 2, 3, 4]}]}, 'bar', 300, {range: {start: 1, end: 3}});
      expect(layout.bars.map((bar) => bar.category)).toEqual([1, 2]);
      expect(layout.window).toEqual({start: 1, end: 3});
      expect(layout.total).toBe(4);
      expect(layout.xLabels.map((label) => label.text)).toEqual(['B', 'C']);
      expect(layout.yTicks.at(-1)!.value).toBeGreaterThanOrEqual(3); // l'échelle suit la fenêtre
      expect(layout.yTicks.at(-1)!.value).toBeLessThan(5);
    });

    it('au-delà de maxPoints, les points sont réduits mais le pic est gardé', () => {
      const layout = buildChartLayout(big, 'line', 300, {maxPoints: 300});
      expect(layout.decimated).toBe(true);
      expect(layout.lines[0].points.length).toBeLessThanOrEqual(300);
      expect(layout.lines[0].points.some((point) => point.value === 9999 && point.category === 2500)).toBe(true);
    });

    it('un million de points ne fait pas déborder la pile d’appels', () => {
      const million: NgTableChartData = {
        categories: Array.from({length: 1_000_000}, (_, i) => `c${i}`),
        series: [{name: 's', values: Array.from({length: 1_000_000}, (_, i) => i % 1000)}],
      };
      const layout = buildChartLayout(million, 'line', 300);
      expect(layout.lines[0].points.length).toBeLessThanOrEqual(600);
      expect(layout.yTicks.at(-1)!.value).toBeGreaterThanOrEqual(999);
    });

    it('en zoomant sur une petite fenêtre, plus rien n’est écarté', () => {
      const layout = buildChartLayout(big, 'line', 300, {maxPoints: 300, range: {start: 2400, end: 2600}});
      expect(layout.decimated).toBe(false);
      expect(layout.lines[0].points).toHaveLength(200);
    });
  });

  it('slicePath trace un quart de disque', () => {
    expect(slicePath(50, 50, 40, 0, 0, Math.PI / 2)).toBe('M50 50 L90 50 A40 40 0 0 1 50 90 Z');
  });
});
