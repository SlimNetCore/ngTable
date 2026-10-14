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

/**
 * Écrit un texte dans le presse-papiers : API asynchrone moderne (contexte sécurisé,
 * geste de l'utilisateur), sinon repli par un `<textarea>` et `execCommand('copy')`.
 * Rend le focus à l'élément qui l'avait. `false` si aucune des deux voies n'a marché.
 */
export async function writeClipboardText(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // refusé (permission, document sans focus) : on tente le repli
  }
  if (typeof document === 'undefined') {
    return false;
  }
  const previous = document.activeElement as HTMLElement | null;
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none';
  document.body.appendChild(area);
  try {
    area.select();
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    area.remove();
    previous?.focus?.({preventScroll: true});
  }
}
