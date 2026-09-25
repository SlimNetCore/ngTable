package com.example.commandes;

import com.example.ngtable.NgTable;
import com.example.ngtable.NgTableExporter;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.format.DateTimeParseException;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
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

  /** Colonne inconnue, valeur de filtre invalide, page trop grande : 400 plutôt que 500. */
  @ExceptionHandler({IllegalArgumentException.class, DateTimeParseException.class})
  public ResponseEntity<String> badRequest(RuntimeException e) {
    return ResponseEntity.badRequest().body(e.getMessage());
  }
}
