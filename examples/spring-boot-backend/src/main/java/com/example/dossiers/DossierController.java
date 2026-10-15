package com.example.dossiers;

import java.util.ArrayList;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Arborescence à plat (chaque ligne donne son parent), pour {@code [treeData]} avec {@code [treeParent]}.
 * Générée au démarrage, de façon déterministe : 8 racines, 6 dossiers, 5 sous-dossiers, 20 fichiers chacun.
 */
@RestController
@RequestMapping("/api/dossiers")
public class DossierController {

  private static final String[] ROOTS = {"Documents", "Images", "Projets", "Archives", "Vidéos", "Musique", "Téléchargements", "Sauvegardes"};
  private final List<Dossier> tree = build();

  @GetMapping
  public List<Dossier> all() {
    return tree;
  }

  static List<Dossier> build() {
    List<Dossier> all = new ArrayList<>();
    for (String root : ROOTS) {
      all.add(new Dossier(root, root, 0, null));
      for (int a = 1; a <= 6; a++) {
        String folder = root + "/dossier-" + a;
        all.add(new Dossier(folder, "dossier-" + a, 0, root));
        for (int b = 1; b <= 5; b++) {
          String sub = folder + "/sous-dossier-" + b;
          all.add(new Dossier(sub, "sous-dossier-" + b, 0, folder));
          for (int c = 1; c <= 20; c++) {
            all.add(new Dossier(sub + "/fichier-" + c, "fichier-%02d.dat".formatted(c), 10L + (a * 31L + b * 17L + c * 7L) % 900, sub));
          }
        }
      }
    }
    return all;
  }
}
