/**
 * Repères dans la barre de défilement : de petits traits, le long du bord de la table, qui montrent où se trouvent
 * les lignes sélectionnées ou signalées (erreur, alerte) dans toute la liste, comme les repères de recherche d'un
 * éditeur de code. Sans dépendance Angular.
 */
import type {NgTableTone} from './cell-format';

/** Ce qu'un repère signale : une ligne sélectionnée, ou une teinte donnée par `[rowMarker]`. */
export type NgTableMarkerKind = 'selection' | NgTableTone;

export interface NgTableScrollMarker {
  /** Position dans la liste, en pourcentage de sa hauteur (0 : première ligne). */
  top: number;
  kind: NgTableMarkerKind;
}

/** À position égale, le repère le plus important l'emporte. */
const PRIORITY: Record<NgTableMarkerKind, number> = {neutral: 0, selection: 1, info: 2, success: 3, warning: 4, danger: 5};

/**
 * Repères à dessiner pour une liste de `count` éléments. La hauteur est découpée en `slots` cases : des milliers de
 * lignes marquées ne donnent jamais plus de `slots` traits, et chaque case garde le repère le plus important.
 */
export function buildScrollMarkers(count: number, marks: Iterable<{index: number; kind: NgTableMarkerKind}>, slots = 200): NgTableScrollMarker[] {
  if (count <= 0 || slots <= 0) {
    return [];
  }
  const size = Math.min(slots, count);
  const bySlot = new Array<NgTableMarkerKind | undefined>(size);
  for (const {index, kind} of marks) {
    if (index < 0 || index >= count) {
      continue;
    }
    const slot = Math.min(size - 1, Math.floor((index / count) * size));
    const current = bySlot[slot];
    if (current === undefined || PRIORITY[kind] > PRIORITY[current]) {
      bySlot[slot] = kind;
    }
  }
  const markers: NgTableScrollMarker[] = [];
  for (let slot = 0; slot < size; slot++) {
    const kind = bySlot[slot];
    if (kind !== undefined) {
      markers.push({top: (slot / size) * 100, kind});
    }
  }
  return markers;
}
