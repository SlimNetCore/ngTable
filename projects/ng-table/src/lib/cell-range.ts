/**
 * Sélection d'une plage rectangulaire de cellules et presse-papiers (équivalent de la
 * « range selection » d'AG Grid Enterprise). Fonctions pures, sans dépendance Angular.
 * Les positions sont des index : ligne dans `displayedRows()`, colonne dans `visibleColumns()`.
 */

export interface CellPosition {
  row: number;
  col: number;
}

/** Plage normalisée, bornes incluses. */
export interface CellRange {
  row1: number;
  row2: number;
  col1: number;
  col2: number;
}

export interface RangeEdges {
  top: boolean;
  right: boolean;
  bottom: boolean;
  left: boolean;
}

/** Plage entre deux cellules (dans n'importe quel ordre). */
export function normalizeRange(a: CellPosition, b: CellPosition): CellRange {
  return {
    row1: Math.min(a.row, b.row),
    row2: Math.max(a.row, b.row),
    col1: Math.min(a.col, b.col),
    col2: Math.max(a.col, b.col),
  };
}

/** Plage ramenée à la grille `rowCount × colCount` ; `null` si elle n'y rencontre aucune cellule. */
export function clampRange(range: CellRange, rowCount: number, colCount: number): CellRange | null {
  if (rowCount <= 0 || colCount <= 0 || range.row1 >= rowCount || range.col1 >= colCount) {
    return null;
  }
  return {
    row1: range.row1,
    row2: Math.min(range.row2, rowCount - 1),
    col1: range.col1,
    col2: Math.min(range.col2, colCount - 1),
  };
}

export function rangeContains(range: CellRange, row: number, col: number): boolean {
  return row >= range.row1 && row <= range.row2 && col >= range.col1 && col <= range.col2;
}

/** Côtés de la cellule qui touchent le bord de la plage (pour tracer le contour). */
export function rangeEdges(range: CellRange, row: number, col: number): RangeEdges {
  return {top: row === range.row1, bottom: row === range.row2, left: col === range.col1, right: col === range.col2};
}

export function rangeSize(range: CellRange): { rows: number; cols: number } {
  return {rows: range.row2 - range.row1 + 1, cols: range.col2 - range.col1 + 1};
}

/**
 * Texte du presse-papiers, au format que collent Excel et Google Sheets : colonnes
 * séparées par une tabulation, lignes par un saut de ligne. Une valeur qui contient une
 * tabulation, un saut de ligne ou un guillemet est entourée de guillemets (doublés).
 */
export function toClipboardText(matrix: readonly (readonly string[])[]): string {
  return matrix.map((row) => row.map(quoteField).join('\t')).join('\n');
}

function quoteField(value: string): string {
  return /[\t\n\r"]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * Lit un texte de presse-papiers tabulé (l'inverse de `toClipboardText`) : champs entre
 * guillemets, sauts de ligne `\n`, `\r\n` ou `\r`. Le saut de ligne final que les tableurs
 * ajoutent est ignoré. Texte vide : aucune ligne.
 */
export function parseClipboardText(text: string): string[][] {
  if (text === '') {
    return [];
  }
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let fieldStart = true;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"' && fieldStart) {
      quoted = true;
      fieldStart = false;
    } else if (char === '\t') {
      row.push(field);
      field = '';
      fieldStart = true;
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') {
        i++;
      }
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      fieldStart = true;
    } else {
      field += char;
      fieldStart = false;
    }
  }
  // Dernière ligne, sauf si le texte se termine par un saut de ligne (ligne vide ajoutée par les tableurs).
  if (field !== '' || row.length > 0 || quoted) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** Valeur à écrire dans une cellule cible d'un collage. */
export interface PasteAssignment {
  row: number;
  col: number;
  value: string;
}

/**
 * Cellules cibles d'un collage. Une valeur unique collée sur une plage de plusieurs
 * cellules les remplit toutes (comme Excel) ; sinon la matrice est posée à partir de la
 * cellule en haut à gauche de la plage, et ce qui dépasse de la grille est ignoré.
 */
export function buildPasteAssignments(
  values: readonly (readonly string[])[],
  target: CellRange,
  rowCount: number,
  colCount: number,
): PasteAssignment[] {
  const assignments: PasteAssignment[] = [];
  if (values.length === 0) {
    return assignments;
  }
  const single = values.length === 1 && values[0].length === 1;
  const {rows, cols} = rangeSize(target);
  if (single && rows * cols > 1) {
    for (let row = target.row1; row <= Math.min(target.row2, rowCount - 1); row++) {
      for (let col = target.col1; col <= Math.min(target.col2, colCount - 1); col++) {
        assignments.push({row, col, value: values[0][0]});
      }
    }
    return assignments;
  }
  values.forEach((line, i) => {
    line.forEach((value, j) => {
      const row = target.row1 + i;
      const col = target.col1 + j;
      if (row < rowCount && col < colCount) {
        assignments.push({row, col, value});
      }
    });
  });
  return assignments;
}

/** Sens d'une recopie : la plage source est prolongée vers le bas, le haut, la droite ou la gauche. */
export type FillDirection = 'down' | 'up' | 'right' | 'left';

/**
 * Plage obtenue en tirant la poignée de recopie de `source` jusqu'à la cellule `to` : la source est prolongée dans
 * UNE direction (celle où `to` sort le plus de la source). `null` quand `to` est dans la source : rien à recopier.
 */
export function fillTarget(source: CellRange, to: CellPosition): {range: CellRange; direction: FillDirection} | null {
  const down = to.row - source.row2;
  const up = source.row1 - to.row;
  const right = to.col - source.col2;
  const left = source.col1 - to.col;
  const furthest = Math.max(down, up, right, left);
  if (furthest <= 0) {
    return null;
  }
  if (furthest === down) {
    return {range: {...source, row2: to.row}, direction: 'down'};
  }
  if (furthest === up) {
    return {range: {...source, row1: to.row}, direction: 'up'};
  }
  return furthest === right ? {range: {...source, col2: to.col}, direction: 'right'} : {range: {...source, col1: to.col}, direction: 'left'};
}

/** Pas d'une suite de nombres à pas constant (1, 2, 3 → 1 ; 10, 20 → 10) ; `null` sinon, ou avec moins de deux valeurs. */
function seriesStep(values: readonly unknown[]): number | null {
  if (values.length < 2 || !values.every((value) => typeof value === 'number' && Number.isFinite(value))) {
    return null;
  }
  const numbers = values as number[];
  const step = numbers[1] - numbers[0];
  for (let i = 2; i < numbers.length; i++) {
    if (Math.abs(numbers[i] - numbers[i - 1] - step) > 1e-9 * Math.max(1, Math.abs(step))) {
      return null;
    }
  }
  return step;
}

/** Valeur écrite par une recopie dans une cellule cible. */
export interface FillAssignment {
  row: number;
  col: number;
  value: unknown;
}

/**
 * Valeurs d'une recopie : les cellules de `target` hors de `source` reçoivent les valeurs de la source, répétées
 * dans l'ordre (comme la poignée d'un tableur). Quand les valeurs sources d'une ligne ou d'une colonne sont des
 * nombres à pas constant (1, 2, 3), la suite est PROLONGÉE (4, 5...) au lieu d'être répétée.
 * `read(row, col)` lit la valeur d'une cellule source.
 */
export function buildFillAssignments(
  source: CellRange,
  target: CellRange,
  direction: FillDirection,
  read: (row: number, col: number) => unknown,
): FillAssignment[] {
  const assignments: FillAssignment[] = [];
  const vertical = direction === 'down' || direction === 'up';
  const forward = direction === 'down' || direction === 'right';
  const lanes = vertical ? [source.col1, source.col2] : [source.row1, source.row2];
  const [from, to] = vertical ? [source.row1, source.row2] : [source.col1, source.col2];
  const count = vertical ? (forward ? target.row2 - source.row2 : source.row1 - target.row1) : forward ? target.col2 - source.col2 : source.col1 - target.col1;
  for (let lane = lanes[0]; lane <= lanes[1]; lane++) {
    const values: unknown[] = [];
    for (let i = from; i <= to; i++) {
      values.push(vertical ? read(i, lane) : read(lane, i));
    }
    const step = seriesStep(values);
    for (let k = 0; k < count; k++) {
      const position = forward ? to + 1 + k : from - 1 - k;
      let value: unknown;
      if (step !== null) {
        const base = forward ? (values[values.length - 1] as number) : (values[0] as number);
        // Arrondi : 0,1 + 0,2 ne doit pas écrire 0,30000000000000004.
        value = Number((base + (forward ? 1 : -1) * step * (k + 1)).toPrecision(12));
      } else {
        value = forward ? values[k % values.length] : values[values.length - 1 - (k % values.length)];
      }
      assignments.push(vertical ? {row: position, col: lane, value} : {row: lane, col: position, value});
    }
  }
  return assignments;
}
