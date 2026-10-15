package com.example.quotes;

/** Une cotation : les noms des champs sont ceux lus par les {@code valueAccessor} de la page « Live » de la démo. */
public record QuoteDto(int id, String symbol, String sector, double open, double price, double change, long volume,
                       double bid, double ask, String updatedAt) {
}
