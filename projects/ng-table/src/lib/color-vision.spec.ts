import {provideZonelessChangeDetection} from '@angular/core';
import {TestBed} from '@angular/core/testing';
import {beforeEach, describe, expect, it} from 'vitest';
import {HATCHES, LINE_DASHES, MARK_COUNT, MARKER_PATHS} from './chart-marks';
import {colorDistance, contrastRatio, ColorVision, minPaletteDistance} from './color-vision';
import {NgTableChartComponent} from './ng-table-chart.component';
import {NG_TABLE_TOKENS} from './theme';

const chart = (key: 'light' | 'dark') => NG_TABLE_TOKENS.filter((token) => /^chart-\d$/.test(token.name)).map((token) => token[key]);
const BACKGROUND = {light: '#ffffff', dark: '#11171d'};

describe('simulation de daltonisme', () => {
  it('le rouge et le vert se confondent en deutéranopie mais pas en vision normale', () => {
    expect(colorDistance('#d55e00', '#009e73', 'normal')).toBeGreaterThan(40);
    expect(colorDistance('#c0392b', '#2e7d32', 'deuteranopia')).toBeLessThan(colorDistance('#c0392b', '#2e7d32', 'normal') / 2);
  });

  it('en achromatopsie, seule la luminosité compte', () => {
    expect(colorDistance('#ff0000', '#00ff00', 'achromatopsia')).toBeGreaterThan(30);
    expect(colorDistance('#7f7f7f', '#7f7f7f', 'achromatopsia')).toBe(0);
  });
});

describe('palette des graphiques (--ngt-chart-1 à 8)', () => {
  // Seuils : ΔE ≥ 15 entre deux séries pour les trois dichromaties, ≥ 5 en niveaux de gris, ≥ 25 en vision normale ;
  // contraste ≥ 3:1 avec le fond (WCAG 1.4.11, éléments graphiques). La forme du point et les hachures font le reste.
  for (const mode of ['light', 'dark'] as const) {
    describe(`thème ${mode === 'light' ? 'clair' : 'sombre'}`, () => {
      const palette = chart(mode);

      it('8 couleurs différentes', () => {
        expect(palette).toHaveLength(8);
        expect(new Set(palette).size).toBe(8);
      });

      it('chaque couleur contraste au moins 3:1 avec le fond', () => {
        const weak = palette.map((color, i) => ({i: i + 1, ratio: contrastRatio(color, BACKGROUND[mode])})).filter(({ratio}) => ratio < 3);
        expect(weak).toEqual([]);
      });

      const thresholds: [ColorVision, number][] = [
        ['normal', 25],
        ['protanopia', 15],
        ['deuteranopia', 15],
        ['tritanopia', 15],
        ['achromatopsia', 5],
      ];
      for (const [vision, minimum] of thresholds) {
        it(`deux séries restent distinguables en ${vision} (ΔE ≥ ${minimum})`, () => {
          const {distance, pair} = minPaletteDistance(palette, vision);
          expect(distance, `séries ${pair[0] + 1} et ${pair[1] + 1}`).toBeGreaterThanOrEqual(minimum);
        });
      }
    });
  }

  it('l’ancienne palette ne passait pas : le test détecte bien un défaut', () => {
    const old = ['#2f6fa8', '#e07a3f', '#5fa36b', '#b5527e', '#8a6fd1', '#d1a83f', '#3fa7a0', '#8c8c8c'];
    expect(minPaletteDistance(old, 'deuteranopia').distance).toBeLessThan(15);
    expect(minPaletteDistance(old, 'achromatopsia').distance).toBeLessThan(5);
  });
});

describe('marques des séries (forme, tireté, hachures)', () => {
  it('huit formes de point différentes', () => {
    expect(MARKER_PATHS).toHaveLength(MARK_COUNT);
    expect(new Set(MARKER_PATHS).size).toBe(MARK_COUNT);
  });

  it('chaque série a une combinaison forme + tireté unique', () => {
    const combos = MARKER_PATHS.map((path, i) => `${path}|${LINE_DASHES[i]}`);
    expect(new Set(combos).size).toBe(MARK_COUNT);
  });

  it('huit hachures différentes', () => {
    expect(HATCHES).toHaveLength(MARK_COUNT);
    expect(new Set(HATCHES.map((hatch) => JSON.stringify(hatch))).size).toBe(MARK_COUNT);
  });
});

describe('graphique sans la couleur seule', () => {
  beforeEach(() => TestBed.configureTestingModule({providers: [provideZonelessChangeDetection()]}));
  const data = {
    categories: ['a', 'b', 'c'],
    series: Array.from({length: 3}, (_, i) => ({name: `S${i + 1}`, values: [1 + i, 2 + i, 3 + i]})),
  };
  const render = async (type: string, patterns = false) => {
    const fixture = TestBed.createComponent(NgTableChartComponent);
    fixture.componentRef.setInput('data', data);
    fixture.componentRef.setInput('type', type);
    fixture.componentRef.setInput('patterns', patterns);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  };

  it('courbes : chaque série a sa forme de point et son tireté, repris dans la légende', async () => {
    const root = await render('line');
    const shapesBySeries = [...root.querySelectorAll('svg.ngt-chart__svg path.ngt-chart__point')].map((point) => point.getAttribute('d'));
    expect(new Set(shapesBySeries).size).toBe(3);
    const lines = [...root.querySelectorAll('svg.ngt-chart__svg path.ngt-chart__line')].map((line) => line.getAttribute('stroke-dasharray'));
    expect(lines[0]).toBeNull(); // la première série est en trait plein
    expect(new Set(lines).size).toBe(3);
    const swatches = [...root.querySelectorAll('.ngt-chart__legend-item svg')];
    expect(swatches.map((svg) => svg.querySelector('path')?.getAttribute('d'))).toEqual(MARKER_PATHS.slice(0, 3));
  });

  it('barres : aplats par défaut, hachures différentes par série avec [patterns]', async () => {
    const plain = await render('bar');
    expect(plain.querySelectorAll('pattern')).toHaveLength(0);
    expect(plain.querySelector('rect.ngt-chart__shape')?.getAttribute('style')).toContain('var(--ngt-chart-1');

    const hatched = await render('bar', true);
    expect(hatched.querySelectorAll('pattern')).toHaveLength(MARK_COUNT);
    const fills = [...hatched.querySelectorAll('rect.ngt-chart__shape')].map((rect) => (rect as SVGElement).style.fill);
    expect(new Set(fills).size).toBe(3);
    expect(fills.every((fill) => fill.startsWith('url('))).toBe(true);
    // chaque url pointe vers un motif qui existe
    for (const fill of fills) {
      const id = /#([^")]+)/.exec(fill)![1];
      expect(hatched.querySelector(`pattern[id="${id}"]`)).not.toBeNull();
    }
  });

  it('secteurs avec [patterns] : motifs aussi dans la légende', async () => {
    const root = await render('pie', true);
    expect([...root.querySelectorAll('path.ngt-chart__slice')].every((slice) => (slice as SVGElement).style.fill.startsWith('url('))).toBe(true);
    expect(root.querySelectorAll('.ngt-chart__legend-item svg rect')).toHaveLength(3);
  });

  it('deux graphiques sur la même page ont des identifiants de motif distincts', async () => {
    const a = await render('bar', true);
    const b = await render('bar', true);
    const ids = (root: HTMLElement) => [...root.querySelectorAll('pattern')].map((pattern) => pattern.id);
    expect(ids(a).filter((id) => ids(b).includes(id))).toEqual([]);
  });
});
