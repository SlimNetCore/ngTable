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
import com.example.ngtable.NgTablePivot;
import com.example.ngtable.NgTablePivotSearch;
import com.example.ngtable.NgTablePivotSearch.Dimension;
import com.example.ngtable.NgTablePivotSearch.Measure;
import jakarta.persistence.EntityManager;
import java.io.IOException;
import java.io.OutputStream;
import java.math.BigDecimal;
import java.util.NoSuchElementException;
import java.util.List;
import java.util.stream.Stream;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class CommandeSearchService {

  private final EntityManager em;
  private final NgTableJpaSearch<Commande> search;
  private final NgTablePivotSearch<Commande> pivot;

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
    // Champs du pivot : mêmes identifiants et mêmes libellés que ceux de la démo Angular.
    this.pivot = new NgTablePivotSearch<>(em, Commande.class, search, List.of(
        Dimension.of("client", "client"),
        Dimension.of("statut", "statut", value -> value == null ? "" : ((CommandeStatut) value).label()),
        new Dimension<Commande>("mois",
            (cb, root) -> cb.sum(
                cb.prod(cb.function("year", Integer.class, root.get("dateCommande")), 100),
                cb.function("month", Integer.class, root.get("dateCommande"))),
            value -> value == null ? "" : "%04d-%02d".formatted(((Number) value).intValue() / 100, ((Number) value).intValue() % 100)),
        Dimension.of("urgent", "urgent", value -> Boolean.TRUE.equals(value) ? "Oui" : "Non")),
        List.of(new Measure("montant", "montant")));
  }

  /** Pivot calculé par la base, sur les lignes que filtrent {@code request.filters()} et {@code request.search()}. */
  @Transactional(readOnly = true)
  public NgTablePivot.Result pivot(NgTablePivot.Request request) {
    return pivot.pivot(request);
  }

  /** Champs modifiables d'une commande : seuls ceux fournis sont changés. */
  public record Patch(String client, String statut, BigDecimal montant) {
  }

  /** Modification d'une cellule : valide la valeur, puis l'enregistre. */
  @Transactional
  public CommandeDto update(long id, Patch patch) {
    Commande commande = em.find(Commande.class, id);
    if (commande == null) {
      throw new NoSuchElementException("Commande " + id + " introuvable");
    }
    if (patch.client() != null) {
      if (patch.client().isBlank()) {
        throw new IllegalArgumentException("Le client ne peut pas être vide");
      }
      commande.setClient(patch.client().trim());
    }
    if (patch.statut() != null) {
      commande.setStatut(statutOf(patch.statut()));
    }
    if (patch.montant() != null) {
      if (patch.montant().signum() < 0) {
        throw new IllegalArgumentException("Le montant doit être positif");
      }
      commande.setMontant(patch.montant());
    }
    return CommandeDto.from(commande);
  }

  /** Accepte le nom de l'enum ({@code VALIDEE}) comme son libellé ({@code Validée}). */
  private static CommandeStatut statutOf(String text) {
    for (CommandeStatut statut : CommandeStatut.values()) {
      if (statut.name().equalsIgnoreCase(text) || statut.label().equalsIgnoreCase(text)) {
        return statut;
      }
    }
    throw new IllegalArgumentException("Statut inconnu : " + text);
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
