package com.example.ngtable;

/**
 * Ce que le serveur autorise pour une colonne de la table. Seules les colonnes déclarées
 * peuvent être triées, filtrées, cherchées ou regroupées : les identifiants envoyés par
 * le navigateur ne sont jamais utilisés tels quels dans une requête.
 */
public final class NgTableColumn {

  /** Doit correspondre au {@code filter.type} de la colonne côté Angular. */
  public enum Filter {
    NONE,
    /** {@code text}, {@code search}, {@code email}... : comparaison insensible à la casse. */
    TEXT,
    /** {@code enum} (valeurs séparées par des virgules) ou {@code select} (une valeur). */
    ENUM,
    /** {@code boolean} : {@code "true"} / {@code "false"}. */
    BOOLEAN,
    /** {@code number} ({@code 42}, {@code >100}, {@code <=50}, {@code !=0}, {@code 10..50}) ou {@code numberRange} ({@code min..max}). */
    NUMBER,
    /** {@code date} ({@code YYYY-MM-DD}) ou {@code range} ({@code YYYY-MM-DD..YYYY-MM-DD}, une borne peut être vide). */
    DATE
  }

  /** Doit correspondre au {@code filter.operator} de la colonne côté Angular (défaut : CONTAINS). */
  public enum TextOperator { CONTAINS, EQUALS, STARTS_WITH, ENDS_WITH }

  /** Agrégat affiché dans les en-têtes de groupe (même valeur que {@code aggregate} côté Angular). */
  public enum Aggregate { SUM, AVG, MIN, MAX, COUNT }

  final String id;
  final String attribute;
  Filter filter = Filter.NONE;
  TextOperator textOperator = TextOperator.CONTAINS;
  boolean sortable;
  boolean searchable;
  boolean groupable;
  Aggregate aggregate;

  private NgTableColumn(String id, String attribute) {
    this.id = id;
    this.attribute = attribute;
  }

  /** Colonne dont l'id Angular est aussi le nom de l'attribut JPA. */
  public static NgTableColumn of(String id) {
    return new NgTableColumn(id, id);
  }

  /** Colonne mappée sur un autre attribut, éventuellement imbriqué ({@code "client.nom"}). */
  public static NgTableColumn of(String id, String attribute) {
    return new NgTableColumn(id, attribute);
  }

  public NgTableColumn filter(Filter filter) {
    this.filter = filter;
    return this;
  }

  public NgTableColumn text(TextOperator operator) {
    this.filter = Filter.TEXT;
    this.textOperator = operator;
    return this;
  }

  public NgTableColumn sortable() {
    this.sortable = true;
    return this;
  }

  /** Incluse dans la recherche globale ({@code column.searchable} côté Angular). */
  public NgTableColumn searchable() {
    this.searchable = true;
    return this;
  }

  /** Proposée dans le menu « Grouper ». Réservez-le aux enums, textes, booléens et {@code LocalDate}. */
  public NgTableColumn groupable() {
    this.groupable = true;
    return this;
  }

  public NgTableColumn aggregate(Aggregate aggregate) {
    this.aggregate = aggregate;
    return this;
  }
}
