package com.example.ngtable;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

/**
 * Contrat JSON du pivot de {@code <ng-table-pivot [datasource]>} : ce que la table demande, et ce qu'elle
 * attend en retour. Les champs sont désignés par leur identifiant, jamais par un nom de colonne SQL.
 */
public final class NgTablePivot {

  /** Séparateur des valeurs d'un chemin de colonne dans une clé de {@code cells} (même valeur que côté Angular). */
  public static final String PATH_SEPARATOR = "\u001f";

  private NgTablePivot() {
  }

  /**
   * @param rows    champs en lignes, du plus externe au plus interne
   * @param columns champs en colonnes, du plus externe au plus interne (vide : aucune colonne pivot)
   * @param filters filtres de la table (colonne -> saisie), pour pivoter les mêmes lignes qu'elle affiche
   */
  public record Request(
      List<String> rows,
      List<String> columns,
      List<Value> values,
      String columnSort,
      Map<String, String> filters,
      String search) {

    public Request {
      rows = rows != null ? rows : List.of();
      columns = columns != null ? columns : List.of();
      values = values != null ? values : List.of();
      columnSort = "desc".equalsIgnoreCase(columnSort) ? "desc" : "asc";
      filters = filters != null ? filters : Map.of();
      search = search != null ? search : "";
    }
  }

  /** Une valeur à agréger : {@code sum}, {@code avg}, {@code min}, {@code max} ou {@code count}. */
  public record Value(String id, String aggregate) {

    public Value {
      aggregate = aggregate != null ? aggregate.toLowerCase() : "sum";
    }
  }

  /**
   * Une ligne du pivot.
   *
   * @param cells  {@code cells[clé du chemin de colonne][identifiant de la valeur]}
   * @param totals total de la ligne pour chaque valeur, toutes colonnes confondues
   */
  public record Row(List<String> labels, Map<String, Map<String, BigDecimal>> cells, Map<String, BigDecimal> totals) {
  }

  /** La ligne de total général. */
  public record Total(Map<String, Map<String, BigDecimal>> cells, Map<String, BigDecimal> totals) {
  }

  /** @param columns les chemins de colonne (une valeur par champ en colonne), dans l'ordre d'affichage */
  public record Result(List<List<String>> columns, List<Row> rows, Total grandTotal) {
  }
}
