package com.example.commandes;

import com.example.ngtable.NgTable;
import com.example.ngtable.NgTableExporter;
import com.example.ngtable.NgTablePivot;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.format.DateTimeParseException;
import java.util.NoSuchElementException;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/commandes")
public class CommandeController {

  private final CommandeSearchService service;

  public CommandeController(CommandeSearchService service) {
    this.service = service;
  }

  /** POST plutôt que GET : les filtres (un objet) passent mal en paramètres d'URL. */
  @PostMapping("/search")
  public NgTable.Result<CommandeDto> search(@RequestBody NgTable.Query query) {
    return service.search(query);
  }

  /** Pivot calculé par la base : ce qu'envoie {@code <ng-table-pivot [datasource]>}. */
  @PostMapping("/pivot")
  public NgTablePivot.Result pivot(@RequestBody NgTablePivot.Request request) {
    return service.pivot(request);
  }

  /** Modification d'une cellule (édition de la table) : renvoie la ligne enregistrée. */
  @PatchMapping("/{id}")
  public CommandeDto update(@PathVariable long id, @RequestBody CommandeSearchService.Patch patch) {
    return service.update(id, patch);
  }

  /**
   * Export de toutes les lignes de la requête (pas seulement la page), avec les colonnes
   * affichées : le corps est ce qu'émet {@code (remoteExportRequested)}.
   */
  @PostMapping("/export")
  public void export(@RequestBody NgTable.ExportRequest request, HttpServletResponse response) throws IOException {
    // Validation d'abord : une erreur ici donne un 400, pas un fichier tronqué.
    NgTableExporter.Download download = service.prepareExport(request);
    response.setContentType(download.contentType());
    response.setHeader(HttpHeaders.CONTENT_DISPOSITION,
        ContentDisposition.attachment().filename(download.filename(), StandardCharsets.UTF_8).build().toString());
    response.setHeader("X-Export-Rows", Long.toString(download.rowCount()));
    service.export(request, download, response.getOutputStream());
  }

  @ExceptionHandler(NoSuchElementException.class)
  public ResponseEntity<String> notFound(NoSuchElementException e) {
    return ResponseEntity.status(404).body(e.getMessage());
  }

  /** Colonne inconnue, valeur de filtre invalide, page trop grande : 400 plutôt que 500. */
  @ExceptionHandler({IllegalArgumentException.class, DateTimeParseException.class})
  public ResponseEntity<String> badRequest(RuntimeException e) {
    return ResponseEntity.badRequest().body(e.getMessage());
  }
}
