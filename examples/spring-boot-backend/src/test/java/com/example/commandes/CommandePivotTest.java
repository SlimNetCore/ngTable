package com.example.commandes;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.example.ngtable.NgTablePivot;
import jakarta.persistence.EntityManager;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.context.WebApplicationContext;

@SpringBootTest(properties = "demo.commandes.count=0")
class CommandePivotTest {

  private static final String[] CLIENTS = {"Dupont SA", "Martin SARL", "Bernard & Fils"};
  private static final CommandeStatut[] STATUTS = CommandeStatut.values();
  private static final String SEP = NgTablePivot.PATH_SEPARATOR;

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
      for (int i = 0; i < 120; i++) {
        Commande c = new Commande("CMD-%04d".formatted(i + 1), CLIENTS[i % CLIENTS.length], STATUTS[i % STATUTS.length],
            i % 17 == 0 ? null : BigDecimal.valueOf(10 + i, 1), LocalDate.of(2026, 1 + i % 3, 1 + i % 28), i % 5 == 0, "x");
        em.persist(c);
        all.add(c);
      }
    });
  }

  private static NgTablePivot.Request request(List<String> rows, List<String> columns, String aggregate, Map<String, String> filters) {
    return new NgTablePivot.Request(rows, columns, List.of(new NgTablePivot.Value("montant", aggregate)), "asc", filters, "");
  }

  private BigDecimal sum(java.util.function.Predicate<Commande> where) {
    return all.stream().filter(where).map(Commande::getMontant).filter(java.util.Objects::nonNull).reduce(BigDecimal.ZERO, BigDecimal::add);
  }

  private static BigDecimal cell(NgTablePivot.Row row, String key) {
    return row.cells().get(key).get("montant");
  }

  @Test
  void sommeParClientEtParStatut() {
    NgTablePivot.Result result = service.pivot(request(List.of("client"), List.of("statut"), "sum", Map.of()));

    assertThat(result.rows()).extracting(row -> row.labels().get(0)).containsExactly("Bernard & Fils", "Dupont SA", "Martin SARL");
    assertThat(result.columns()).as("ordre naturel des libellés")
        .containsExactly(List.of("Annulée"), List.of("Brouillon"), List.of("Expédiée"), List.of("Validée"));
  }

  @Test
  void lesCellulesLesTotauxEtLeTotalGeneralSontCeuxDuCalculDirect() {
    NgTablePivot.Result result = service.pivot(request(List.of("client"), List.of("statut"), "sum", Map.of()));

    for (NgTablePivot.Row row : result.rows()) {
      String client = row.labels().get(0);
      assertThat(row.totals().get("montant")).isEqualByComparingTo(sum(c -> c.getClient().equals(client)));
      for (CommandeStatut statut : STATUTS) {
        BigDecimal expected = sum(c -> c.getClient().equals(client) && c.getStatut() == statut);
        BigDecimal actual = row.cells().containsKey(statut.label()) ? cell(row, statut.label()) : null;
        if (expected.signum() == 0 && actual == null) {
          continue;
        }
        assertThat(actual).as(client + " / " + statut).isEqualByComparingTo(expected);
      }
    }
    assertThat(result.grandTotal().totals().get("montant")).isEqualByComparingTo(sum(c -> true));
    assertThat(result.grandTotal().cells().get("Validée").get("montant")).isEqualByComparingTo(sum(c -> c.getStatut() == CommandeStatut.VALIDEE));
  }

  @Test
  void plusieursChampsEnColonnesDonnentDesCheminsEtDesClesJointes() {
    NgTablePivot.Result result = service.pivot(request(List.of("client"), List.of("statut", "urgent"), "sum", Map.of()));

    assertThat(result.columns()).contains(List.of("Validée", "Oui"), List.of("Validée", "Non"));
    NgTablePivot.Row dupont = result.rows().stream().filter(row -> row.labels().get(0).equals("Dupont SA")).findFirst().orElseThrow();
    BigDecimal expected = sum(c -> c.getClient().equals("Dupont SA") && c.getStatut() == CommandeStatut.VALIDEE && c.isUrgent());
    if (expected.signum() != 0) {
      assertThat(cell(dupont, "Validée" + SEP + "Oui")).isEqualByComparingTo(expected);
    }
  }

  @Test
  void moyenneMinMaxEtNombreSontRecombinesSurLesLignes() {
    BigDecimal montants = sum(c -> c.getClient().equals("Dupont SA"));
    long avecMontant = all.stream().filter(c -> c.getClient().equals("Dupont SA") && c.getMontant() != null).count();
    long lignes = all.stream().filter(c -> c.getClient().equals("Dupont SA")).count();

    NgTablePivot.Row avg = service.pivot(request(List.of("client"), List.of(), "avg", Map.of())).rows().get(1);
    // La moyenne de la ligne n'est pas la moyenne des moyennes de ses cellules : montants vides ignorés.
    assertThat(avg.totals().get("montant")).isEqualByComparingTo(montants.divide(BigDecimal.valueOf(avecMontant), 4, java.math.RoundingMode.HALF_UP));
    assertThat(service.pivot(request(List.of("client"), List.of(), "count", Map.of())).rows().get(1).totals().get("montant"))
        .isEqualByComparingTo(BigDecimal.valueOf(lignes));
    assertThat(service.pivot(request(List.of("client"), List.of(), "max", Map.of())).rows().get(1).totals().get("montant"))
        .isEqualByComparingTo(all.stream().filter(c -> c.getClient().equals("Dupont SA") && c.getMontant() != null)
            .map(Commande::getMontant).max(BigDecimal::compareTo).orElseThrow());
    assertThat(service.pivot(request(List.of("client"), List.of(), "min", Map.of())).rows().get(1).totals().get("montant"))
        .isEqualByComparingTo(all.stream().filter(c -> c.getClient().equals("Dupont SA") && c.getMontant() != null)
            .map(Commande::getMontant).min(BigDecimal::compareTo).orElseThrow());
  }

  @Test
  void sansChampEnColonneUneSeuleColonneVide() {
    NgTablePivot.Result result = service.pivot(request(List.of("client"), List.of(), "sum", Map.of()));
    assertThat(result.columns()).containsExactly(List.of());
    assertThat(result.rows().get(0).cells()).containsOnlyKeys("");
  }

  @Test
  void lesFiltresDeLaTableRestreignentLePivot() {
    NgTablePivot.Result result = service.pivot(request(List.of("client"), List.of("statut"), "sum", Map.of("statut", "VALIDEE")));

    assertThat(result.columns()).containsExactly(List.of("Validée"));
    assertThat(result.grandTotal().totals().get("montant")).isEqualByComparingTo(sum(c -> c.getStatut() == CommandeStatut.VALIDEE));
  }

  @Test
  void lesMoisSontAuFormatAnneeMois() {
    NgTablePivot.Result result = service.pivot(request(List.of("mois"), List.of(), "count", Map.of()));
    assertThat(result.rows()).extracting(row -> row.labels().get(0)).containsExactly("2026-01", "2026-02", "2026-03");
  }

  @Test
  void ordreDesColonnesDecroissant() {
    NgTablePivot.Request request = new NgTablePivot.Request(List.of("client"), List.of("mois"),
        List.of(new NgTablePivot.Value("montant", "sum")), "desc", Map.of(), "");
    assertThat(service.pivot(request).columns().get(0)).containsExactly("2026-03");
  }

  @Test
  void refuseUnChampOuUnAgregatInconnuEnRenvoyantUne400() throws Exception {
    MockMvc mvc = MockMvcBuilders.webAppContextSetup(context).build();
    String body = """
        {"rows": ["%s"], "columns": [], "values": [{"id": "montant", "aggregate": "%s"}]}""";
    mvc.perform(post("/api/commandes/pivot").contentType(MediaType.APPLICATION_JSON).content(body.formatted("password", "sum")))
        .andExpect(status().isBadRequest());
    mvc.perform(post("/api/commandes/pivot").contentType(MediaType.APPLICATION_JSON).content(body.formatted("client", "median")))
        .andExpect(status().isBadRequest());
    mvc.perform(post("/api/commandes/pivot").contentType(MediaType.APPLICATION_JSON)
            .content("{\"rows\": [\"client\"], \"values\": [{\"id\": \"quantite\", \"aggregate\": \"sum\"}]}"))
        .andExpect(status().isBadRequest());
    mvc.perform(post("/api/commandes/pivot").contentType(MediaType.APPLICATION_JSON).content("{\"rows\": [\"client\"], \"values\": []}"))
        .andExpect(status().isBadRequest());
  }

  @Test
  void lePivotRepondEnJsonAuFormatAttenduParLaTable() throws Exception {
    MockMvc mvc = MockMvcBuilders.webAppContextSetup(context).build();
    mvc.perform(post("/api/commandes/pivot").contentType(MediaType.APPLICATION_JSON)
            .content("{\"rows\": [\"client\"], \"columns\": [\"statut\"], \"values\": [{\"id\": \"montant\", \"aggregate\": \"sum\"}], \"columnSort\": \"asc\"}"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.columns[0][0]").value("Annulée"))
        .andExpect(jsonPath("$.rows[0].labels[0]").value("Bernard & Fils"))
        .andExpect(jsonPath("$.rows[0].cells.Brouillon.montant").isNumber())
        .andExpect(jsonPath("$.rows[0].totals.montant").isNumber())
        .andExpect(jsonPath("$.grandTotal.totals.montant").isNumber());
  }
}
