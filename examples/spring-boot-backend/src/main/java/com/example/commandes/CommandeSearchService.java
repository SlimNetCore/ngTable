package com.example.commandes;

import static com.example.ngtable.NgTableColumn.Aggregate.SUM;
import static com.example.ngtable.NgTableColumn.Filter.BOOLEAN;
import static com.example.ngtable.NgTableColumn.Filter.DATE;
import static com.example.ngtable.NgTableColumn.Filter.ENUM;
import static com.example.ngtable.NgTableColumn.Filter.NUMBER;
import static com.example.ngtable.NgTableColumn.Filter.TEXT;

import com.example.ngtable.NgTable;
import com.example.ngtable.NgTableColumn;
import com.example.ngtable.NgTableJpaSearch;
import jakarta.persistence.EntityManager;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class CommandeSearchService {

  private final NgTableJpaSearch<Commande> search;

  public CommandeSearchService(EntityManager em) {
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
}
