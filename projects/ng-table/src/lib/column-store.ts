/**
 * Stockage en colonnes : les valeurs de tri d'une colonne, lues une fois pour toutes les lignes et
 * gardées sous une forme compacte (deux `Uint32Array`, 8 octets par ligne), au lieu d'être relues
 * par les accesseurs à chaque tri.
 *
 * Tant que le jeu de lignes ne change pas, un nouveau tri sur la même colonne ne rappelle donc ni
 * `valueAccessor`, ni le classement des textes : il ne reste que les passes du tri par base. Cela
 * couvre l'inversion du sens (mêmes chiffres, lus en complément), le tri relancé après un changement
 * de filtre, et l'ajout d'un niveau de tri.
 *
 * Les colonnes sont liées au tableau de lignes par son identité : un nouveau tableau (nouvelles
 * données, transaction) vide le cache. Une ligne modifiée sur place, sans nouveau tableau, n'est pas
 * vue ; c'est déjà la règle du reste de la table (lignes immuables).
 *
 * Sans dépendance Angular.
 */
import {SortDigits, sortDigits, sortKeyColumn} from './fast-sort';
import type {NgTableColumn} from './ng-table.component';

/** Colonnes gardées au plus pour un jeu de lignes (8 octets par ligne et par colonne). */
const MAX_COLUMNS = 8;

export class ColumnStore<T> {
  private rows: readonly T[] | null = null;
  private collator: Intl.Collator | null = null;
  /** Par colonne : ses chiffres de tri, ou `null` si elle ne se range pas en nombres (types mêlés, NaN...). */
  private columns = new Map<NgTableColumn<T>, SortDigits | null>();
  /** Colonnes construites / relues depuis le cache : pour les tests et le diagnostic. */
  readonly stats = {builds: 0, hits: 0};

  /** La colonne est-elle déjà en cache pour ce jeu de lignes ? */
  has(rows: readonly T[], column: NgTableColumn<T>, collator: Intl.Collator): boolean {
    return this.rows === rows && this.collator === collator && this.columns.has(column);
  }

  /**
   * Chiffres de tri (sens croissant) de `column` pour toutes les lignes de `rows`, ou `null` quand
   * la colonne ne se range pas en nombres : l'appelant utilise alors le tri par comparaisons.
   */
  sortDigits(rows: readonly T[], column: NgTableColumn<T>, collator: Intl.Collator): SortDigits | null {
    if (this.rows !== rows || this.collator !== collator) {
      this.rows = rows;
      this.collator = collator;
      this.columns = new Map();
    }
    const cached = this.columns.get(column);
    if (cached !== undefined) {
      this.stats.hits++;
      // Remise en fin de liste : la colonne la moins récemment utilisée est écartée en premier.
      this.columns.delete(column);
      this.columns.set(column, cached);
      return cached;
    }
    this.stats.builds++;
    const keys = sortKeyColumn(rows, {column, factor: 1}, collator);
    const digits = keys ? sortDigits(keys) : null;
    if (this.columns.size >= MAX_COLUMNS) {
      this.columns.delete(this.columns.keys().next().value as NgTableColumn<T>);
    }
    this.columns.set(column, digits);
    return digits;
  }

  /** Oublie toutes les colonnes (libère la mémoire). */
  clear(): void {
    this.rows = null;
    this.collator = null;
    this.columns = new Map();
  }
}
