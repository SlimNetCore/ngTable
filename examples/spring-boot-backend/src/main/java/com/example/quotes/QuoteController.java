package com.example.quotes;

import java.io.IOException;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/**
 * Source du mode « live » : un instantané, puis un flux de transactions (Server-Sent Events) que la page
 * Angular applique par {@code applyTransactionAsync({update})}.
 */
@RestController
@RequestMapping("/api/quotes")
public class QuoteController {

  static final int MAX_SIZE = 200_000;
  static final int MAX_RATE = 100_000;
  /** Un paquet toutes les 100 ms : {@code rate / 10} cotations par paquet. */
  static final long TICK_MS = 100;

  private final Map<Integer, QuoteMarket> markets = new ConcurrentHashMap<>();
  private final ScheduledExecutorService scheduler = Executors.newScheduledThreadPool(2, runnable -> {
    Thread thread = new Thread(runnable, "quote-stream");
    thread.setDaemon(true);
    return thread;
  });

  private QuoteMarket market(int size) {
    if (size < 1 || size > MAX_SIZE) {
      throw new IllegalArgumentException("Nombre d'instruments attendu entre 1 et " + MAX_SIZE);
    }
    return markets.computeIfAbsent(size, key -> new QuoteMarket(key, 1));
  }

  /** L'état courant du marché : à charger avant d'ouvrir le flux. */
  @GetMapping
  public List<QuoteDto> snapshot(@RequestParam(defaultValue = "10000") int size) {
    return market(size).snapshot();
  }

  /** Flux d'événements {@code transaction} : {@code {"update":[...cotations modifiées...]}}. */
  @GetMapping(value = "/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
  public SseEmitter stream(@RequestParam(defaultValue = "10000") int size, @RequestParam(defaultValue = "10000") int rate) {
    if (rate < 1 || rate > MAX_RATE) {
      throw new IllegalArgumentException("Débit attendu entre 1 et " + MAX_RATE + " mises à jour par seconde");
    }
    QuoteMarket market = market(size);
    int perTick = Math.max(1, (int) (rate * TICK_MS / 1000));
    SseEmitter emitter = new SseEmitter(0L); // jusqu'à la fermeture par le navigateur
    ScheduledFuture<?> task = scheduler.scheduleAtFixedRate(() -> {
      try {
        emitter.send(SseEmitter.event().name("transaction").data(Map.of("update", market.tick(perTick)), MediaType.APPLICATION_JSON));
      } catch (IOException | IllegalStateException e) {
        emitter.completeWithError(e); // le navigateur est parti
      }
    }, 0, TICK_MS, TimeUnit.MILLISECONDS);
    Runnable stop = () -> task.cancel(false);
    emitter.onCompletion(stop);
    emitter.onTimeout(stop);
    emitter.onError(error -> stop.run());
    return emitter;
  }

  @ExceptionHandler(IllegalArgumentException.class)
  public ResponseEntity<String> badRequest(IllegalArgumentException e) {
    return ResponseEntity.badRequest().body(e.getMessage());
  }
}
