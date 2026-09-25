package com.example.commandes;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.example.ngtable.NgTable;
import jakarta.persistence.EntityManager;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.function.Predicate;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.context.WebApplicationContext;

@SpringBootTest(properties = "demo.commandes.count=0") // pas de données générées : le test crée les siennes
class CommandeSearchTest {

  private static final String[] CLIENTS = {"Dupont SA", "Martin SARL", "Bernard & Fils", "Leroy Industries"};
  private static final CommandeStatut[] STATUTS = CommandeStatut.values();

  @Autowired CommandeSearchService service;
  @Autowired EntityManager em;
  @Autowired TransactionTemplate tx;
  @Autowired WebApplicationContext context;

  private final List<Commande> all = new ArrayList<>();

  @BeforeEach
  void seed() {
    tx.executeWithoutResult(status -> {
      em.createQuery("delete from Commande").executeUpdate();
      all.clear();
      for (int i = 0; i < 230; i++) {
        CommandeStatut statut = i % 23 == 0 ? null : STATUTS[i % STATUTS.length]; // quelques statuts vides
        Commande c = new Commande(
            "CMD-%04d".formatted(i + 1),
            CLIENTS[i % CLIENTS.length],
            statut,
            BigDecimal.valueOf((i * 7919) % 1000, 1), // doublons fréquents : départage par id
            LocalDate.of(2026, 1 + i % 12, 1 + i % 28),
            i % 5 == 0,
            i % 3 == 0 ? "Livraison urgente" : "Livraison standard");
        em.persist(c);
        all.add(c);
      }
    });
  }

  /** Le JSON de la question, au format de (remoteQueryChange) : `page: {index, size}`. */
  private static final String QUESTION_JSON = """
      {
        "sort": {"columnId": "statut", "direction": "asc"},
        "sorts": [
          {"columnId": "statut", "direction": "asc"},
          {"columnId": "montant", "direction": "asc"},
          {"columnId": "dateCommande", "direction": "asc"}
        ],
        "filters": {},
        "search": "",
        "page": {"index": 0, "size": 50},
        "groupBy": "statut",
        "collapsedGroups": ["ANNULEE", "BROUILLON"]
      }
      """;

  @Test
  void requeteDeLaQuestion_viaHttp() throws Exception {
    MockMvc mvc = MockMvcBuilders.webAppContextSetup(context).build();
    mvc.perform(post("/api/commandes/search").contentType(MediaType.APPLICATION_JSON).content(QUESTION_JSON))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.rows.length()").value(50))
        .andExpect(jsonPath("$.total").isNumber())
        .andExpect(jsonPath("$.groupSummaries.length()").value(5))
        .andExpect(jsonPath("$.groupSummaries[1].aggregates.montant").isNumber());
  }

  @Test
  void requeteDeLaQuestion_groupesRepliesExclusMaisResumesComplets() {
    NgTable.Query query = new NgTable.Query(null,
        List.of(sort("statut", "asc"), sort("montant", "asc"), sort("dateCommande", "asc")),
        Map.of(), new NgTable.Page(0, 50), "", "statut", List.of("ANNULEE", "BROUILLON"));

    NgTable.Result<CommandeDto> result = service.search(query);

    // Place du groupe vide (NULL) : celle de la base (H2 : en tête ; PostgreSQL : en fin).
    boolean nullsFirst = result.groupSummaries().get(0).key().isEmpty();
    Comparator<String> byStatut = nullsFirst
        ? Comparator.nullsFirst(Comparator.naturalOrder())
        : Comparator.nullsLast(Comparator.naturalOrder());

    // Lignes : groupes dépliés seulement, triées par statut, montant, date, puis id.
    Comparator<Commande> order = Comparator
        .comparing((Commande c) -> c.getStatut() == null ? null : c.getStatut().name(), byStatut)
        .thenComparing(Commande::getMontant)
        .thenComparing(Commande::getDateCommande)
        .thenComparing(Commande::getId);
    List<Commande> expanded = all.stream()
        .filter(c -> c.getStatut() != CommandeStatut.ANNULEE && c.getStatut() != CommandeStatut.BROUILLON)
        .sorted(order).toList();
    assertThat(result.total()).isEqualTo(expanded.size());
    assertThat(result.rows()).extracting(CommandeDto::reference)
        .containsExactlyElementsOf(expanded.stream().limit(50).map(Commande::getReference).toList());

    // Résumés : les 4 statuts + le groupe vide, repliés compris, avec compte et somme.
    List<String> keys = result.groupSummaries().stream().map(NgTable.GroupSummary::key).toList();
    assertThat(keys).containsExactlyElementsOf(nullsFirst
        ? List.of("", "ANNULEE", "BROUILLON", "EXPEDIEE", "VALIDEE")
        : List.of("ANNULEE", "BROUILLON", "EXPEDIEE", "VALIDEE", ""));
    NgTable.GroupSummary annulee = result.groupSummaries().get(keys.indexOf("ANNULEE"));
    List<Commande> annulees = all.stream().filter(c -> c.getStatut() == CommandeStatut.ANNULEE).toList();
    assertThat(annulee.count()).isEqualTo(annulees.size());
    assertThat((BigDecimal) annulee.aggregates().get("montant"))
        .isEqualByComparingTo(annulees.stream().map(Commande::getMontant).reduce(BigDecimal.ZERO, BigDecimal::add));
  }

  @Test
  void pageSuivante_etGroupeVideReplie() {
    NgTable.Query page2 = new NgTable.Query(null, List.of(), Map.of(), new NgTable.Page(1, 50), "", "statut", List.of(""));
    NgTable.Result<CommandeDto> result = service.search(page2);
    long nonVides = all.stream().filter(c -> c.getStatut() != null).count();
    assertThat(result.total()).isEqualTo(nonVides);
    assertThat(result.rows()).allSatisfy(row -> assertThat(row.statut()).isNotNull());
  }

  @Test
  void filtres_etRecherche() {
    assertFilter(Map.of("statut", "VALIDEE,EXPEDIEE"),
        c -> c.getStatut() == CommandeStatut.VALIDEE || c.getStatut() == CommandeStatut.EXPEDIEE);
    assertFilter(Map.of("reference", "cmd-01"), c -> c.getReference().toLowerCase().contains("cmd-01"));
    assertFilter(Map.of("montant", ">=50,5"), c -> c.getMontant().compareTo(new BigDecimal("50.5")) >= 0);
    assertFilter(Map.of("montant", "!=0"), c -> c.getMontant().signum() != 0);
    assertFilter(Map.of("montant", "10..20"),
        c -> c.getMontant().compareTo(BigDecimal.TEN) >= 0 && c.getMontant().compareTo(BigDecimal.valueOf(20)) <= 0);
    assertFilter(Map.of("montant", "..5"), c -> c.getMontant().compareTo(BigDecimal.valueOf(5)) <= 0);
    assertFilter(Map.of("dateCommande", "2026-03-01..2026-04-15"),
        c -> !c.getDateCommande().isBefore(LocalDate.of(2026, 3, 1)) && !c.getDateCommande().isAfter(LocalDate.of(2026, 4, 15)));
    assertFilter(Map.of("dateCommande", "2026-02-02"), c -> c.getDateCommande().equals(LocalDate.of(2026, 2, 2)));
    assertFilter(Map.of("urgent", "true"), Commande::isUrgent);

    NgTable.Result<CommandeDto> search = service.search(
        new NgTable.Query(null, List.of(), Map.of(), new NgTable.Page(0, 500), "  URGENTE dupont ", null, List.of()));
    assertThat(search.total()).isEqualTo(all.stream()
        .filter(c -> c.getDescription().contains("urgente") && c.getClient().equals("Dupont SA")).count());
    assertThat(search.groupSummaries()).isNull();
  }

  @Test
  void refuseCeQuiNEstPasDeclare() {
    MockMvc mvc = MockMvcBuilders.webAppContextSetup(context).build();
    String json = QUESTION_JSON.replace("\"filters\": {}", "\"filters\": {\"id\": \"1\"}");
    try {
      mvc.perform(post("/api/commandes/search").contentType(MediaType.APPLICATION_JSON).content(json))
          .andExpect(status().isBadRequest());
      mvc.perform(post("/api/commandes/search").contentType(MediaType.APPLICATION_JSON)
              .content(QUESTION_JSON.replace("\"size\": 50", "\"size\": 0")))
          .andExpect(status().isBadRequest());
    } catch (Exception e) {
      throw new AssertionError(e);
    }
  }

  private void assertFilter(Map<String, String> filters, Predicate<Commande> expected) {
    NgTable.Result<CommandeDto> result = service.search(
        new NgTable.Query(null, List.of(sort("reference", "asc")), filters, new NgTable.Page(0, 500), "", null, List.of()));
    List<String> expectedRefs = all.stream().filter(expected).map(Commande::getReference).sorted().toList();
    assertThat(expectedRefs).as("jeu de test non vide pour %s", filters).isNotEmpty();
    assertThat(result.rows()).extracting(CommandeDto::reference).as("filtre %s", filters).containsExactlyElementsOf(expectedRefs);
    assertThat(result.total()).isEqualTo(expectedRefs.size());
    assertThat(Objects.requireNonNull(result.rows())).hasSizeLessThanOrEqualTo(500);
  }

  private static NgTable.Sort sort(String columnId, String direction) {
    return new NgTable.Sort(columnId, direction);
  }
}
