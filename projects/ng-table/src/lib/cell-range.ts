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
