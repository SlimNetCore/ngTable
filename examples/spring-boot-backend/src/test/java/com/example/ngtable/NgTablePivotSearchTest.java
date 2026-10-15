package com.example.ngtable;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import org.junit.jupiter.api.Test;

class NgTablePivotSearchTest {

  @Test
  void ordreNaturelDesLibelles() {
    List<String> sorted = List.of("10", "9", "a2", "A10", "b", "a1").stream().sorted(NgTablePivotSearch::natural).toList();
    assertThat(sorted).containsExactly("9", "10", "a1", "a2", "A10", "b");
  }

  @Test
  void leContratAUneValeurParDefautPourChaqueChampAbsent() {
    NgTablePivot.Request request = new NgTablePivot.Request(null, null, null, "n'importe quoi", null, null);
    assertThat(request.rows()).isEmpty();
    assertThat(request.columns()).isEmpty();
    assertThat(request.columnSort()).isEqualTo("asc");
    assertThat(new NgTablePivot.Value("montant", null).aggregate()).isEqualTo("sum");
  }
}
