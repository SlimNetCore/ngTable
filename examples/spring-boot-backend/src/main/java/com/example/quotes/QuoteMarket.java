package com.example.quotes;

import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.SplittableRandom;

/**
 * Un marché simulé : {@code size} instruments dont le cours bouge au hasard. Les instruments initiaux
 * sont ceux de la démo Angular (mêmes formules), si bien qu'un instantané suivi du flux donne le même
 * résultat que le flux simulé dans le navigateur.
 */
public class QuoteMarket {

  static final String[] SECTORS = {"Énergie", "Banque", "Santé", "Industrie", "Technologie", "Luxe", "Télécoms", "Transport"};
  private static final DateTimeFormatter TIME = DateTimeFormatter.ofPattern("HH:mm:ss");

  private final QuoteDto[] quotes;
  private final SplittableRandom random;

  public QuoteMarket(int size, long seed) {
    this.quotes = new QuoteDto[size];
    this.random = new SplittableRandom(seed);
    for (int id = 0; id < size; id++) {
      quotes[id] = initial(id);
    }
  }

  static double round(double value) {
    return Math.round(value * 100) / 100.0;
  }

  static QuoteDto initial(int id) {
    double open = round(5 + ((id * 7919L) % 49_500) / 100.0);
    String symbol = "" + (char) ('A' + id % 26) + (char) ('A' + (id / 26) % 26)
        + "%4s".formatted(Integer.toString(id, 36).toUpperCase()).replace(' ', '0');
    return new QuoteDto(id, symbol, SECTORS[id % SECTORS.length], open, open, 0, (id * 104_729L) % 50_000,
        round(open - 0.01), round(open + 0.01), "");
  }

  public int size() {
    return quotes.length;
  }

  /** État courant de tous les instruments. */
  public synchronized List<QuoteDto> snapshot() {
    return new ArrayList<>(List.of(quotes));
  }

  /** Fait bouger {@code count} instruments tirés au hasard, et renvoie leur nouvel état. */
  public synchronized List<QuoteDto> tick(int count) {
    String time = LocalTime.now().format(TIME);
    List<QuoteDto> updated = new ArrayList<>(count);
    for (int k = 0; k < count; k++) {
      QuoteDto quote = quotes[random.nextInt(quotes.length)];
      double price = round(Math.max(0.5, quote.price() * (1 + (random.nextDouble() - 0.5) * 0.01)));
      QuoteDto next = new QuoteDto(quote.id(), quote.symbol(), quote.sector(), quote.open(), price,
          round((price - quote.open()) / quote.open() * 100), quote.volume() + random.nextInt(500),
          round(price - 0.01), round(price + 0.01), time);
      quotes[quote.id()] = next;
      updated.add(next);
    }
    return updated;
  }
}
