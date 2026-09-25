package com.example.commandes;

public enum CommandeStatut {
  BROUILLON("Brouillon"),
  VALIDEE("Validée"),
  EXPEDIEE("Expédiée"),
  ANNULEE("Annulée");

  /** Libellé affiché (celui des options du filtre côté Angular), utilisé dans les exports. */
  private final String label;

  CommandeStatut(String label) {
    this.label = label;
  }

  public String label() {
    return label;
  }
}
