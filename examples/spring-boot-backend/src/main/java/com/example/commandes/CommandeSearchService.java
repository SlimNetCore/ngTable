package com.example.commandes;

import static com.example.ngtable.NgTableColumn.Aggregate.SUM;
import static com.example.ngtable.NgTableColumn.Filter.BOOLEAN;
import static com.example.ngtable.NgTableColumn.Filter.DATE;
import static com.example.ngtable.NgTableColumn.Filter.ENUM;
import static com.example.ngtable.NgTableColumn.Filter.NUMBER;
import static com.example.ngtable.NgTableColumn.Filter.TEXT;

import com.example.ngtable.NgTable;
import com.example.ngtable.NgTableColumn;
import com.example.ngtable.NgTableExporter;
import com.example.ngtable.NgTableJpaSearch;
import jakarta.persistence.EntityManager;
import java.io.IOException;
import java.io.OutputStream;
import java.util.List;
import java.util.stream.Stream;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class CommandeSearchService {

  private final EntityManager em;
  private final NgTableJpaSearch<Commande> search;

  /** Valeur écrite dans le fichier pour chaque colonne : ce que la table affiche. */
  private final NgTableExporter<Commande> exporter = new NgTableExporter<Commande>()
      .column("reference", Commande::getReference)
      .column("client", Commande::getClient)
      .column("statut", c -> c.getStatut() == null ? null : c.getStatut().label())
      .column("montant", Commande::getMontant)
      .column("dateCommande", Commande::getDateCommande)
      .column("urgent", c -> c.isUrgent() ? "Oui" : "Non")
      .column("description", Commande::getDescription);

  public CommandeSearchService(EntityManager em) {
    this.em = em;
    // Une entrée par colonne Angular : même id, et même type de filtre que `filter.type`.
    this.search = new NgTableJpaSearch<>(em, Commande.class, "id", List.of(
        NgTableColumn.of("reference").filter(TEXT).sortable().searchable(),
        NgTableColumn.of("client").filter(ENUM).sortable().searchable().groupable(),
        NgTableColumn.of("statut").filter(ENUM).sortable().groupable(),
        NgTableColumn.of("montant").filter(NUMBER).sortable().aggregate(SUM),
        NgTableColumn.of("dateCommande").filter(DATE).sortable().groupable(),
        NgTableColumn.of("urgent").filter(BOOLEAN).sortable().groupable(),
        NgTableColumn.of("description").searchable()));
  }

  @Transactional(readOnly = true)
  public NgTable.Result<CommandeDto> search(NgTable.Query query) {
    NgTable.Result<Commande> result = search.search(query);
    return new NgTable.Result<>(
        result.rows().stream().map(CommandeDto::from).toList(), result.total(), result.groupSummaries());
  }

  /** Valide la demande d'export et compte les lignes, avant tout envoi au navigateur. */
  @Transactional(readOnly = true)
  public NgTableExporter.Download prepareExport(NgTable.ExportRequest request) {
    return exporter.prepare(request, search.countAll(request.query()));
  }

  /** Écrit le fichier : les lignes sont lues et écrites au fil de l'eau. */
  @Transactional(readOnly = true)
  public void export(NgTable.ExportRequest request, NgTableExporter.Download download, OutputStream out) throws IOException {
    try (Stream<Commande> rows = search.streamAll(request.query())) {
      // Détachées une à une : le contexte de persistance ne grossit pas avec l'export.
      exporter.write(download, request.columns(), rows.peek(em::detach), out);
    }
  }
}
