package com.example.commandes;

import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.LocalDate;

@Entity
// Index sur les colonnes filtrées, triées et regroupées.
@Table(indexes = {
    @Index(columnList = "statut"),
    @Index(columnList = "client"),
    @Index(columnList = "montant"),
    @Index(columnList = "date_commande"),
})
public class Commande {

  @Id
  @GeneratedValue
  private Long id;
  private String reference;
  private String client;
  @Enumerated(EnumType.STRING)
  private CommandeStatut statut;
  private BigDecimal montant;
  private LocalDate dateCommande;
  private boolean urgent;
  private String description;

  protected Commande() {
  }

  public Commande(String reference, String client, CommandeStatut statut, BigDecimal montant,
                  LocalDate dateCommande, boolean urgent, String description) {
    this.reference = reference;
    this.client = client;
    this.statut = statut;
    this.montant = montant;
    this.dateCommande = dateCommande;
    this.urgent = urgent;
    this.description = description;
  }

  public Long getId() { return id; }
  public String getReference() { return reference; }
  public String getClient() { return client; }
  public CommandeStatut getStatut() { return statut; }
  public BigDecimal getMontant() { return montant; }
  public LocalDate getDateCommande() { return dateCommande; }
  public boolean isUrgent() { return urgent; }
  public String getDescription() { return description; }
}
