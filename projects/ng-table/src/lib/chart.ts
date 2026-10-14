/**
 * Graphiques : données issues d'une plage de cellules, échelle, et géométrie SVG.
 * Fonctions pures, sans Angular.
 */
import {decimateIndices, effectiveRange, ViewRange} from './chart-zoom';
import {numericCellValue} from './range-stats';

export type NgTableChartType = 'bar' | 'line' | 'area' | 'pie' | 'donut';

export interface NgTableChartSeries {
  name: string;
  values: (number | null)[];
}

export interface NgTableChartData {
  categories: string[];
  series: NgTableChartSeries[];
}

/** Ce que `chartDataFromRange` doit savoir d'une colonne. */
export interface ChartColumnLike<T> {
  header: string;
  valueAccessor: (row: T) => unknown;
}

/**
 * Données d'un graphique à partir d'une plage : les colonnes numériques deviennent des séries,
 * la première colonne non numérique donne les catégories (sinon « 1, 2, 3… »).
 * `null` quand la plage ne contient aucune colonne numérique.
 */
export function chartDataFromRange<T>(rows: readonly T[], columns: readonly ChartColumnLike<T>[]): NgTableChartData | null {
  if (rows.length === 0) {
    return null;
  }
  const isNumeric = (column: ChartColumnLike<T>): boolean => {
    let numeric = 0;
    let filled = 0;
    for (const row of rows) {
      const value = column.valueAccessor(row);
      if (value !== null && value !== undefined && value !== '') {
        filled++;
        if (numericCellValue(value) !== null) {
          numeric++;
        }
      }
    }
    return filled > 0 && numeric === filled;
  };
  const numericColumns = columns.filter(isNumeric);
  if (numericColumns.length === 0) {
    return null;
  }
  const labelColumn = columns.find((column) => !numericColumns.includes(column));
  const categories = rows.map((row, index) => (labelColumn ? String(labelColumn.valueAccessor(row) ?? '') : String(index + 1)));
  const series = numericColumns.map((column) => ({
    name: column.header,
    values: rows.map((row) => numericCellValue(column.valueAccessor(row))),
  }));
  return {categories, series};
}

export interface NiceScale {
  min: number;
  max: number;
  step: number;
  ticks: number[];
}

/** Échelle « ronde » (pas de 1, 2, 5 × 10ⁿ) qui contient [min, max], avec environ `target` graduations. */
export function niceScale(min: number, max: number, target = 5): NiceScale {
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return {min: 0, max: 1, step: 0.25, ticks: [0, 0.25, 0.5, 0.75, 1]};
  }
  if (min === max) {
    max = min === 0 ? 1 : min + Math.abs(min) * 0.1;
    min = min === 0 ? 0 : min - Math.abs(min) * 0.1;
  }
  const rawStep = (max - min) / Math.max(1, target);
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const residual = rawStep / magnitude;
  const step = (residual <= 1 ? 1 : residual <= 2 ? 2 : residual <= 5 ? 5 : 10) * magnitude;
  const niceMin = Math.floor(min / step) * step;
  const niceMax = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let value = niceMin; value <= niceMax + step / 2; value += step) {
    ticks.push(Math.round(value / step) * step);
  }
  return {min: niceMin, max: niceMax, step, ticks};
}

export const CHART_WIDTH = 640;

const round = (value: number): number => Math.round(value * 100) / 100;

export interface ChartBar {
  x: number;
  y: number;
  width: number;
  height: number;
  series: number;
  category: number;
  value: number;
}

export interface ChartLineSegment {
  series: number;
  path: string;
  area: string | null;
  points: { x: number; y: number; category: number; value: number }[];
}

export interface ChartSlice {
  index: number;
  path: string;
  value: number;
  /** Part du total, entre 0 et 1. */
  share: number;
}

export interface ChartTick {
  value: number;
  y: number;
}

export interface ChartLabel {
  text: string;
  x: number;
}

export interface ChartLayout {
  type: NgTableChartType;
  width: number;
  height: number;
  plot: { left: number; top: number; right: number; bottom: number };
  yTicks: ChartTick[];
  /** Ligne du zéro (barres, courbes). */
  zeroY: number;
  xLabels: ChartLabel[];
  bars: ChartBar[];
  lines: ChartLineSegment[];
  slices: ChartSlice[];
  /** Centre et rayons d'un secteur (`pie`, `donut`). */
  pie: { cx: number; cy: number; radius: number; inner: number } | null;
  /** Catégories visibles (zoom) et nombre total. */
  window: ViewRange;
  total: number;
  /** Des points ont été écartés pour rester lisible (voir `maxPoints`). */
  decimated: boolean;
}

export interface ChartLayoutOptions {
  /** Fenêtre de catégories visibles ; tout le graphique par défaut. */
  range?: ViewRange | null;
  /** Nombre maximal de points ou de barres dessinés par série (600 par défaut). Les pics et creux sont gardés. */
  maxPoints?: number;
}

/** Arc de secteur en SVG, de `from` à `to` (radians, 0 = à droite, sens horaire). */
export function slicePath(cx: number, cy: number, radius: number, inner: number, from: number, to: number): string {
  const point = (r: number, angle: number) => `${round(cx + r * Math.cos(angle))} ${round(cy + r * Math.sin(angle))}`;
  const large = to - from > Math.PI ? 1 : 0;
  if (to - from >= Math.PI * 2 - 1e-9) {
    // Cercle complet : deux demi-arcs, un arc unique de 360° serait vide.
    const mid = from + Math.PI;
    const outer = `M${point(radius, from)} A${radius} ${radius} 0 1 1 ${point(radius, mid)} A${radius} ${radius} 0 1 1 ${point(radius, from)}`;
    return inner > 0 ? `${outer} M${point(inner, from)} A${inner} ${inner} 0 1 0 ${point(inner, mid)} A${inner} ${inner} 0 1 0 ${point(inner, from)} Z` : `${outer} Z`;
  }
  if (inner > 0) {
    return `M${point(radius, from)} A${radius} ${radius} 0 ${large} 1 ${point(radius, to)} L${point(inner, to)} A${inner} ${inner} 0 ${large} 0 ${point(inner, from)} Z`;
  }
  return `M${cx} ${cy} L${point(radius, from)} A${radius} ${radius} 0 ${large} 1 ${point(radius, to)} Z`;
}

/** Calcule toutes les formes d'un graphique pour un cadre `CHART_WIDTH` × `height`. */
export function buildChartLayout(data: NgTableChartData, type: NgTableChartType, height: number, options: ChartLayoutOptions = {}): ChartLayout {
  const width = CHART_WIDTH;
  const plot = {left: 52, top: 16, right: width - 16, bottom: height - 36};
  const total = data.categories.length;
  const window = effectiveRange(options.range ?? null, total);
  const empty: ChartLayout = {
    type, width, height, plot, yTicks: [], zeroY: plot.bottom, xLabels: [], bars: [], lines: [], slices: [], pie: null,
    window, total, decimated: false,
  };
  if (total === 0 || data.series.length === 0) {
    return empty;
  }
  const start = window.start;
  const count = window.end - window.start;

  if (type === 'pie' || type === 'donut') {
    const values = data.series[0].values.map((value) => (value !== null && value > 0 ? value : 0)); // un secteur montre tout : pas de zoom
    const total = values.reduce((sum, value) => sum + value, 0);
    const radius = Math.max(10, Math.min(plot.right - plot.left, plot.bottom - plot.top) / 2);
    const cx = (plot.left + plot.right) / 2;
    const cy = (plot.top + plot.bottom) / 2;
    const inner = type === 'donut' ? round(radius * 0.55) : 0;
    let angle = -Math.PI / 2;
    const slices: ChartSlice[] = [];
    values.forEach((value, index) => {
      if (value <= 0 || total <= 0) {
        return;
      }
      const sweep = (value / total) * Math.PI * 2;
      slices.push({index, path: slicePath(cx, cy, radius, inner, angle, angle + sweep), value, share: value / total});
      angle += sweep;
    });
    return {...empty, slices, pie: {cx, cy, radius, inner}};
  }

  const visible = data.series.map((series) => series.values.slice(start, window.end));
  // Boucles plutôt que `Math.min(...valeurs)` : plus de ~100 000 arguments feraient déborder la pile d'appels.
  let lowest = 0;
  let highest = 0;
  for (const values of visible) {
    for (const value of values) {
      if (value === null) {
        continue;
      }
      if (value < lowest) {
        lowest = value;
      }
      if (value > highest) {
        highest = value;
      }
    }
  }
  const scale = niceScale(lowest, highest);
  const yOf = (value: number) => round(plot.bottom - ((value - scale.min) / (scale.max - scale.min)) * (plot.bottom - plot.top));
  const band = (plot.right - plot.left) / count;
  const centerOf = (category: number) => round(plot.left + band * (category + 0.5));
  const yTicks = scale.ticks.map((value) => ({value, y: yOf(value)}));
  const zeroY = yOf(0);

  const stride = Math.max(1, Math.ceil(count / 12));
  const xLabels = data.categories.slice(start, window.end).flatMap((text, category) => (category % stride === 0 ? [{text, x: centerOf(category)}] : []));
  const maxPoints = Math.max(4, options.maxPoints ?? 600);
  let decimated = false;
  const kept = (values: (number | null)[]): number[] => {
    const indices = decimateIndices(values, maxPoints);
    decimated ||= indices.length < values.length;
    return indices;
  };

  const bars: ChartBar[] = [];
  const lines: ChartLineSegment[] = [];
  if (type === 'bar') {
    const barWidth = (band * 0.78) / data.series.length;
    visible.forEach((values, seriesIndex) => {
      for (const category of kept(values)) {
        const value = values[category];
        if (value === null) {
          continue;
        }
        const top = yOf(value);
        bars.push({
          x: round(plot.left + band * category + band * 0.11 + barWidth * seriesIndex),
          y: Math.min(top, zeroY),
          width: round(Math.max(1, barWidth - 1)),
          height: Math.max(1, round(Math.abs(top - zeroY))),
          series: seriesIndex,
          category: start + category,
          value,
        });
      }
    });
  } else {
    visible.forEach((values, seriesIndex) => {
      const points = kept(values).flatMap((category) => {
        const value = values[category];
        return value === null ? [] : [{x: centerOf(category), y: yOf(value), category: start + category, value}];
      });
      if (points.length === 0) {
        return;
      }
      const path = points.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x} ${point.y}`).join(' ');
      const area = type === 'area' ? `${path} L${points[points.length - 1].x} ${zeroY} L${points[0].x} ${zeroY} Z` : null;
      lines.push({series: seriesIndex, path, area, points});
    });
  }
  return {...empty, yTicks, zeroY, xLabels, bars, lines, decimated};
}

/** Nombre court pour un axe : 1 200 → « 1,2 k ». */
export function formatAxisNumber(value: number): string {
  return new Intl.NumberFormat(undefined, {notation: 'compact', maximumFractionDigits: 1}).format(value);
}
