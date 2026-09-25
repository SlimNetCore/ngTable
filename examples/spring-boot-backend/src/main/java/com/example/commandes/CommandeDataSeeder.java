package com.example.commandes;

import java.math.BigDecimal;
import java.sql.Date;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.beans.factory.SmartInitializingSingleton;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Remplit la base H2 en mémoire au démarrage, avec les mêmes formules que le faux
 * serveur de la démo Angular : les deux serveurs renvoient donc les mêmes commandes.
 * Nombre de lignes : {@code demo.commandes.count} (0 = aucune).
 *
 * <p>{@link SmartInitializingSingleton} plutôt qu'{@code ApplicationRunner} : les données sont
 * prêtes avant que le serveur HTTP accepte des requêtes (pas de totaux partiels au démarrage).
 */
@Component
public class CommandeDataSeeder implements SmartInitializingSingleton {

  private static final Logger LOG = LoggerFactory.getLogger(CommandeDataSeeder.class);
  private static final String[] CLIENTS =
      {"Dupont SA", "Martin SARL", "Bernard & Fils", "Petit Commerce", "Leroy Industries", "Moreau Logistique"};
  private static final CommandeStatut[] STATUTS = CommandeStatut.values();
  private static final String[] DESCRIPTIONS = {
      "Livraison standard",
      "Commande groupée pour plusieurs entrepôts, avec une remise négociée sur les volumes du trimestre et une livraison fractionnée",
      "Réassort",
      "Commande urgente passée en fin de journée, à traiter en priorité par l’équipe logistique",
  };
  private static final int BATCH = 5_000;

  private final JdbcTemplate jdbc;
  private final int count;

  public CommandeDataSeeder(JdbcTemplate jdbc, @Value("${demo.commandes.count:100000}") int count) {
    this.jdbc = jdbc;
    this.count = count;
  }

  @Override
  public void afterSingletonsInstantiated() {
    if (count <= 0) {
      return;
    }
    long started = System.currentTimeMillis();
    String sql = "insert into commande (id, reference, client, statut, montant, date_commande, urgent, description)"
        + " values (?, ?, ?, ?, ?, ?, ?, ?)";
    List<Object[]> batch = new ArrayList<>(BATCH);
    for (int i = 0; i < count; i++) {
      batch.add(new Object[] {
          i + 1L,
          "CMD-%07d".formatted(i + 1),
          CLIENTS[i % CLIENTS.length],
          STATUTS[i % STATUTS.length].name(),
          BigDecimal.valueOf(((i * 7919L) % 100000) + 50, 1),
          Date.valueOf(LocalDate.of(2026, (i % 12) + 1, (i % 28) + 1)),
          i % 5 == 0,
          DESCRIPTIONS[i % DESCRIPTIONS.length],
      });
      if (batch.size() == BATCH) {
        jdbc.batchUpdate(sql, batch);
        batch.clear();
      }
    }
    if (!batch.isEmpty()) {
      jdbc.batchUpdate(sql, batch);
    }
    LOG.info("{} commandes générées en {} ms", count, System.currentTimeMillis() - started);
  }
}
