/**
 * Navigation clavier cellule par cellule (motif « grid » de WAI-ARIA APG), sans
 * dépendance Angular : calcul de la cellule suivante (pur, testé isolément) et
 * gestion du tabindex itinérant (« roving tabindex ») dans le DOM de la table.
 */

export interface GridPosition {
  row: number;
  col: number;
}

/** Éléments qui prendraient une tabulation dans une cellule (boutons, liens, champs...). */
export const FOCUSABLE_IN_CELL = 'button, a[href], input, select, textarea, [tabindex]:not(td)';

/** Nombre de lignes parcourues par PageUp / PageDown. */
export const GRID_PAGE_STEP = 10;

/**
 * Position atteinte par une touche de navigation, ou `null` si la touche ne déplace
 * pas le focus (autre touche, ou déjà au bord). Bornée à la grille `rowCount × colCount`.
 */
export function nextGridPosition(
  key: string,
  ctrlKey: boolean,
  from: GridPosition,
  rowCount: number,
  colCount: number,
): GridPosition | null {
  if (rowCount === 0 || colCount === 0) {
    return null;
  }
  const lastRow = rowCount - 1;
  const lastCol = colCount - 1;
  let next: GridPosition;
  switch (key) {
    case 'ArrowRight':
      next = {row: from.row, col: from.col + 1};
      break;
    case 'ArrowLeft':
      next = {row: from.row, col: from.col - 1};
      break;
    case 'ArrowDown':
      next = {row: from.row + 1, col: from.col};
      break;
    case 'ArrowUp':
      next = {row: from.row - 1, col: from.col};
      break;
    case 'Home':
      next = ctrlKey ? {row: 0, col: 0} : {row: from.row, col: 0};
      break;
    case 'End':
      next = ctrlKey ? {row: lastRow, col: lastCol} : {row: from.row, col: lastCol};
      break;
    case 'PageDown':
      next = {row: from.row + GRID_PAGE_STEP, col: from.col};
      break;
    case 'PageUp':
      next = {row: from.row - GRID_PAGE_STEP, col: from.col};
      break;
    default:
      return null;
  }
  const clamped = {row: clamp(next.row, 0, lastRow), col: clamp(next.col, 0, lastCol)};
  return clamped.row === from.row && clamped.col === from.col ? null : clamped;
}

/** Lignes de données de la grille (hors en-tête, lignes détail et lignes d'actions mobiles). */
export function gridRows(table: HTMLTableElement): HTMLTableRowElement[] {
  const rows: HTMLTableRowElement[] = [];
  for (const body of Array.from(table.tBodies)) {
    for (const row of Array.from(body.rows)) {
      if (row.classList.contains('data-row')) {
        rows.push(row);
      }
    }
  }
  return rows;
}

/** Cellule de données contenant `element`, avec sa position ; `null` hors grille. */
export function locateGridCell(
  table: HTMLTableElement,
  element: Element,
): { cell: HTMLTableCellElement; position: GridPosition } | null {
  const cell = element.closest('td');
  const row = cell?.parentElement;
  if (!cell || !(row instanceof HTMLTableRowElement) || !row.classList.contains('data-row') || !table.contains(row)) {
    return null;
  }
  return {cell, position: {row: gridRows(table).indexOf(row), col: Array.from(row.cells).indexOf(cell)}};
}

export function gridCellAt(table: HTMLTableElement, position: GridPosition): HTMLTableCellElement | null {
  const rows = gridRows(table);
  const row = rows[clamp(position.row, 0, rows.length - 1)];
  if (!row || row.cells.length === 0) {
    return null;
  }
  return row.cells[clamp(position.col, 0, row.cells.length - 1)];
}

/**
 * Tabindex itinérant : une seule cellule de la grille est atteignable par Tab (celle
 * à `position`, bornée), les autres et tout contenu interactif des cellules passent à
 * `tabindex="-1"` (atteints au clavier par les flèches, puis Entrée / F2).
 * Renvoie la cellule active.
 */
export function syncGridTabStops(table: HTMLTableElement, position: GridPosition): HTMLTableCellElement | null {
  const active = gridCellAt(table, position);
  for (const row of gridRows(table)) {
    for (const cell of Array.from(row.cells)) {
      cell.tabIndex = cell === active ? 0 : -1;
      for (const inner of Array.from(cell.querySelectorAll<HTMLElement>(FOCUSABLE_IN_CELL))) {
        if (inner.tabIndex !== -1) {
          inner.tabIndex = -1;
        }
      }
    }
  }
  return active;
}

/** Déplace le tabindex itinérant d'une cellule à une autre (sans tout reparcourir). */
export function moveGridTabStop(from: HTMLTableCellElement | null, to: HTMLTableCellElement): void {
  if (from && from !== to) {
    from.tabIndex = -1;
  }
  to.tabIndex = 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
