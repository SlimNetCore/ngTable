/**
 * Marques qui distinguent les séries d'un graphique sans la couleur (WCAG 1.4.1) : forme du point et tireté des courbes,
 * hachures des barres et des secteurs. La série `n` reçoit la marque `n % 8`, comme elle reçoit la couleur `n % 8`.
 */
export const MARK_COUNT = 8;

/** Contour du point d'une courbe, centré sur (0, 0), environ 9 unités de large. */
export const MARKER_PATHS: readonly string[] = [
  'M-4 0a4 4 0 1 0 8 0a4 4 0 1 0 -8 0', // cercle
  'M-3.5-3.5h7v7h-7z', // carré
  'M0-4.8L4.6 3.4h-9.2z', // triangle vers le haut
  'M0-5L5 0L0 5L-5 0z', // losange
  'M0 4.8L4.6-3.4h-9.2z', // triangle vers le bas
  'M-1.6-4.6h3.2v3h3v3.2h-3v3h-3.2v-3h-3v-3.2h3z', // croix droite
  'M-1.5-4.4L0-2.9 1.5-4.4 4.4-1.5 2.9 0 4.4 1.5 1.5 4.4 0 2.9-1.5 4.4-4.4 1.5-2.9 0-4.4-1.5z', // croix en X
  'M-2.5-4.3h5L5 0 2.5 4.3h-5L-5 0z', // hexagone
];

/** Tireté (`stroke-dasharray`) de la courbe : plein, tirets, points, tiret-point. */
export const LINE_DASHES: readonly string[] = ['', '7 4', '1.5 3.5', '9 3.5 1.5 3.5', '', '7 4', '1.5 3.5', '9 3.5 1.5 3.5'];

export interface HatchPattern {
  /** Tracés dessinés par-dessus la couleur de la série, dans la couleur de la surface ; vide : aplat. */
  readonly strokes: readonly string[];
  readonly dots?: boolean;
  /** Rotation du motif, en degrés. */
  readonly angle?: number;
}

/** Hachures (motif de 8 × 8) : aplat, diagonales, points, horizontales, quadrillage, verticales, diagonales inverses, gros points. */
export const HATCHES: readonly HatchPattern[] = [
  {strokes: []},
  {strokes: ['M0 4h8'], angle: 45},
  {strokes: ['M2 2h0M6 6h0'], dots: true},
  {strokes: ['M0 4h8']},
  {strokes: ['M0 4h8', 'M4 0v8']},
  {strokes: ['M4 0v8']},
  {strokes: ['M0 4h8'], angle: -45},
  {strokes: ['M4 4h0'], dots: true},
];
