package com.example.commandes;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.stream.IntStream;

/** Une ligne de la table : les noms des champs sont ceux lus par les `valueAccessor` Angular. */
public record CommandeDto(String id, String reference, String client, CommandeStatut statut, BigDecimal montant,
                          LocalDate dateCommande, boolean urgent, String description, List<Integer> tendance) {

  static CommandeDto from(Commande c) {
    return new CommandeDto(String.valueOf(c.getId()), c.getReference(), c.getClient(), c.getStatut(), c.getMontant(),
        c.getDateCommande(), c.isUrgent(), c.getDescription(), tendance(c.getId()));
  }

  /** Six valeurs déterministes tirées de l'identifiant : de quoi tracer un mini-graphique (sparkline) par ligne. */
  static List<Integer> tendance(Long id) {
    long seed = id == null ? 0 : id;
    return IntStream.range(0, 6).mapToObj(month -> (int) (((seed + 2) * (month + 2) * 7919) % 90) + 10).toList();
  }
}
