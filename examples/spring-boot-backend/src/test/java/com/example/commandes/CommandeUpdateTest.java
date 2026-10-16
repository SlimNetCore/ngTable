package com.example.commandes;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import jakarta.persistence.EntityManager;
import java.math.BigDecimal;
import java.time.LocalDate;
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
class CommandeUpdateTest {

  @Autowired EntityManager em;
  @Autowired TransactionTemplate tx;
  @Autowired WebApplicationContext context;

  private MockMvc mvc;
  private long id;

  @BeforeEach
  void seed() {
    mvc = MockMvcBuilders.webAppContextSetup(context).build();
    id = tx.execute(status -> {
      em.createQuery("delete from Commande").executeUpdate();
      Commande commande = new Commande("CMD-0001", "Dupont SA", CommandeStatut.BROUILLON, new BigDecimal("12.5"), LocalDate.of(2026, 1, 2), false, "x");
      em.persist(commande);
      return commande.getId();
    });
  }

  private Commande reload() {
    return tx.execute(status -> {
      em.clear();
      return em.find(Commande.class, id);
    });
  }

  private org.springframework.test.web.servlet.ResultActions patchWith(String body) throws Exception {
    return mvc.perform(patch("/api/commandes/" + id).contentType(MediaType.APPLICATION_JSON).content(body));
  }

  @Test
  void modifieLesChampsFournisEtSeulementEux() throws Exception {
    patchWith("{\"client\": \"Martin SARL\", \"montant\": 99.9}")
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.client").value("Martin SARL"))
        .andExpect(jsonPath("$.montant").value(99.9))
        .andExpect(jsonPath("$.statut").value("BROUILLON"));

    Commande saved = reload();
    assertThat(saved.getClient()).isEqualTo("Martin SARL");
    assertThat(saved.getMontant()).isEqualByComparingTo("99.9");
    assertThat(saved.getStatut()).isEqualTo(CommandeStatut.BROUILLON);
  }

  @Test
  void accepteLeNomOuLeLibelleDuStatut() throws Exception {
    patchWith("{\"statut\": \"VALIDEE\"}").andExpect(status().isOk());
    assertThat(reload().getStatut()).isEqualTo(CommandeStatut.VALIDEE);
    patchWith("{\"statut\": \"expédiée\"}").andExpect(status().isOk());
    assertThat(reload().getStatut()).isEqualTo(CommandeStatut.EXPEDIEE);
  }

  @Test
  void refuseLesValeursInvalidesSansRienChanger() throws Exception {
    patchWith("{\"montant\": -1}").andExpect(status().isBadRequest());
    patchWith("{\"client\": \"  \"}").andExpect(status().isBadRequest());
    patchWith("{\"statut\": \"inconnu\"}").andExpect(status().isBadRequest());
    // Une valeur valide suivie d'une invalide : rien n'est enregistré (une seule transaction).
    patchWith("{\"client\": \"Autre\", \"montant\": -5}").andExpect(status().isBadRequest());

    Commande saved = reload();
    assertThat(saved.getClient()).isEqualTo("Dupont SA");
    assertThat(saved.getMontant()).isEqualByComparingTo("12.5");
  }

  @Test
  void uneCommandeInconnueDonneUne404() throws Exception {
    mvc.perform(patch("/api/commandes/987654321").contentType(MediaType.APPLICATION_JSON).content("{\"client\": \"X\"}"))
        .andExpect(status().isNotFound());
  }

  @Test
  void laLigneRenvoyeeCommeLesAutresPorteSaTendance() throws Exception {
    patchWith("{}").andExpect(status().isOk()).andExpect(jsonPath("$.tendance.length()").value(6));
  }
}
