package com.example.ngtable;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;

class NgTableExporterTest {

  record Line(String text, Integer number) {
  }

  private final NgTableExporter<Line> exporter = new NgTableExporter<Line>()
      .column("text", Line::text)
      .column("number", Line::number)
      .maxRows(10);

  private static NgTable.ExportRequest request(String format, String filename) {
    return new NgTable.ExportRequest(null, null, null, null, null, null, null,
        List.of(new NgTable.ExportColumn("text", "Texte"), new NgTable.ExportColumn("number", "Nombre")), format, filename);
  }

  @Test
  void csv_echappeGuillemetsPointsVirgulesEtRetoursALaLigne() throws Exception {
    NgTableExporter.Download download = exporter.prepare(request("csv", "x"), 3);
    ByteArrayOutputStream out = new ByteArrayOutputStream();
    exporter.write(download, request("csv", "x").columns(),
        Stream.of(new Line("a;b", 1), new Line("dit \"oui\"", null), new Line("deux\nlignes", 3)), out);

    assertThat(out.toString(StandardCharsets.UTF_8)).isEqualTo(
        "﻿Texte;Nombre\r\n\"a;b\";1\r\n\"dit \"\"oui\"\"\";\r\n\"deux\nlignes\";3");
  }

  @Test
  void nomDeFichierNettoye_etLimiteDeLignes() {
    assertThat(exporter.prepare(request("xlsx", "../../etc/passwd"), 1).filename()).isEqualTo("....etcpasswd.xlsx");
    assertThat(exporter.prepare(request("CSV", "  "), 1).filename()).isEqualTo("export.csv");
    assertThatThrownBy(() -> exporter.prepare(request("csv", "x"), 11))
        .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("10 lignes");
  }

  @Test
  void xlsx_neLaissePasDeFichierTemporaire() throws Exception {
    File poiDir = new File(System.getProperty("java.io.tmpdir"), "poifiles");
    int before = count(poiDir);
    NgTableExporter.Download download = exporter.prepare(request("xlsx", "x"), 2);
    exporter.write(download, request("xlsx", "x").columns(), Stream.of(new Line("a", 1), new Line("b", 2)), new ByteArrayOutputStream());
    assertThat(count(poiDir)).isEqualTo(before);
  }

  private static int count(File dir) {
    String[] files = dir.list();
    return files == null ? 0 : files.length;
  }
}
