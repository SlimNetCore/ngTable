/**
 * Actions de la barre flottante de sélection : déclaration, règles métier (nombre de lignes, prédicat sur les lignes
 * sélectionnées) et résolution de l'état de chaque action pour une sélection donnée. Fonctions pures, sans Angular.
 */

/** Une action proposée quand des lignes sont sélectionnées. */
export interface NgTableSelectionAction<T> {
  /** Identifiant, repris dans `(selectionAction)`. */
  id: string;
  label: string;
  /** Nom d'une icône de `ng-table-icon` (`'delete'`, `'download'`, `'check'`...). */
  icon?: string;
  /** `primary` : bouton plein (l'action principale) ; `danger` : action destructrice ; `default` : discrète. */
  appearance?: 'default' | 'primary' | 'danger';
  /** Nombre minimal de lignes sélectionnées (défaut : 1). */
  minRows?: number;
  /** Nombre maximal de lignes sélectionnées (ex. 1 pour « Modifier »). */
  maxRows?: number;
  /**
   * Règle métier sur la sélection : l'action n'est possible que si elle renvoie `true` (ex. toutes les commandes sont au
   * statut « Brouillon »).
   */
  when?: (rows: readonly T[]) => boolean;
  /**
   * Que faire quand la règle n'est pas respectée : `'hide'` (défaut) retire l'action de la barre, `'disable'` la grise et
   * affiche `disabledReason` en info-bulle.
   */
  otherwise?: 'hide' | 'disable';
  /** Explication affichée quand l'action est grisée (texte, ou fonction de la sélection). */
  disabledReason?: string | ((rows: readonly T[]) => string);
  /** Exécutée au clic, en plus de `(selectionAction)`. */
  run?: (rows: readonly T[]) => void;
}

/** Ce que reçoit `(selectionAction)`. */
export interface NgTableSelectionActionEvent<T> {
  action: NgTableSelectionAction<T>;
  rows: T[];
}

/** Contexte du gabarit `[selectionBarTemplate]` (contenu libre de la barre). */
export interface NgTableSelectionBarContext<T> {
  $implicit: readonly T[];
  rows: readonly T[];
  count: number;
  /** Désélectionne tout. */
  clear: () => void;
}

export interface ResolvedSelectionAction<T> {
  action: NgTableSelectionAction<T>;
  enabled: boolean;
  /** Pourquoi l'action est grisée (vide si elle est active). */
  reason: string;
}

/** Texte d'une action grisée : celui de l'action, sinon une explication déduite du nombre de lignes. */
function reasonFor<T>(action: NgTableSelectionAction<T>, rows: readonly T[], fallback: string): string {
  const reason = typeof action.disabledReason === 'function' ? action.disabledReason(rows) : action.disabledReason;
  return reason ?? fallback;
}

/**
 * État de chaque action pour la sélection `rows` : les actions masquées sont retirées, les actions grisées portent leur
 * raison. L'ordre déclaré est conservé. Une règle `when` qui lève une exception est traitée comme non respectée.
 */
export function resolveSelectionActions<T>(actions: readonly NgTableSelectionAction<T>[], rows: readonly T[]): ResolvedSelectionAction<T>[] {
  const resolved: ResolvedSelectionAction<T>[] = [];
  for (const action of actions) {
    const min = action.minRows ?? 1;
    const max = action.maxRows ?? Number.POSITIVE_INFINITY;
    let reason = '';
    let allowed = true;
    if (rows.length < min) {
      allowed = false;
      reason = reasonFor(action, rows, min === 1 ? 'Sélectionnez au moins une ligne' : `Sélectionnez au moins ${min} lignes`);
    } else if (rows.length > max) {
      allowed = false;
      reason = reasonFor(action, rows, max === 1 ? 'Disponible pour une seule ligne' : `Disponible jusqu'à ${max} lignes`);
    } else if (action.when) {
      let ok = false;
      try {
        ok = action.when(rows);
      } catch {
        ok = false;
      }
      if (!ok) {
        allowed = false;
        reason = reasonFor(action, rows, 'Non disponible pour cette sélection');
      }
    }
    if (allowed) {
      resolved.push({action, enabled: true, reason: ''});
    } else if (action.otherwise === 'disable') {
      resolved.push({action, enabled: false, reason});
    }
  }
  return resolved;
}
