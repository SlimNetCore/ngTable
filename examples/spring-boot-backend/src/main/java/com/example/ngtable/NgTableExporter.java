package com.example.ngtable;

import java.io.BufferedWriter;
import java.io.IOException;
import java.io.OutputStream;
import java.io.OutputStreamWriter;
import java.io.Writer;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Stream;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.CellStyle;
import org.apache.poi.ss.usermodel.Font;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.xssf.streaming.SXSSFSheet;
import org.apache.poi.xssf.streaming.SXSSFWorkbook;

/**
 * Écrit l'export demandé par {@code (remoteExportRequested)} : les colonnes affichées, dans
 * l'ordre et avec les libellés de la table, en CSV (comme l'export local : séparateur
 * {@code ;}, UTF-8 avec BOM) ou en XLSX (nombres, dates et booléens typés, en-têtes figés).
 * Les lignes sont écrites au fil de l'eau : rien n'est chargé en entier en mémoire.
 *
 * @param <E> type des lignes
 */
public class NgTableExporter<E> {

  public enum Format { CSV, XLSX }

  /** Ce que le contrôleur met dans les en-têtes HTTP, avant d'écrire le fichier. */
  public record Download(Format format, String filename, String contentType, long rowCount) {
  }

  private final Map<String, Function<? super E, ?>> values = new LinkedHashMap<>();
  private int maxRows = 200_000;

  /**
   * Colonne exportable : id de la colonne Angular, et valeur écrite dans le fichier
   * (texte affiché, nombre, {@code LocalDate}, booléen...).
   */
  public NgTableExporter<E> column(String id, Function<? super E, ?> value) {
    values.put(id, value);
    return this;
  }

  /** Nombre maximal de lignes exportées (200 000 par défaut). */
  public NgTableExporter<E> maxRows(int maxRows) {
    this.maxRows = maxRows;
    return this;
  }

  /**
   * Vérifie la demande AVANT d'écrire quoi que ce soit : une erreur au milieu d'un fichier
   * déjà envoyé donnerait un téléchargement tronqué au lieu d'une erreur 400.
   */
  public Download prepare(NgTable.ExportRequest request, long rowCount) {
    Format format = switch (request.format().toLowerCase(Locale.ROOT)) {
      case "csv" -> Format.CSV;
      case "xlsx" -> Format.XLSX;
      default -> throw new IllegalArgumentException("Format d'export inconnu : " + request.format());
    };
    if (request.columns().isEmpty()) {
      throw new IllegalArgumentException("Aucune colonne à exporter");
    }
    for (NgTable.ExportColumn column : request.columns()) {
      if (!values.containsKey(column.id())) {
        throw new IllegalArgumentException("Colonne non exportable : " + column.id());
      }
    }
    if (rowCount > maxRows) {
      throw new IllegalArgumentException(
          "Export limité à " + maxRows + " lignes (" + rowCount + " demandées) : affinez les filtres");
    }
    String base = request.filename().replaceAll("[^\\p{L}\\p{N}._ -]", "").strip();
    String filename = (base.isEmpty() ? "export" : base) + (format == Format.XLSX ? ".xlsx" : ".csv");
    String contentType = format == Format.XLSX
        ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        : "text/csv;charset=UTF-8";
    return new Download(format, filename, contentType, rowCount);
  }

  public void write(Download download, List<NgTable.ExportColumn> columns, Stream<? extends E> rows, OutputStream out)
      throws IOException {
    List<Function<? super E, ?>> accessors = columns.stream().<Function<? super E, ?>>map(c -> values.get(c.id())).toList();
    if (download.format() == Format.XLSX) {
      writeXlsx(columns, accessors, rows.iterator(), out);
    } else {
      writeCsv(columns, accessors, rows.iterator(), out);
    }
  }

  private void writeCsv(List<NgTable.ExportColumn> columns, List<Function<? super E, ?>> accessors,
                        Iterator<? extends E> rows, OutputStream out) throws IOException {
    Writer writer = new BufferedWriter(new OutputStreamWriter(out, StandardCharsets.UTF_8));
    // BOM UTF-8 : sans lui, Excel lit le CSV en Latin-1 et corrompt les accents.
    writer.write('﻿');
    writeCsvLine(writer, columns.stream().map(NgTable.ExportColumn::header).toList());
    while (rows.hasNext()) {
      E row = rows.next();
      writer.write("\r\n");
      writeCsvLine(writer, accessors.stream().map(accessor -> text(accessor.apply(row))).toList());
    }
    writer.flush();
  }

  private static void writeCsvLine(Writer writer, List<String> cells) throws IOException {
    for (int i = 0; i < cells.size(); i++) {
      if (i > 0) {
        writer.write(';');
      }
      String cell = cells.get(i);
      boolean quote = cell.indexOf('"') >= 0 || cell.indexOf(';') >= 0 || cell.indexOf('\n') >= 0 || cell.indexOf('\r') >= 0;
      writer.write(quote ? '"' + cell.replace("\"", "\"\"") + '"' : cell);
    }
  }

  private void writeXlsx(List<NgTable.ExportColumn> columns, List<Function<? super E, ?>> accessors,
                         Iterator<? extends E> rows, OutputStream out) throws IOException {
    // 100 lignes en mémoire au plus : les autres sont écrites dans un fichier temporaire.
    SXSSFWorkbook workbook = new SXSSFWorkbook(100);
    try {
      SXSSFSheet sheet = workbook.createSheet("Export");
      Font bold = workbook.createFont();
      bold.setBold(true);
      CellStyle headerStyle = workbook.createCellStyle();
      headerStyle.setFont(bold);
      CellStyle dateStyle = workbook.createCellStyle();
      dateStyle.setDataFormat(workbook.getCreationHelper().createDataFormat().getFormat("dd/mm/yyyy"));
      CellStyle dateTimeStyle = workbook.createCellStyle();
      dateTimeStyle.setDataFormat(workbook.getCreationHelper().createDataFormat().getFormat("dd/mm/yyyy hh:mm"));

      Row header = sheet.createRow(0);
      for (int i = 0; i < columns.size(); i++) {
        Cell cell = header.createCell(i);
        cell.setCellValue(columns.get(i).header());
        cell.setCellStyle(headerStyle);
        sheet.setColumnWidth(i, Math.min(60, Math.max(12, columns.get(i).header().length() + 4)) * 256);
      }
      sheet.createFreezePane(0, 1);

      int rowIndex = 1;
      while (rows.hasNext()) {
        E row = rows.next();
        Row line = sheet.createRow(rowIndex++);
        for (int i = 0; i < accessors.size(); i++) {
          Object value = accessors.get(i).apply(row);
          if (value == null) {
            continue;
          }
          Cell cell = line.createCell(i);
          switch (value) {
            case Number number -> cell.setCellValue(number.doubleValue());
            case Boolean bool -> cell.setCellValue(bool);
            case LocalDate date -> {
              cell.setCellValue(date);
              cell.setCellStyle(dateStyle);
            }
            case LocalDateTime dateTime -> {
              cell.setCellValue(dateTime);
              cell.setCellStyle(dateTimeStyle);
            }
            default -> cell.setCellValue(text(value));
          }
        }
      }
      workbook.write(out);
    } finally {
      workbook.close(); // supprime aussi les fichiers temporaires (POI 5)
    }
  }

  private static String text(Object value) {
    if (value == null) {
      return "";
    }
    if (value instanceof BigDecimal number) {
      // 97.80 (échelle de la colonne SQL) -> "97.8", comme l'export local de la table.
      return number.stripTrailingZeros().toPlainString();
    }
    return value.toString();
  }
}
