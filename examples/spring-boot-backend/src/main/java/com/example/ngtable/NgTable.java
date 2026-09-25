package com.example.ngtable;

import java.util.List;
import java.util.Map;

/** Contrat JSON de @sbourahla/ng-table en mode remote. */
public final class NgTable {

  private NgTable() {
  }

  /** Corps de la requête : exactement ce qu'émet {@code (remoteQueryChange)}. */
  public record Query(
      Sort sort,
      List<Sort> sorts,
      Map<String, String> filters,
      Page page,
      String search,
      String groupBy,
      List<String> collapsedGroups) {

    public Query {
      // `sorts` porte tous les niveaux ; `sort` seul vient d'une ancienne version du client.
      List<Sort> levels = sorts != null ? sorts : sort != null ? List.of(sort) : List.of();
      sorts = levels.stream().filter(Sort::isActive).toList();
      filters = filters != null ? filters : Map.of();
      page = page != null ? page : new Page(0, 0);
      search = search != null ? search.trim() : "";
      groupBy = groupBy != null && !groupBy.isBlank() ? groupBy : null;
      collapsedGroups = collapsedGroups != null ? collapsedGroups : List.of();
    }
  }

  /** Un niveau de tri. {@code direction} vaut {@code "asc"}, {@code "desc"} ou {@code ""} (aucun tri). */
  public record Sort(String columnId, String direction) {

    boolean isActive() {
      return columnId != null && !columnId.isEmpty() && direction != null && !direction.isEmpty();
    }

    public boolean descending() {
      return "desc".equalsIgnoreCase(direction);
    }
  }

  /** {@code size = 0} : pagination désactivée côté client (toutes les lignes). */
  public record Page(int index, int size) {
  }

  /** Résumé d'un groupe, calculé sur tout le groupe (repliés compris). */
  public record GroupSummary(String key, long count, Map<String, Object> aggregates) {
  }

  /**
   * Réponse : la page de lignes, le total (groupes repliés exclus) et, si un regroupement
   * est demandé, TOUS les groupes dans l'ordre d'affichage.
   */
  public record Result<T>(List<T> rows, long total, List<GroupSummary> groupSummaries) {
  }

  /** Une colonne à exporter, telle qu'affichée par la table. */
  public record ExportColumn(String id, String header) {
  }

  /**
   * Corps de l'export : exactement ce qu'émet {@code (remoteExportRequested)}, c'est-à-dire la
   * requête courante plus les colonnes affichées (dans l'ordre), le format et le nom de fichier.
   */
  public record ExportRequest(
      Sort sort,
      List<Sort> sorts,
      Map<String, String> filters,
      Page page,
      String search,
      String groupBy,
      List<String> collapsedGroups,
      List<ExportColumn> columns,
      String format,
      String filename) {

    public ExportRequest {
      columns = columns != null ? columns : List.of();
      format = format != null ? format : "csv";
      filename = filename != null ? filename : "export";
    }

    /** La requête de la table (filtres, recherche, tri, regroupement). */
    public Query query() {
      return new Query(sort, sorts, filters, page, search, groupBy, collapsedGroups);
    }
  }
}
