/**
 * En-têtes de colonnes groupés (équivalent des « column groups » d'AG Grid) : une ligne
 * d'en-tête supplémentaire par niveau de groupe, au-dessus de celle des colonnes. Les
 * colonnes voisines d'un même groupe sont fusionnées en une cellule à `colspan`.
 * Fonctions pures, sans dépendance Angular.
 */

/** Une colonne affichée, vue par la construction des groupes. */
export interface HeaderGroupItem {
  /** Id de la colonne affichée (colonne de données, sélection, espacement...). */
  id: string;
  /** Chemin de groupes, du plus externe au plus interne ; vide si la colonne n'a pas de groupe. */
  path: readonly string[];
  /** Colonne épinglée : un groupe ne s'étend jamais au-delà d'une limite d'épinglage. */
  pin?: 'left' | 'right';
}

/** Une cellule d'une ligne d'en-tête de groupe. */
export interface HeaderGroupRun {
  /** Identifiant de la définition de colonne Material de la cellule (unique dans la table). */
  key: string;
  /** Libellé du groupe, `''` pour une cellule vide (colonnes sans groupe à ce niveau). */
  label: string;
  /** Nombre de colonnes couvertes. */
  span: number;
  pin?: 'left' | 'right';
}

/** Une ligne d'en-tête de groupe : ses cellules, et leurs identifiants dans l'ordre. */
export interface HeaderGroupLevel {
  runs: HeaderGroupRun[];
  ids: string[];
}

/** Normalise `NgTableColumn.headerGroup` (texte ou chemin) en chemin sans libellé vide. */
export function headerGroupPath(value: string | readonly string[] | undefined): readonly string[] {
  if (value === undefined) {
    return [];
  }
  const path = typeof value === 'string' ? [value] : value;
  return path.filter((label) => label.trim() !== '');
}

/**
 * Lignes d'en-tête de groupe pour les colonnes affichées, de la plus externe à la plus
 * interne. Vide quand aucune colonne n'a de groupe : la table n'ajoute alors aucune ligne.
 *
 * Deux colonnes voisines partagent une cellule quand elles ont le même chemin jusqu'à ce
 * niveau, et le même côté d'épinglage (une cellule épinglée ne doit pas déborder sur des
 * colonnes qui défilent). Les colonnes sans groupe à ce niveau forment des cellules vides.
 */
export function buildHeaderGroupLevels(items: readonly HeaderGroupItem[]): HeaderGroupLevel[] {
  const depth = items.reduce((max, item) => Math.max(max, item.path.length), 0);
  const levels: HeaderGroupLevel[] = [];
  for (let level = 0; level < depth; level++) {
    const runs: HeaderGroupRun[] = [];
    let current: HeaderGroupRun | null = null;
    let currentPrefix = '';
    items.forEach((item, index) => {
      const label = item.path[level] ?? '';
      // Préfixe complet : deux groupes de même nom sous des parents différents restent distincts.
      const prefix = label === '' ? '' : item.path.slice(0, level + 1).join('\u0000');
      if (current && current.pin === item.pin && currentPrefix === prefix) {
        current.span++;
        return;
      }
      current = {key: `__hg_${level}_${index}`, label, span: 1, pin: item.pin};
      currentPrefix = prefix;
      runs.push(current);
    });
    levels.push({runs, ids: runs.map((run) => run.key)});
  }
  return levels;
}
