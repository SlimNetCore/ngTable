package com.example.commandes;

import com.example.ngtable.NgTable;
import java.time.format.DateTimeParseException;
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

  /** Colonne inconnue, valeur de filtre invalide, page trop grande : 400 plutôt que 500. */
  @ExceptionHandler({IllegalArgumentException.class, DateTimeParseException.class})
  public ResponseEntity<String> badRequest(RuntimeException e) {
    return ResponseEntity.badRequest().body(e.getMessage());
  }
}
