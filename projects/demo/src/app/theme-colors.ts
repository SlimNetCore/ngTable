/**
 * Petits calculs de couleur pour le bac à sable de thème : lecture d'une couleur CSS simple, superposition d'une
 * couleur translucide sur un fond, et rapport de contraste WCAG. Sans dépendance.
 */

export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

/** Lit `#rgb`, `#rrggbb`, `#rrggbbaa`, `rgb(...)` ou `rgba(...)` ; `null` pour tout le reste (nom de couleur, variable...). */
export function parseColor(value: string): Rgba | null {
  const text = value.trim().toLowerCase();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(text);
  if (hex) {
    const digits = hex[1].length === 3 ? [...hex[1]].map((digit) => digit + digit).join('') : hex[1];
    return {
      r: parseInt(digits.slice(0, 2), 16),
      g: parseInt(digits.slice(2, 4), 16),
      b: parseInt(digits.slice(4, 6), 16),
      a: digits.length === 8 ? parseInt(digits.slice(6, 8), 16) / 255 : 1,
    };
  }
  const rgb = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/.exec(text);
  if (rgb) {
    const alpha = rgb[4] === undefined ? 1 : rgb[4].endsWith('%') ? parseFloat(rgb[4]) / 100 : parseFloat(rgb[4]);
    const channel = (raw: string) => Math.max(0, Math.min(255, parseFloat(raw)));
    return {r: channel(rgb[1]), g: channel(rgb[2]), b: channel(rgb[3]), a: Math.max(0, Math.min(1, alpha))};
  }
  return null;
}

/** Couleur `top` posée sur le fond opaque `bottom`. */
export function composite(top: Rgba, bottom: Rgba): Rgba {
  const mix = (a: number, b: number) => a * top.a + b * (1 - top.a);
  return {r: mix(top.r, bottom.r), g: mix(top.g, bottom.g), b: mix(top.b, bottom.b), a: 1};
}

function luminance({r, g, b}: Rgba): number {
  const linear = (channel: number) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/**
 * Rapport de contraste WCAG (1 à 21) entre `foreground` et `background`, tous deux posés sur `canvas` s'ils sont
 * translucides. `null` si une couleur n'est pas lisible.
 */
export function contrast(foreground: string, background: string, canvas = '#ffffff'): number | null {
  const base = parseColor(canvas);
  const back = parseColor(background);
  const front = parseColor(foreground);
  if (!base || !back || !front) {
    return null;
  }
  const solidBack = composite(back, base);
  const a = luminance(composite(front, solidBack));
  const b = luminance(solidBack);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** `#rrggbb` d'une couleur (transparence ignorée), pour un sélecteur de couleur ; `null` si illisible. */
export function toHex(value: string): string | null {
  const color = parseColor(value);
  if (!color) {
    return null;
  }
  const part = (channel: number) => Math.round(channel).toString(16).padStart(2, '0');
  return `#${part(color.r)}${part(color.g)}${part(color.b)}`;
}

/** La couleur `value` avec la transparence `alpha` : `rgba(r, g, b, alpha)`. */
export function withAlpha(value: string, alpha: number): string | null {
  const color = parseColor(value);
  return color ? `rgba(${Math.round(color.r)}, ${Math.round(color.g)}, ${Math.round(color.b)}, ${alpha})` : null;
}

/** Lit les déclarations `--ngt-nom: valeur;` d'un texte CSS (les autres lignes sont ignorées). */
export function parseTokenCss(css: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const match of css.matchAll(/--ngt-([a-z0-9-]+)\s*:\s*([^;}]+)[;}]/gi)) {
    values[match[1].toLowerCase()] = match[2].trim();
  }
  return values;
}
