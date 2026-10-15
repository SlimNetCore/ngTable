package com.example.ngtable;

import jakarta.persistence.EntityManager;
import jakarta.persistence.Tuple;
import jakarta.persistence.criteria.CriteriaBuilder;
import jakarta.persistence.criteria.CriteriaQuery;
import jakarta.persistence.criteria.Expression;
import jakarta.persistence.criteria.Path;
import jakarta.persistence.criteria.Root;
import jakarta.persistence.criteria.Selection;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.BiFunction;
import java.util.function.Function;

/**
 * Calcule un pivot dans la base : une seule requête {@code GROUP BY} sur les champs en lignes et en colonnes,
 * avec somme, nombre, minimum et maximum de chaque mesure. Les totaux de ligne, le total général et les
 * moyennes sont ensuite recombinés ici à partir de ces agrégats (une moyenne n'est jamais une moyenne de
 * moyennes). Les filtres et la recherche de la table sont ceux de {@link NgTableJpaSearch}.
 *
 * @param <E> entité
 */
public class NgTablePivotSearch<E> {

  /** Nombre maximal de groupes renvoyés par la base : au-delà, le pivot n'est plus lisible. */
  static final int MAX_GROUPS = 20_000;
  private static final Set<String> AGGREGATES = Set.of("sum", "avg", "min", "max", "count");

  /** Un champ qui peut servir de ligne ou de colonne : l'expression SQL, et le texte affiché pour sa valeur. */
  public record Dimension<E>(String id, BiFunction<CriteriaBuilder, Root<E>, Expression<?>> expression, Function<Object, String> label) {

    /** Dimension sur un attribut, affiché par {@code toString} ({@code ""} si vide). */
    public static <E> Dimension<E> of(String id, String attribute) {
      return new Dimension<>(id, (cb, root) -> root.get(attribute), value -> value == null ? "" : value.toString());
    }

    public static <E> Dimension<E> of(String id, String attribute, Function<Object, String> label) {
      return new Dimension<>(id, (cb, root) -> root.get(attribute), label);
    }
  }

  /** Un attribut numérique qu'on peut agréger. */
  public record Measure(String id, String attribute) {
  }

  private final EntityManager em;
  private final Class<E> entity;
  private final NgTableJpaSearch<E> search;
  private final Map<String, Dimension<E>> dimensions = new LinkedHashMap<>();
  private final Map<String, Measure> measures = new LinkedHashMap<>();

  public NgTablePivotSearch(EntityManager em, Class<E> entity, NgTableJpaSearch<E> search,
                            List<Dimension<E>> dimensions, List<Measure> measures) {
    this.em = em;
    this.entity = entity;
    this.search = search;
    dimensions.forEach(dimension -> this.dimensions.put(dimension.id(), dimension));
    measures.forEach(measure -> this.measures.put(measure.id(), measure));
  }

  /** Ce que le pivot a retenu d'un groupe de lignes, de quoi calculer n'importe quel agrégat. */
  private static final class Accumulator {
    long rows;
    long count;
    BigDecimal sum = BigDecimal.ZERO;
    BigDecimal min;
    BigDecimal max;

    void add(long rows, long count, BigDecimal sum, BigDecimal min, BigDecimal max) {
      this.rows += rows;
      this.count += count;
      if (sum != null) {
        this.sum = this.sum.add(sum);
      }
      this.min = pick(this.min, min, true);
      this.max = pick(this.max, max, false);
    }

    void merge(Accumulator other) {
      add(other.rows, other.count, other.sum, other.min, other.max);
    }

    private static BigDecimal pick(BigDecimal current, BigDecimal candidate, boolean smallest) {
      if (candidate == null) {
        return current;
      }
      if (current == null) {
        return candidate;
      }
      return (candidate.compareTo(current) < 0) == smallest ? candidate : current;
    }

    BigDecimal result(String aggregate) {
      return switch (aggregate) {
        case "count" -> BigDecimal.valueOf(rows);
        case "sum" -> count == 0 ? null : sum;
        case "avg" -> count == 0 ? null : sum.divide(BigDecimal.valueOf(count), 4, RoundingMode.HALF_UP).stripTrailingZeros();
        case "min" -> min;
        case "max" -> max;
        default -> throw new IllegalArgumentException("Agrégat inconnu : " + aggregate);
      };
    }
  }

  public NgTablePivot.Result pivot(NgTablePivot.Request request) {
    List<Dimension<E>> rowDimensions = request.rows().stream().map(id -> dimension(id)).toList();
    List<Dimension<E>> columnDimensions = request.columns().stream().map(id -> dimension(id)).toList();
    if (request.values().isEmpty()) {
      throw new IllegalArgumentException("Au moins une valeur à agréger est attendue");
    }
    List<Measure> valueMeasures = new ArrayList<>();
    for (NgTablePivot.Value value : request.values()) {
      if (!AGGREGATES.contains(value.aggregate())) {
        throw new IllegalArgumentException("Agrégat inconnu : " + value.aggregate());
      }
      Measure measure = measures.get(value.id());
      if (measure == null) {
        throw new IllegalArgumentException("Valeur non agrégeable : " + value.id());
      }
      valueMeasures.add(measure);
    }

    CriteriaBuilder cb = em.getCriteriaBuilder();
    CriteriaQuery<Tuple> cq = cb.createTupleQuery();
    Root<E> root = cq.from(entity);
    List<Expression<?>> groupBy = new ArrayList<>();
    List<Selection<?>> selections = new ArrayList<>();
    for (Dimension<E> dimension : concat(rowDimensions, columnDimensions)) {
      Expression<?> expression = dimension.expression().apply(cb, root);
      groupBy.add(expression);
      selections.add(expression);
    }
    selections.add(cb.count(root));
    for (Measure measure : valueMeasures) {
      Path<BigDecimal> path = root.get(measure.attribute());
      selections.add(cb.sum(path));
      selections.add(cb.count(path));
      selections.add(cb.min(path));
      selections.add(cb.max(path));
    }
    cq.multiselect(selections)
        .where(search.filterPredicate(new NgTable.Query(null, null, request.filters(), null, request.search(), null, null), cb, root))
        .groupBy(groupBy);
    List<Tuple> groups = em.createQuery(cq).setMaxResults(MAX_GROUPS + 1).getResultList();
    if (groups.size() > MAX_GROUPS) {
      throw new IllegalArgumentException("Trop de combinaisons (plus de " + MAX_GROUPS + ") : réduisez les champs en lignes ou en colonnes");
    }

    int rowCount = rowDimensions.size();
    int dimensionCount = rowCount + columnDimensions.size();
    Map<List<String>, Map<List<String>, Accumulator[]>> byRow = new LinkedHashMap<>();
    for (Tuple tuple : groups) {
      List<String> labels = new ArrayList<>(rowCount);
      List<String> path = new ArrayList<>(columnDimensions.size());
      for (int i = 0; i < dimensionCount; i++) {
        String label = (i < rowCount ? rowDimensions.get(i) : columnDimensions.get(i - rowCount)).label().apply(tuple.get(i));
        (i < rowCount ? labels : path).add(label);
      }
      long rows = tuple.get(dimensionCount, Long.class);
      Accumulator[] cells = byRow.computeIfAbsent(labels, key -> new LinkedHashMap<>())
          .computeIfAbsent(path, key -> newAccumulators(valueMeasures.size()));
      for (int m = 0; m < valueMeasures.size(); m++) {
        int base = dimensionCount + 1 + m * 4;
        cells[m].add(rows, tuple.get(base + 1, Long.class), tuple.get(base, BigDecimal.class),
            tuple.get(base + 2, BigDecimal.class), tuple.get(base + 3, BigDecimal.class));
      }
    }

    int direction = "desc".equals(request.columnSort()) ? -1 : 1;
    Comparator<List<String>> byPath = (a, b) -> direction * compareLists(a, b);
    List<List<String>> columns = byRow.values().stream().flatMap(cells -> cells.keySet().stream()).distinct().sorted(byPath).toList();
    if (columnDimensions.isEmpty() && columns.isEmpty() && !byRow.isEmpty()) {
      columns = List.of(List.of());
    }

    List<NgTablePivot.Row> rows = new ArrayList<>();
    Map<List<String>, Accumulator[]> grandByColumn = new LinkedHashMap<>();
    byRow.entrySet().stream().sorted(Map.Entry.comparingByKey(NgTablePivotSearch::compareLists)).forEach(entry -> {
      Accumulator[] rowTotals = newAccumulators(valueMeasures.size());
      Map<String, Map<String, BigDecimal>> cells = new LinkedHashMap<>();
      for (Map.Entry<List<String>, Accumulator[]> cell : entry.getValue().entrySet()) {
        cells.put(String.join(NgTablePivot.PATH_SEPARATOR, cell.getKey()), results(cell.getValue(), request.values()));
        merge(rowTotals, cell.getValue());
        merge(grandByColumn.computeIfAbsent(cell.getKey(), key -> newAccumulators(valueMeasures.size())), cell.getValue());
      }
      rows.add(new NgTablePivot.Row(entry.getKey(), cells, results(rowTotals, request.values())));
    });

    NgTablePivot.Total grandTotal = null;
    if (!rows.isEmpty()) {
      Accumulator[] total = newAccumulators(valueMeasures.size());
      Map<String, Map<String, BigDecimal>> cells = new LinkedHashMap<>();
      for (Map.Entry<List<String>, Accumulator[]> cell : grandByColumn.entrySet()) {
        cells.put(String.join(NgTablePivot.PATH_SEPARATOR, cell.getKey()), results(cell.getValue(), request.values()));
        merge(total, cell.getValue());
      }
      grandTotal = new NgTablePivot.Total(cells, results(total, request.values()));
    }
    return new NgTablePivot.Result(columns, rows, grandTotal);
  }

  private Dimension<E> dimension(String id) {
    Dimension<E> dimension = dimensions.get(id);
    if (dimension == null) {
      throw new IllegalArgumentException("Champ inconnu pour un pivot : " + id);
    }
    return dimension;
  }

  private static <T> List<T> concat(List<T> first, List<T> second) {
    List<T> all = new ArrayList<>(first);
    all.addAll(second);
    return all;
  }

  private static Accumulator[] newAccumulators(int count) {
    Accumulator[] accumulators = new Accumulator[count];
    for (int i = 0; i < count; i++) {
      accumulators[i] = new Accumulator();
    }
    return accumulators;
  }

  private static void merge(Accumulator[] into, Accumulator[] from) {
    for (int i = 0; i < into.length; i++) {
      into[i].merge(from[i]);
    }
  }

  /** {@code identifiant de la valeur -> agrégat demandé}. */
  private static Map<String, BigDecimal> results(Accumulator[] accumulators, List<NgTablePivot.Value> values) {
    Map<String, BigDecimal> results = new LinkedHashMap<>();
    for (int i = 0; i < accumulators.length; i++) {
      results.put(values.get(i).id(), accumulators[i].result(values.get(i).aggregate()));
    }
    return results;
  }

  private static int compareLists(List<String> a, List<String> b) {
    for (int i = 0; i < Math.min(a.size(), b.size()); i++) {
      int compared = natural(a.get(i), b.get(i));
      if (compared != 0) {
        return compared;
      }
    }
    return Integer.compare(a.size(), b.size());
  }

  /** Ordre « naturel » : les suites de chiffres se comparent comme des nombres, la casse est ignorée. */
  static int natural(String a, String b) {
    int i = 0;
    int j = 0;
    while (i < a.length() && j < b.length()) {
      char ca = a.charAt(i);
      char cb = b.charAt(j);
      if (Character.isDigit(ca) && Character.isDigit(cb)) {
        int endA = i;
        while (endA < a.length() && Character.isDigit(a.charAt(endA))) {
          endA++;
        }
        int endB = j;
        while (endB < b.length() && Character.isDigit(b.charAt(endB))) {
          endB++;
        }
        int compared = new java.math.BigInteger(a.substring(i, endA)).compareTo(new java.math.BigInteger(b.substring(j, endB)));
        if (compared != 0) {
          return compared;
        }
        i = endA;
        j = endB;
      } else {
        int compared = Character.compare(Character.toLowerCase(ca), Character.toLowerCase(cb));
        if (compared != 0) {
          return compared;
        }
        i++;
        j++;
      }
    }
    return Integer.compare(a.length() - i, b.length() - j);
  }
}
