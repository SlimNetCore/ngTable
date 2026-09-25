package com.example.commandes;

import java.math.BigDecimal;
import java.time.LocalDate;

/** Une ligne de la table : les noms des champs sont ceux lus par les `valueAccessor` Angular. */
public record CommandeDto(String id, String reference, String client, CommandeStatut statut, BigDecimal montant,
                          LocalDate dateCommande, boolean urgent, String description) {

  static CommandeDto from(Commande c) {
    return new CommandeDto(String.valueOf(c.getId()), c.getReference(), c.getClient(), c.getStatut(), c.getMontant(),
        c.getDateCommande(), c.isUrgent(), c.getDescription());
  }
}
