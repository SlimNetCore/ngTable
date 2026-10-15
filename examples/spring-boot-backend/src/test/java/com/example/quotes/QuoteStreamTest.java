package com.example.quotes;

import static java.nio.charset.StandardCharsets.UTF_8;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.request;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.DocumentContext;
import com.jayway.jsonpath.JsonPath;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

/** Contrôleur seul (sans base ni socket) : le flux est lu dans la réponse au fur et à mesure qu'il s'écrit. */
class QuoteStreamTest {

  private final MockMvc mvc = MockMvcBuilders.standaloneSetup(new QuoteController()).build();

  @Test
  void lInstantaneContientLesInstrumentsDeLaDemoAngular() throws Exception {
    String body = mvc.perform(get("/api/quotes?size=100")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString(UTF_8);
    DocumentContext quotes = JsonPath.parse(body);

    assertThat(quotes.read("$.length()", Integer.class)).isEqualTo(100);
    assertThat(quotes.read("$[0].id", Integer.class)).isZero();
    // Mêmes formules que `makeQuote` côté Angular : symbole, secteur et cours d'ouverture de l'instrument 3.
    assertThat(quotes.read("$[3].symbol", String.class)).isEqualTo("DA0003");
    assertThat(quotes.read("$[3].sector", String.class)).isEqualTo("Industrie"); // SECTORS[3 % 8]
    assertThat(quotes.read("$[3].open", Double.class)).isEqualTo(QuoteMarket.round(5 + ((3 * 7919L) % 49_500) / 100.0));
    assertThat(quotes.read("$[3].price", Double.class)).isEqualTo(quotes.read("$[3].open", Double.class));
  }

  /** Événements {@code transaction} reçus : attend (3 s au plus) d'en avoir {@code count}. */
  private List<DocumentContext> transactions(MvcResult result, int count) throws Exception {
    long deadline = System.currentTimeMillis() + 3_000;
    List<DocumentContext> found = new ArrayList<>();
    while (System.currentTimeMillis() < deadline) {
      found.clear();
      String content = result.getResponse().getContentAsString(UTF_8);
      for (String block : content.split("\n\n")) {
        if (block.contains("event:transaction")) {
          int data = block.indexOf("data:");
          found.add(JsonPath.parse(block.substring(data + 5)));
        }
      }
      if (found.size() >= count) {
        return found;
      }
      Thread.sleep(20);
    }
    return found;
  }

  @Test
  void leFluxEnvoieDesTransactionsQuiModifientLInstantane() throws Exception {
    MvcResult result = mvc.perform(get("/api/quotes/stream?size=500&rate=1000").accept(MediaType.TEXT_EVENT_STREAM))
        .andExpect(request().asyncStarted()).andReturn();

    List<DocumentContext> transactions = transactions(result, 2);

    assertThat(transactions).hasSizeGreaterThanOrEqualTo(2);
    // 1 000 mises à jour par seconde, un paquet toutes les 100 ms : 100 cotations par paquet.
    assertThat(transactions.get(0).read("$.update.length()", Integer.class)).isEqualTo(100);
    assertThat(transactions.get(0).read("$.update[0].updatedAt", String.class)).matches("\\d\\d:\\d\\d:\\d\\d");

    String snapshot = mvc.perform(get("/api/quotes?size=500")).andReturn().getResponse().getContentAsString(UTF_8);
    List<String> moved = JsonPath.parse(snapshot).read("$[?(@.updatedAt != '')].updatedAt");
    assertThat(moved).as("des instruments ont bougé depuis l'ouverture du flux").isNotEmpty();
  }

  @Test
  void refuseUneTailleOuUnDebitHorsLimites() throws Exception {
    for (String path : List.of("/api/quotes?size=0", "/api/quotes?size=999999", "/api/quotes/stream?size=10&rate=0", "/api/quotes/stream?size=10&rate=999999")) {
      mvc.perform(get(path)).andExpect(status().isBadRequest());
    }
  }

  @Test
  void leMarcheReproduitLesInstrumentsDeLaDemoEtFaitBougerLesCours() {
    QuoteMarket market = new QuoteMarket(1000, 42);
    assertThat(market.snapshot().get(26).symbol()).isEqualTo("AB000Q"); // 26 -> 'A', 'B' (26 / 26), puis 26 en base 36 (« Q »)
    List<QuoteDto> updated = market.tick(300);
    assertThat(updated).hasSize(300);
    QuoteDto last = updated.get(updated.size() - 1);
    assertThat(market.snapshot().get(last.id())).isEqualTo(last); // l'instantané reflète le dernier état
    assertThat(last.bid()).isLessThan(last.ask());
    assertThat(last.change()).isEqualTo(QuoteMarket.round((last.price() - last.open()) / last.open() * 100));
  }
}
