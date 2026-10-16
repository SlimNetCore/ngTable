package com.example.commandes;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.example.ngtable.NgTable;
import com.example.ngtable.NgTableColumn;
import com.example.ngtable.NgTableJpaSearch;
import jakarta.persistence.EntityManager;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.support.TransactionTemplate;

/** Filtre « ensemble de valeurs » ({@code filter.type: 'set'}) : tableau JSON de clés, valeurs vides et virgules comprises. */
@SpringBootTest(properties = "demo.commandes.count=0")
class CommandeSetFilterTest {

  @Autowired EntityManager em;
  @Autowired TransactionTemplate tx;

  private NgTableJpaSearch<Commande> search;

  @BeforeEach
  void seed() {
    tx.executeWithoutResult(status -> {
      em.createQuery("delete from Commande").executeUpdate();
      String[] clients = {"Dupont SA", "Martin, Fils & Cie", "Leroy"};
      CommandeStatut[] statuts = {CommandeStatut.VALIDEE, CommandeStatut.BROUILLON, null};
      for (int i = 0; i < 30; i++) {
        em.persist(new Commande("CMD-%03d".formatted(i), clients[i % 3], statuts[i % 3], BigDecimal.valueOf(i), LocalDate.of(2026, 1, 1 + i % 28), false, "x"));
      }
    });
    search = new NgTableJpaSearch<>(em, Commande.class, "id", List.of(
        NgTableColumn.of("reference").filter(NgTableColumn.Filter.TEXT).sortable(),
        NgTableColumn.of("client").filter(NgTableColumn.Filter.SET).sortable(),
        NgTableColumn.of("statut").filter(NgTableColumn.Filter.SET).sortable()));
  }

  private List<String> clients(String column, String json) {
    return tx.execute(status -> search.search(new NgTable.Query(
            null, List.of(new NgTable.Sort("reference", "asc")), Map.of(column, json), new NgTable.Page(0, 500), "", null, List.of()))
        .rows().stream().map(Commande::getReference).toList());
  }

  @Test
  void gardeLesValeursCochees_virguleDansUneValeurComprise() {
    assertThat(clients("client", "[\"Martin, Fils & Cie\"]")).hasSize(10).allMatch(ref -> Integer.parseInt(ref.substring(4)) % 3 == 1);
    assertThat(clients("client", "[\"Dupont SA\",\"Leroy\"]")).hasSize(20);
  }

  @Test
  void valeurVide_estNull() {
    assertThat(clients("statut", "[\"\"]")).hasSize(10).allMatch(ref -> Integer.parseInt(ref.substring(4)) % 3 == 2);
    assertThat(clients("statut", "[\"VALIDEE\",\"\"]")).hasSize(20);
    assertThat(clients("statut", "[\"BROUILLON\"]")).hasSize(10);
  }

  @Test
  void aucuneValeurCochee_neGardeRien() {
    assertThat(clients("client", "[]")).isEmpty();
  }

  @Test
  void refuseCeQuiNEstPasUnTableauDeChaines() {
    assertThatThrownBy(() -> clients("client", "Dupont SA")).isInstanceOf(IllegalArgumentException.class);
    assertThatThrownBy(() -> clients("client", "[1,2]")).isInstanceOf(IllegalArgumentException.class);
    assertThatThrownBy(() -> clients("client", "[\"a")).isInstanceOf(IllegalArgumentException.class);
  }

  @Test
  void analyseLesEchappementsJson() {
    assertThat(NgTableJpaSearch.parseStringArray("[ \"a\\\"b\", \"c\\\\d\" , \"\\u00e9\\n\" ]")).containsExactly("a\"b", "c\\d", "é\n");
    assertThat(NgTableJpaSearch.parseStringArray("[]")).isEmpty();
  }
}