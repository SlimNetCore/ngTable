package com.example.dossiers;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.HashSet;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.Test;

class DossierControllerTest {

  @Test
  void chaqueLigneDonneSonParentEtLArbreEstCoherent() {
    List<Dossier> tree = new DossierController().all();
    Set<String> ids = new HashSet<>();
    tree.forEach(dossier -> assertThat(ids.add(dossier.id())).as("identifiant unique : " + dossier.id()).isTrue());

    long roots = tree.stream().filter(dossier -> dossier.parent() == null).count();
    assertThat(roots).isEqualTo(8);
    // Tout parent cité existe, et il précède ses enfants (ordre d'arrivée stable).
    Set<String> seen = new HashSet<>();
    for (Dossier dossier : tree) {
      if (dossier.parent() != null) {
        assertThat(seen).as("parent de " + dossier.id()).contains(dossier.parent());
      }
      seen.add(dossier.id());
    }
    assertThat(tree).hasSize(8 * (1 + 6 * (1 + 5 * (1 + 20))));
  }

  @Test
  void lesDossiersPesentZeroEtLesFichiersUneTailleDeterministe() {
    List<Dossier> first = DossierController.build();
    List<Dossier> second = DossierController.build();
    assertThat(second).isEqualTo(first);
    assertThat(first.stream().filter(dossier -> dossier.id().endsWith("/fichier-1")).allMatch(dossier -> dossier.size() > 0)).isTrue();
    assertThat(first.stream().filter(dossier -> !dossier.id().contains("fichier-")).allMatch(dossier -> dossier.size() == 0)).isTrue();
  }
}
