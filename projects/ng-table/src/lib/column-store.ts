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
 * Le magasin garde aussi, pour les filtres, les colonnes aux valeurs répétées sous forme de DICTIONNAIRE : la liste
 * des valeurs distinctes, et pour chaque ligne le numéro de sa valeur (2 octets). Un filtre se calcule alors une fois
 * par valeur distincte au lieu d'une fois par ligne.
 *
 * Sans dépendance Angular.
 */
import {SortDigits, sortDigits, sortKeyColumn} from './fast-sort';
import type {NgTableColumn} from './ng-table.component';

/** Colonnes gardées au plus pour un jeu de lignes (8 octets par ligne et par colonne). */
const MAX_COLUMNS = 8;
/** Au-delà de ce nombre de valeurs distinctes, une colonne n'est pas mise en dictionnaire. */
const MAX_DISTINCT = 4096;
/** En dessous de ce nombre de lignes, le filtrage ligne par ligne est déjà immédiat. */
const MIN_ROWS_FOR_DICTIONARY = 2000;

/** Colonne en dictionnaire : `values[codes[i]]` est la valeur de la ligne `i`. */
export interface ColumnDictionary {
  codes: Uint16Array;
  values: readonly unknown[];
}

export class ColumnStore<T> {
  private rows: readonly T[] | null = null;
  private collator: Intl.Collator | null = null;
  /** Par colonne : ses chiffres de tri, ou `null` si elle ne se range pas en nombres (types mêlés, NaN...). */
  private columns = new Map<NgTableColumn<T>, SortDigits | null>();
  /** Par colonne : son dictionnaire, ou `null` si elle a trop de valeurs distinctes. */
  private dictionaries = new Map<NgTableColumn<T>, ColumnDictionary | null>();
  /** Colonnes construites / relues depuis le cache, dictionnaires construits : pour les tests et le diagnostic. */
  readonly stats = {builds: 0, hits: 0, dictionaries: 0};

  /** La colonne est-elle déjà en cache pour ce jeu de lignes ? */
  has(rows: readonly T[], column: NgTableColumn<T>, collator: Intl.Collator): boolean {
    return this.rows === rows && this.collator === collator && this.columns.has(column);
  }

  /**
   * Chiffres de tri (sens croissant) de `column` pour toutes les lignes de `rows`, ou `null` quand
   * la colonne ne se range pas en nombres : l'appelant utilise alors le tri par comparaisons.
   */
  sortDigits(rows: readonly T[], column: NgTableColumn<T>, collator: Intl.Collator): SortDigits | null {
    this.sync(rows);
    if (this.collator !== collator) {
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

  /**
   * Dictionnaire des valeurs de `column` (celles de `valueAccessor`) pour toutes les lignes de `rows`, ou `null`
   * quand la colonne a trop de valeurs distinctes ou que le jeu de lignes est petit. Deux valeurs sont la même
   * quand elles sont égales au sens de `Map` : des objets (dates...) distincts comptent chacun pour une valeur.
   */
  dictionary(rows: readonly T[], column: NgTableColumn<T>): ColumnDictionary | null {
    this.sync(rows);
    const cached = this.dictionaries.get(column);
    if (cached !== undefined) {
      return cached;
    }
    const dictionary = rows.length >= MIN_ROWS_FOR_DICTIONARY ? buildDictionary(rows, column.valueAccessor) : null;
    if (dictionary) {
      this.stats.dictionaries++;
    }
    if (this.dictionaries.size >= MAX_COLUMNS * 2) {
      this.dictionaries.delete(this.dictionaries.keys().next().value as NgTableColumn<T>);
    }
    this.dictionaries.set(column, dictionary);
    return dictionary;
  }

  /** Un nouveau tableau de lignes vide tout. */
  private sync(rows: readonly T[]): void {
    if (this.rows !== rows) {
      this.rows = rows;
      this.columns = new Map();
      this.dictionaries = new Map();
    }
  }

  /** Oublie toutes les colonnes (libère la mémoire). */
  clear(): void {
    this.rows = null;
    this.collator = null;
    this.columns = new Map();
    this.dictionaries = new Map();
  }
}

/** Dictionnaire d'une colonne, ou `null` dès que le nombre de valeurs distinctes dépasse la limite (lecture arrêtée là). */
function buildDictionary<T>(rows: readonly T[], read: (row: T) => unknown): ColumnDictionary | null {
  const codeOf = new Map<unknown, number>();
  const values: unknown[] = [];
  const codes = new Uint16Array(rows.length);
  for (let i = 0; i < rows.length; i++) {
    const value = read(rows[i]);
    let code = codeOf.get(value);
    if (code === undefined) {
      if (values.length >= MAX_DISTINCT) {
        return null;
      }
      code = values.length;
      codeOf.set(value, code);
      values.push(value);
    }
    codes[i] = code;
  }
  return {codes, values};
}
