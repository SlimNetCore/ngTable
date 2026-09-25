/** Petits utilitaires DOM du composant (mesure et sélecteurs), sans dépendance Angular. */

/** Échappe un id de colonne pour l'utiliser dans un sélecteur CSS (`.mat-column-<id>`). */
export function escapeCssToken(value: string): string {
  const raw = value ?? '';
  // `CSS.escape` gère correctement tous les cas (chiffre en tête, unicode...) ;
  // repli manuel pour les environnements qui ne l'exposent pas (certains jsdom).
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(raw);
  }
  return raw.replace(/[^a-zA-Z0-9_-]/g, (match) => `\\${match}`);
}

/**
 * Largeur naturelle du contenu d'un nœud, indépendamment de la largeur imposée à sa
 * colonne. On ne peut pas se contenter de `scrollWidth` : le nœud est déjà contraint,
 * et comme les cellules sont en `overflow: visible`, `scrollWidth` renvoie ~la largeur
 * de la boîte, pas celle du contenu — d'où un auto-fit systématiquement trop étroit.
 * On dé-contraint donc le nœud le temps d'une mesure, puis on restaure ses styles.
 */
export function measureNaturalWidth(node: HTMLElement): number {
  const previousWidth = node.style.width;
  const previousMaxWidth = node.style.maxWidth;
  const previousWhiteSpace = node.style.whiteSpace;

  node.style.width = 'max-content';
  node.style.maxWidth = 'none';
  node.style.whiteSpace = 'nowrap';

  const natural = Math.max(node.scrollWidth, node.getBoundingClientRect().width);

  node.style.width = previousWidth;
  node.style.maxWidth = previousMaxWidth;
  node.style.whiteSpace = previousWhiteSpace;

  return natural;
}
