package com.example.ngtable;

import jakarta.persistence.EntityManager;
import jakarta.persistence.Tuple;
import jakarta.persistence.TypedQuery;
import jakarta.persistence.criteria.CriteriaBuilder;
import jakarta.persistence.criteria.CriteriaQuery;
import jakarta.persistence.criteria.Expression;
import jakarta.persistence.criteria.Order;
import jakarta.persistence.criteria.Path;
import jakarta.persistence.criteria.Predicate;
import jakarta.persistence.criteria.Root;
import jakarta.persistence.criteria.Selection;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Exécute une {@link NgTable.Query} sur une entité JPA : filtres, recherche globale, tri,
 * regroupement (groupes repliés exclus), pagination et résumés de groupes. JPA Criteria
 * uniquement : fonctionne avec Spring Boot 3 et 4, quelle que soit la base.
 *
 * @param <E> entité
 */
public class NgTableJpaSearch<E> {

  private static final Pattern NUMBER_COMPARISON = Pattern.compile("^(>=|<=|!=|>|<|=)?\\s*(.+)$");

  private final EntityManager em;
  private final Class<E> entity;
  private final String idAttribute;
  private final Map<String, NgTableColumn> columns = new LinkedHashMap<>();
  private int maxPageSize = 500;

  /**
   * @param idAttribute attribut unique ajouté en dernier critère de tri : sans lui, deux
   *                    lignes à égalité peuvent changer de page d'une requête à l'autre
   */
  public NgTableJpaSearch(EntityManager em, Class<E> entity, String idAttribute, List<NgTableColumn> columns) {
    this.em = em;
    this.entity = entity;
    this.idAttribute = idAttribute;
    columns.forEach(column -> this.columns.put(column.id, column));
  }

  /** Taille de page maximale acceptée (500 par défaut). */
  public NgTableJpaSearch<E> maxPageSize(int maxPageSize) {
    this.maxPageSize = maxPageSize;
    return this;
  }

  public NgTable.Result<E> search(NgTable.Query query) {
    NgTable.Page page = query.page();
    if (page.size() <= 0 || page.size() > maxPageSize || page.index() < 0) {
      throw new IllegalArgumentException(
          "Taille de page attendue entre 1 et " + maxPageSize + " (activez la pagination côté Angular)");
    }
    NgTableColumn group = query.groupBy() == null ? null : column(query.groupBy(), c -> c.groupable, "regroupable");
    NgTable.Sort groupSort = group == null ? null : query.sorts().stream()
        .filter(sort -> sort.columnId().equals(group.id))
        .findFirst()
        .orElse(new NgTable.Sort(group.id, "asc"));

    CriteriaBuilder cb = em.getCriteriaBuilder();

    // 1. La page : triée d'abord par la colonne de regroupement, sans les groupes repliés.
    CriteriaQuery<E> rowsQuery = cb.createQuery(entity);
    Root<E> root = rowsQuery.from(entity);
    rowsQuery.where(where(query, group, true, cb, root));
    List<Order> orders = new ArrayList<>();
    if (group != null) {
      orders.add(order(cb, path(root, group.attribute), groupSort.descending()));
    }
    for (NgTable.Sort sort : query.sorts()) {
      if (group == null || !sort.columnId().equals(group.id)) {
        NgTableColumn column = column(sort.columnId(), c -> c.sortable, "triable");
        orders.add(order(cb, path(root, column.attribute), sort.descending()));
      }
    }
    orders.add(cb.asc(root.get(idAttribute)));
    rowsQuery.orderBy(orders);
    TypedQuery<E> typed = em.createQuery(rowsQuery)
        .setFirstResult(page.index() * page.size())
        .setMaxResults(page.size());
    List<E> rows = typed.getResultList();

    // 2. Le total : lignes des groupes dépliés seulement (c'est ce que pagine la table).
    CriteriaQuery<Long> countQuery = cb.createQuery(Long.class);
    Root<E> countRoot = countQuery.from(entity);
    countQuery.select(cb.count(countRoot)).where(where(query, group, true, cb, countRoot));
    long total = em.createQuery(countQuery).getSingleResult();

    // 3. Les résumés : TOUS les groupes (repliés compris), dans le même ordre que les lignes.
    List<NgTable.GroupSummary> summaries = group == null ? null : summaries(query, group, groupSort.descending());
    return new NgTable.Result<>(rows, total, summaries);
  }

  private List<NgTable.GroupSummary> summaries(NgTable.Query query, NgTableColumn group, boolean descending) {
    CriteriaBuilder cb = em.getCriteriaBuilder();
    CriteriaQuery<Tuple> cq = cb.createTupleQuery();
    Root<E> root = cq.from(entity);
    Path<Object> key = path(root, group.attribute);
    List<NgTableColumn> aggregated = columns.values().stream().filter(c -> c.aggregate != null).toList();
    List<Selection<?>> selections = new ArrayList<>(List.of(key, cb.count(root)));
    for (NgTableColumn column : aggregated) {
      selections.add(aggregate(cb, path(root, column.attribute), column.aggregate));
    }
    cq.multiselect(selections)
        .where(where(query, group, false, cb, root))
        .groupBy(key)
        .orderBy(order(cb, key, descending));

    List<NgTable.GroupSummary> summaries = new ArrayList<>();
    for (Tuple tuple : em.createQuery(cq).getResultList()) {
      Map<String, Object> aggregates = new LinkedHashMap<>();
      for (int i = 0; i < aggregated.size(); i++) {
        aggregates.put(aggregated.get(i).id, tuple.get(i + 2));
      }
      summaries.add(new NgTable.GroupSummary(groupKey(tuple.get(0)), tuple.get(1, Long.class), aggregates));
    }
    return summaries;
  }

  private Predicate where(NgTable.Query query, NgTableColumn group, boolean excludeCollapsed, CriteriaBuilder cb, Root<E> root) {
    List<Predicate> predicates = new ArrayList<>();
    query.filters().forEach((columnId, value) -> {
      if (value != null && !value.isBlank()) {
        NgTableColumn column = column(columnId, c -> c.filter != NgTableColumn.Filter.NONE, "filtrable");
        predicates.add(filter(column, value.trim(), cb, path(root, column.attribute)));
      }
    });

    // Recherche globale : chaque mot doit apparaître dans au moins une colonne cherchable.
    List<NgTableColumn> searchable = columns.values().stream().filter(c -> c.searchable).toList();
    for (String term : query.search().toLowerCase(Locale.ROOT).split("\\s+")) {
      if (!term.isEmpty() && !searchable.isEmpty()) {
        String pattern = "%" + escapeLike(term) + "%";
        predicates.add(cb.or(searchable.stream()
            .map(c -> cb.like(cb.lower(path(root, c.attribute).as(String.class)), pattern, '\\'))
            .toArray(Predicate[]::new)));
      }
    }

    if (excludeCollapsed && group != null && !query.collapsedGroups().isEmpty()) {
      predicates.add(notCollapsed(query.collapsedGroups(), cb, path(root, group.attribute)));
    }
    return cb.and(predicates.toArray(Predicate[]::new));
  }

  /** Exclut les groupes repliés. La clé {@code ""} désigne le groupe des valeurs vides (NULL). */
  private Predicate notCollapsed(List<String> keys, CriteriaBuilder cb, Path<Object> path) {
    boolean emptyCollapsed = keys.contains("");
    List<Object> values = keys.stream().filter(key -> !key.isEmpty()).map(key -> convert(path.getJavaType(), key)).toList();
    // `NOT IN` écarterait aussi les NULL : on les garde ou on les écarte explicitement.
    Predicate notIn = values.isEmpty() ? cb.conjunction() : cb.not(path.in(values));
    return emptyCollapsed ? cb.and(cb.isNotNull(path), notIn) : cb.or(cb.isNull(path), notIn);
  }

  @SuppressWarnings("unchecked")
  private Predicate filter(NgTableColumn column, String value, CriteriaBuilder cb, Path<Object> path) {
    return switch (column.filter) {
      case TEXT -> {
        String escaped = escapeLike(value.toLowerCase(Locale.ROOT));
        String pattern = switch (column.textOperator) {
          case EQUALS -> escaped;
          case STARTS_WITH -> escaped + "%";
          case ENDS_WITH -> "%" + escaped;
          case CONTAINS -> "%" + escaped + "%";
        };
        yield cb.like(cb.lower(path.as(String.class)), pattern, '\\');
      }
      case ENUM -> path.in(Arrays.stream(value.split(","))
          .map(String::trim)
          .filter(part -> !part.isEmpty())
          .map(part -> convert(path.getJavaType(), part))
          .toList());
      case BOOLEAN -> cb.equal(path, "true".equalsIgnoreCase(value) || "1".equals(value));
      case NUMBER -> numberFilter(value, cb, (Expression<? extends Number>) (Expression<?>) path, path);
      case DATE -> dateFilter(value, cb, path);
      case NONE -> cb.conjunction();
    };
  }

  /** {@code 42}, {@code =42}, {@code !=42}, {@code >42}, {@code >=42}, {@code <42}, {@code <=42}, {@code 10..50}. */
  private Predicate numberFilter(String value, CriteriaBuilder cb, Expression<? extends Number> number, Path<Object> path) {
    if (value.contains("..")) {
      String[] bounds = value.split("\\.\\.", 2);
      BigDecimal min = parseNumber(bounds[0]);
      BigDecimal max = bounds.length > 1 ? parseNumber(bounds[1]) : null;
      List<Predicate> predicates = new ArrayList<>();
      if (min != null) {
        predicates.add(cb.ge(number, min));
      }
      if (max != null) {
        predicates.add(cb.le(number, max));
      }
      return cb.and(predicates.toArray(Predicate[]::new));
    }
    Matcher matcher = NUMBER_COMPARISON.matcher(value);
    BigDecimal expected = matcher.matches() ? parseNumber(matcher.group(2)) : null;
    if (expected == null) {
      // Saisie qui n'est pas un nombre : recherche textuelle, comme la table en mode local.
      return cb.like(cb.lower(path.as(String.class)), "%" + escapeLike(value.toLowerCase(Locale.ROOT)) + "%", '\\');
    }
    String operator = matcher.group(1) == null ? "=" : matcher.group(1);
    return switch (operator) {
      case ">" -> cb.gt(number, expected);
      case ">=" -> cb.ge(number, expected);
      case "<" -> cb.lt(number, expected);
      case "<=" -> cb.le(number, expected);
      case "!=" -> cb.or(cb.lt(number, expected), cb.gt(number, expected));
      default -> cb.and(cb.ge(number, expected), cb.le(number, expected));
    };
  }

  /** {@code YYYY-MM-DD} (un jour) ou {@code YYYY-MM-DD..YYYY-MM-DD} (bornes incluses, une borne peut être vide). */
  @SuppressWarnings("unchecked")
  private Predicate dateFilter(String value, CriteriaBuilder cb, Path<Object> path) {
    String[] bounds = value.contains("..") ? value.split("\\.\\.", 2) : new String[] {value, value};
    LocalDate from = bounds[0].isBlank() ? null : LocalDate.parse(bounds[0].trim());
    LocalDate to = bounds.length < 2 || bounds[1].isBlank() ? null : LocalDate.parse(bounds[1].trim());
    List<Predicate> predicates = new ArrayList<>();
    if (LocalDateTime.class.equals(path.getJavaType())) {
      // Colonne date-heure : toute la journée de chaque borne.
      Expression<LocalDateTime> dateTime = (Expression<LocalDateTime>) (Expression<?>) path;
      if (from != null) {
        predicates.add(cb.greaterThanOrEqualTo(dateTime, from.atStartOfDay()));
      }
      if (to != null) {
        predicates.add(cb.lessThan(dateTime, to.plusDays(1).atStartOfDay()));
      }
    } else {
      Expression<LocalDate> date = (Expression<LocalDate>) (Expression<?>) path;
      if (from != null) {
        predicates.add(cb.greaterThanOrEqualTo(date, from));
      }
      if (to != null) {
        predicates.add(cb.lessThanOrEqualTo(date, to));
      }
    }
    return cb.and(predicates.toArray(Predicate[]::new));
  }

  @SuppressWarnings("unchecked")
  private static Expression<?> aggregate(CriteriaBuilder cb, Path<Object> path, NgTableColumn.Aggregate aggregate) {
    Expression<Number> number = (Expression<Number>) (Expression<?>) path;
    return switch (aggregate) {
      case SUM -> cb.sum(number);
      case AVG -> cb.avg(number);
      case MIN -> cb.min(number);
      case MAX -> cb.max(number);
      case COUNT -> cb.count(path);
    };
  }

  /**
   * Clé d'un groupe, identique à celle que calcule la table depuis le JSON de la ligne :
   * nom de l'enum, {@code YYYY-MM-DD} pour une date, {@code ""} pour une valeur vide.
   */
  static String groupKey(Object value) {
    if (value == null) {
      return "";
    }
    if (value instanceof Enum<?> e) {
      return e.name();
    }
    if (value instanceof BigDecimal number) {
      return number.stripTrailingZeros().toPlainString(); // 12.50 -> "12.5", comme en JavaScript
    }
    return value.toString();
  }

  @SuppressWarnings({"unchecked", "rawtypes"})
  private static Object convert(Class<?> type, String value) {
    if (type == String.class) {
      return value;
    }
    if (type.isEnum()) {
      return Enum.valueOf((Class<? extends Enum>) type, value);
    }
    if (type == Boolean.class || type == boolean.class) {
      return Boolean.valueOf(value);
    }
    if (type == LocalDate.class) {
      return LocalDate.parse(value);
    }
    if (type == Integer.class || type == int.class) {
      return Integer.valueOf(value);
    }
    if (type == Long.class || type == long.class) {
      return Long.valueOf(value);
    }
    if (type == BigDecimal.class) {
      return new BigDecimal(value);
    }
    if (type == UUID.class) {
      return UUID.fromString(value);
    }
    throw new IllegalArgumentException("Type non géré pour une valeur de filtre ou de groupe : " + type.getSimpleName());
  }

  private static BigDecimal parseNumber(String text) {
    String normalized = text.trim().replace(',', '.');
    if (normalized.isEmpty()) {
      return null;
    }
    try {
      return new BigDecimal(normalized);
    } catch (NumberFormatException e) {
      return null;
    }
  }

  private static String escapeLike(String text) {
    return text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
  }

  private static Order order(CriteriaBuilder cb, Expression<?> expression, boolean descending) {
    return descending ? cb.desc(expression) : cb.asc(expression);
  }

  /** Attribut, éventuellement imbriqué ({@code "client.nom"} : jointure implicite, donc interne). */
  private static Path<Object> path(Root<?> root, String attribute) {
    Path<Object> path = null;
    for (String part : attribute.split("\\.")) {
      path = path == null ? root.get(part) : path.get(part);
    }
    return path;
  }

  private NgTableColumn column(String id, java.util.function.Predicate<NgTableColumn> allowed, String what) {
    NgTableColumn column = columns.get(id);
    if (column == null || !allowed.test(column)) {
      throw new IllegalArgumentException("Colonne non " + what + " : " + id);
    }
    return column;
  }
}
