/**
 * Mini-graphiques (sparklines) : lecture de la série d'une cellule et calcul de la forme SVG.
 * Fonctions pures, sans Angular.
 */
import {numericCellValue} from './range-stats';

export type SparklineType = 'line' | 'area' | 'bar';

/** Réglage d'une colonne `sparkline` : la valeur de la cellule est alors une série de nombres. */
export interface NgTableSparklineOptions {
  type?: SparklineType;
  width?: number;
  height?: number;
  /** Couleur du tracé (CSS) ; par défaut la couleur principale de la table. */
  color?: string;
}

export interface SparklineBar {
  x: number;
  y: number;
  width: number;
  height: number;
  negative: boolean;
}

export interface SparklineShape {
  type: SparklineType;
  width: number;
  height: number;
  /** Tracé de la courbe (`line`, `area`) ; chaîne vide pour des barres. */
  line: string;
  /** Contour fermé sous la courbe (`area`). */
  area: string | null;
  bars: SparklineBar[];
  /** Dernier point, mis en évidence. */
  lastPoint: { x: number; y: number } | null;
  min: number;
  max: number;
  last: number;
}

const PADDING = 2;

const round = (value: number): number => Math.round(value * 100) / 100;

/** Série de nombres d'une valeur de cellule : un tableau (les éléments non numériques sont ignorés), sinon vide. */
export function sparklineValues(value: unknown): number[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const values: number[] = [];
  for (const item of value) {
    const number = numericCellValue(item);
    if (number !== null) {
      values.push(number);
    }
  }
  return values;
}

/** Forme SVG d'une série, ou `null` quand elle est vide. */
export function buildSparkline(values: readonly number[], type: SparklineType, width: number, height: number): SparklineShape | null {
  const count = values.length;
  if (count === 0) {
    return null;
  }
  let min = values[0];
  let max = values[0];
  for (const value of values) {
    if (value < min) {
      min = value;
    }
    if (value > max) {
      max = value;
    }
  }
  const innerWidth = width - 2 * PADDING;
  const innerHeight = height - 2 * PADDING;
  // Barres : l'axe passe par 0 ; courbes : l'échelle colle aux données.
  const domainMin = type === 'bar' ? Math.min(min, 0) : min;
  const domainMax = type === 'bar' ? Math.max(max, 0) : max;
  const span = domainMax - domainMin || 1;
  const yOf = (value: number) => round(PADDING + ((domainMax - value) / span) * innerHeight);
  const last = values[count - 1];

  if (type === 'bar') {
    const slot = innerWidth / count;
    const barWidth = Math.max(1, slot * 0.7);
    const zero = yOf(0);
    const bars = values.map((value, index) => {
      const top = yOf(value);
      return {
        x: round(PADDING + index * slot + (slot - barWidth) / 2),
        y: Math.min(top, zero),
        width: round(barWidth),
        height: Math.max(1, round(Math.abs(top - zero))),
        negative: value < 0,
      };
    });
    return {type, width, height, line: '', area: null, bars, lastPoint: null, min, max, last};
  }

  const xOf = (index: number) => round(count === 1 ? width / 2 : PADDING + (index * innerWidth) / (count - 1));
  const points = values.map((value, index) => ({x: xOf(index), y: yOf(value)}));
  const line = points.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x} ${point.y}`).join(' ');
  const baseline = round(height - PADDING);
  const area = type === 'area' ? `${line} L${points[count - 1].x} ${baseline} L${points[0].x} ${baseline} Z` : null;
  return {type, width, height, line, area, bars: [], lastPoint: points[count - 1], min, max, last};
}
