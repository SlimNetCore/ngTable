package com.example.commandes;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import jakarta.persistence.EntityManager;
import java.io.ByteArrayInputStream;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import org.apache.poi.ss.usermodel.CellType;
import org.apache.poi.ss.usermodel.DateUtil;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.context.WebApplicationContext;

@SpringBootTest(properties = "demo.commandes.count=0")
class CommandeExportTest {

  @Autowired EntityManager em;
  @Autowired TransactionTemplate tx;
  @Autowired WebApplicationContext context;

  private final List<Commande> all = new ArrayList<>();
  private MockMvc mvc;

  @BeforeEach
  void seed() {
    mvc = MockMvcBuilders.webAppContextSetup(context).build();
    tx.executeWithoutResult(status -> {
      em.createQuery("delete from Commande").executeUpdate();
      all.clear();
      CommandeStatut[] statuts = CommandeStatut.values();
      for (int i = 0; i < 120; i++) {
        Commande c = new Commande("CMD-%04d".formatted(i + 1), i % 2 == 0 ? "Dupont SA" : "Martin; \"SARL\"",
            statuts[i % statuts.length], BigDecimal.valueOf((i * 7919) % 1000, 1),
            LocalDate.of(2026, 1 + i % 12, 1 + i % 28), i % 5 == 0, "Livraison standard");
        em.persist(c);
        all.add(c);
      }
    });
  }

  /** Ce qu'émet (remoteExportRequested) : la requête + colonnes affichées, format, nom de fichier. */
  private static String request(String format, String columnsJson) {
    return """
        {
          "sorts": [{"columnId": "montant", "direction": "desc"}],
          "filters": {"statut": "VALIDEE,EXPEDIEE", "client": ""},
          "search": "",
          "page": {"index": 3, "size": 20},
          "groupBy": "statut",
          "collapsedGroups": ["VALIDEE"],
          "columns": %s,
          "format": "%s",
          "filename": "commandes"
        }
        """.formatted(columnsJson, format);
  }

  private static final String COLUMNS = """
      [{"id": "statut", "header": "Statut"}, {"id": "reference", "header": "Référence"},
       {"id": "client", "header": "Client"}, {"id": "montant", "header": "Montant (€)"},
       {"id": "dateCommande", "header": "Date"}, {"id": "urgent", "header": "Urgent"}]
      """;

  /** Lignes attendues : filtre appliqué, toutes pages, groupe replié compris, ordre de la table. */
  private List<Commande> expected() {
    return all.stream()
        .filter(c -> c.getStatut() == CommandeStatut.VALIDEE || c.getStatut() == CommandeStatut.EXPEDIEE)
        .sorted(Comparator.comparing((Commande c) -> c.getStatut().name())
            .thenComparing(Commande::getMontant, Comparator.reverseOrder())
            .thenComparing(Commande::getId))
        .toList();
  }

  @Test
  void csv_toutesLesLignes_colonnesAffichees_formatDeLExportLocal() throws Exception {
    MockHttpServletResponse response = mvc.perform(post("/api/commandes/export")
            .contentType(MediaType.APPLICATION_JSON).content(request("csv", COLUMNS)))
        .andExpect(status().isOk())
        .andReturn().getResponse();

    List<Commande> expected = expected();
    assertThat(response.getContentType()).startsWith("text/csv");
    assertThat(response.getHeader("Content-Disposition")).contains("attachment").contains("commandes.csv");
    assertThat(response.getHeader("X-Export-Rows")).isEqualTo(String.valueOf(expected.size()));

    String body = new String(response.getContentAsByteArray(), StandardCharsets.UTF_8);
    assertThat(body).startsWith("﻿");
    List<String> lines = List.of(body.substring(1).split("\r\n"));
    assertThat(lines.get(0)).isEqualTo("Statut;Référence;Client;Montant (€);Date;Urgent");
    assertThat(lines).hasSize(expected.size() + 1); // pas de pagination, groupe replié compris
    Commande first = expected.get(0);
    assertThat(lines.get(1)).isEqualTo(String.join(";", first.getStatut().label(), first.getReference(),
        csv(first.getClient()), first.getMontant().stripTrailingZeros().toPlainString(), first.getDateCommande().toString(),
        first.isUrgent() ? "Oui" : "Non"));
  }

  @Test
  void xlsx_cellulesTypees() throws Exception {
    byte[] file = mvc.perform(post("/api/commandes/export")
            .contentType(MediaType.APPLICATION_JSON).content(request("xlsx", COLUMNS)))
        .andExpect(status().isOk())
        .andReturn().getResponse().getContentAsByteArray();

    List<Commande> expected = expected();
    try (XSSFWorkbook workbook = new XSSFWorkbook(new ByteArrayInputStream(file))) {
      Sheet sheet = workbook.getSheetAt(0);
      assertThat(sheet.getLastRowNum()).isEqualTo(expected.size());
      assertThat(sheet.getRow(0).getCell(3).getStringCellValue()).isEqualTo("Montant (€)");
      assertThat(workbook.getFontAt(sheet.getRow(0).getCell(0).getCellStyle().getFontIndex()).getBold()).isTrue();
      assertThat(sheet.getPaneInformation().isFreezePane()).isTrue();

      Commande first = expected.get(0);
      var row = sheet.getRow(1);
      assertThat(row.getCell(0).getStringCellValue()).isEqualTo(first.getStatut().label());
      assertThat(row.getCell(3).getCellType()).isEqualTo(CellType.NUMERIC); // sommable dans Excel
      assertThat(row.getCell(3).getNumericCellValue()).isEqualTo(first.getMontant().doubleValue());
      assertThat(DateUtil.isCellDateFormatted(row.getCell(4))).isTrue();
      assertThat(row.getCell(4).getLocalDateTimeCellValue().toLocalDate()).isEqualTo(first.getDateCommande());
    }
  }

  @Test
  void refuse_colonneOuFormatInconnus() throws Exception {
    mvc.perform(post("/api/commandes/export").contentType(MediaType.APPLICATION_JSON)
            .content(request("csv", "[{\"id\": \"id\", \"header\": \"Id\"}]")))
        .andExpect(status().isBadRequest());
    mvc.perform(post("/api/commandes/export").contentType(MediaType.APPLICATION_JSON)
            .content(request("pdf", COLUMNS)))
        .andExpect(status().isBadRequest());
    mvc.perform(post("/api/commandes/export").contentType(MediaType.APPLICATION_JSON)
            .content(request("csv", "[]")))
        .andExpect(status().isBadRequest());
  }

  private static String csv(String value) {
    return value.contains(";") || value.contains("\"") ? '"' + value.replace("\"", "\"\"") + '"' : value;
  }
}
