import {signal} from '@angular/core';

/** Type de donnée posé dans `DataTransfer` quand on glisse l'en-tête d'une colonne de `ng-table`. */
export const NG_TABLE_COLUMN_DRAG_TYPE = 'application/x-ng-table-column';

/**
 * Identifiant de la colonne de `ng-table` glissée en ce moment, ou `null`. Le navigateur cache le contenu
 * d'un glisser-déposer jusqu'au dépôt : ce signal permet à une zone de dépôt (celles du pivot) de savoir
 * dès le survol si elle accepte la colonne.
 */
export const draggedTableColumn = signal<string | null>(null);
