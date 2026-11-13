/**
 * Repères dans la barre de défilement : de petits traits, le long du bord de la table, qui montrent où se trouvent
 * les lignes sélectionnées ou signalées (erreur, alerte) dans toute la liste, comme les repères de recherche d'un
 * éditeur de code. Un clic sur un trait amène à la ligne. Sans dépendance Angular.
 *
 * Un trait est placé là où se trouve le curseur de la barre quand la ligne est à l'écran : à la fraction
 * « distance de la ligne depuis le haut du contenu ÷ hauteur totale du contenu » de la hauteur de la barre.
 * Sur une longue liste, un pixel de barre représente plusieurs lignes : deux lignes marquées trop proches pour être
 * distinguées partagent un trait, qui garde alors la plus importante, et mène à elle.
 */
import type {NgTableTone} from './cell-format';

/** Ce qu'un repère signale : une ligne sélectionnée, ou une teinte donnée par `[rowMarker]`. */
export type NgTableMarkerKind = 'selection' | NgTableTone;

/** Une ligne à repérer. */
export interface NgTableMarkedRow {
  /** Position de la ligne dans la liste affichée. */
  index: number;
  /** Fraction (0 à 1) de la hauteur du contenu défilant où commence la ligne. */
  position: number;
  kind: NgTableMarkerKind;
}

export interface NgTableScrollMarker {
  /** Position du trait, en pourcentage de la hauteur de la barre. */
  top: number;
  kind: NgTableMarkerKind;
  /** Ligne désignée (celle qu'un clic sur le trait amène à l'écran). */
  index: number;
  /** Fraction exacte (0 à 1) de la hauteur du contenu où commence cette ligne. */
  position: number;
}

/** À position égale, le repère le plus important l'emporte. */
const PRIORITY: Record<NgTableMarkerKind, number> = {neutral: 0, selection: 1, info: 2, success: 3, warning: 4, danger: 5};

/** Écart minimal entre deux traits, en pixels : en dessous, on ne les distingue plus et on ne peut plus les viser. */
export const MARKER_SPACING_PX = 4;

/**
 * Traits à dessiner. `trackHeight` est la hauteur de la barre en pixels (hauteur visible de la zone défilante) :
 * deux lignes marquées à moins de `MARKER_SPACING_PX` l'une de l'autre partagent un trait, placé à la position
 * exacte de la plus importante (à importance égale, de la première).
 */
export function buildScrollMarkers(rows: Iterable<NgTableMarkedRow>, trackHeight: number): NgTableScrollMarker[] {
  const height = trackHeight > 0 ? trackHeight : 400;
  const slots = Math.max(1, Math.floor(height / MARKER_SPACING_PX));
  const bySlot = new Map<number, NgTableMarkedRow>();
  for (const row of rows) {
    if (!(row.position >= 0 && row.position <= 1)) {
      continue;
    }
    const slot = Math.min(slots - 1, Math.floor(row.position * slots));
    const current = bySlot.get(slot);
    if (!current || PRIORITY[row.kind] > PRIORITY[current.kind]) {
      bySlot.set(slot, row);
    }
  }
  return [...bySlot.values()]
    .sort((a, b) => a.position - b.position)
    .map((row) => ({top: row.position * 100, kind: row.kind, index: row.index, position: row.position}));
}

/**
 * Position de défilement qui amène au milieu de la zone visible une ligne située à la fraction `position` du contenu.
 * `scrollHeight` et `clientHeight` sont ceux de la zone défilante, `rowHeight` la hauteur d'une ligne.
 */
export function scrollTopForMarker(position: number, scrollHeight: number, clientHeight: number, rowHeight: number): number {
  const target = position * scrollHeight - clientHeight / 2 + rowHeight / 2;
  return Math.max(0, Math.min(target, Math.max(0, scrollHeight - clientHeight)));
}
