/**
 * Simulation de déficiences de la vision des couleurs, pour vérifier que les palettes restent distinguables.
 * Matrices de Machado, Oliveira et Fernandes (2009), sévérité maximale, appliquées en RVB linéaire ; distance ΔE CIE76.
 * Sert aux tests (`color-vision.spec.ts`) : aucune dépendance à l'exécution.
 */
export type ColorVision = 'normal' | 'protanopia' | 'deuteranopia' | 'tritanopia' | 'achromatopsia';

type Matrix = readonly [readonly [number, number, number], readonly [number, number, number], readonly [number, number, number]];

const MACHADO: Record<'protanopia' | 'deuteranopia' | 'tritanopia', Matrix> = {
  protanopia: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  deuteranopia: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]],
  tritanopia: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.3039]],
};

type Rgb = readonly [number, number, number];

const toLinear = (channel: number): number => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);

/** `#rrggbb` → RVB linéaire (0 à 1). */
export function hexToLinear(hex: string): Rgb {
  const channel = (index: number) => toLinear(parseInt(hex.slice(index, index + 2), 16) / 255);
  return [channel(1), channel(3), channel(5)];
}

/** Couleur telle que la perçoit une personne ayant cette déficience (RVB linéaire). */
export function simulate(hex: string, vision: ColorVision): Rgb {
  const [r, g, b] = hexToLinear(hex);
  if (vision === 'normal') {
    return [r, g, b];
  }
  if (vision === 'achromatopsia') {
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    return [luminance, luminance, luminance];
  }
  const matrix = MACHADO[vision];
  const apply = (row: readonly [number, number, number]) => Math.min(1, Math.max(0, row[0] * r + row[1] * g + row[2] * b));
  return [apply(matrix[0]), apply(matrix[1]), apply(matrix[2])];
}

function toLab([r, g, b]: Rgb): [number, number, number] {
  const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}

/** Écart de couleur ΔE (CIE76) entre deux couleurs telles que les perçoit cette vision : ~2 à peine visible, > 10 net. */
export function colorDistance(a: string, b: string, vision: ColorVision = 'normal'): number {
  const [l1, a1, b1] = toLab(simulate(a, vision));
  const [l2, a2, b2] = toLab(simulate(b, vision));
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}

/** Plus petit écart entre deux couleurs de la palette, et la paire concernée (indices à partir de 0). */
export function minPaletteDistance(palette: readonly string[], vision: ColorVision): {distance: number; pair: [number, number]} {
  let worst = {distance: Infinity, pair: [0, 0] as [number, number]};
  for (let i = 0; i < palette.length; i++) {
    for (let j = i + 1; j < palette.length; j++) {
      const distance = colorDistance(palette[i], palette[j], vision);
      if (distance < worst.distance) {
        worst = {distance, pair: [i, j]};
      }
    }
  }
  return worst;
}

/** Rapport de contraste WCAG entre deux couleurs. */
export function contrastRatio(a: string, b: string): number {
  const luminance = (hex: string) => {
    const [r, g, bl] = hexToLinear(hex);
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
