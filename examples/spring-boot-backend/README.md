# Backend Spring Boot pour `@sbourahla/ng-table` (mode `remote`)

Un vrai backend pour la table en mode `remote` : filtres, recherche globale, tri multi-colonnes, regroupement avec groupes repliés, pagination, résumés de groupes, et export CSV / Excel de toutes les lignes. Spring Boot 4.1 (le code fonctionne aussi avec Spring Boot 3.5), Java 21, JPA, base H2 en mémoire remplie au démarrage avec 100 000 commandes.

Le fonctionnement est expliqué dans le README principal, à l'**Étape 17ter**.

## Lancer le backend

Prérequis : un JDK 21. Maven n'est pas nécessaire, le wrapper (`mvnw`) le télécharge.

```bash
cd examples/spring-boot-backend
./mvnw spring-boot:run        # Windows : mvnw.cmd spring-boot:run
```

Le serveur écoute sur http://localhost:8080. Pour l'essayer :

```bash
curl -X POST http://localhost:8080/api/commandes/search -H "Content-Type: application/json" \
  -d '{"sorts":[{"columnId":"montant","direction":"desc"}],"filters":{"statut":"VALIDEE"},"page":{"index":0,"size":5},"groupBy":"statut","collapsedGroups":[]}'
```

Export (ce qu'émet `(remoteExportRequested)`) :

```bash
curl -X POST http://localhost:8080/api/commandes/export -H "Content-Type: application/json" -o commandes.xlsx \
  -d '{"sorts":[{"columnId":"montant","direction":"desc"}],"filters":{"statut":"VALIDEE"},"page":{"index":0,"size":20},"columns":[{"id":"reference","header":"Référence"},{"id":"montant","header":"Montant"}],"format":"xlsx","filename":"commandes"}'
```

Nombre de commandes générées : `demo.commandes.count` dans `src/main/resources/application.properties` (100 000 par défaut, 0 pour aucune).

## Dans IntelliJ IDEA

1. Copiez le dossier `examples/spring-boot-backend` où vous voulez, par exemple dans `C:\Users\<vous>\IdeaProjects\ng-table-spring-backend`. Le projet est autonome : il ne dépend pas du reste du dépôt.
2. **File → Open**, puis choisissez le `pom.xml`, et ouvrez-le comme projet.
3. Réglez le SDK du projet sur un JDK 21 (**File → Project Structure → Project SDK**).
4. Lancez `CommandesApplication` (flèche verte dans la marge), ou la tâche Maven `spring-boot:run`.

## Brancher la démo Angular

Dans le dépôt `ngTable`, avec le backend lancé :

```bash
npm start
```

Ouvrez http://localhost:4200/expert, puis choisissez **Serveur → Spring Boot (localhost:8080)**. Le bouton « Exporter » de la table télécharge alors le fichier généré par Spring, au format choisi dans **Format d'export**. La démo appelle `/api/commandes/search`, que le serveur de développement Angular relaie vers `localhost:8080` (`projects/demo/proxy.conf.json`). Il n'y a donc pas de CORS à configurer.

## Tests

```bash
./mvnw test
```

Ils couvrent la requête de regroupement avec groupes repliés (via HTTP), chaque type de filtre, la recherche globale, le groupe des valeurs vides replié, l'export CSV et XLSX (contenu, ordre, types de cellules, fichiers temporaires supprimés), et les refus (colonne non déclarée, page sans taille, format inconnu).

## Structure

| Fichier | Rôle |
|---|---|
| `ngtable/NgTable.java` | Contrat JSON : requête (`remoteQueryChange`) et réponse (`rows`, `total`, `groupSummaries`) |
| `ngtable/NgTableColumn.java` | Ce que le serveur autorise pour chaque colonne (filtre, tri, recherche, regroupement, agrégat) |
| `ngtable/NgTableJpaSearch.java` | Traduction en JPA Criteria : filtres, recherche, tri, groupes repliés, pagination, résumés |
| `ngtable/NgTableExporter.java` | Export CSV / XLSX au fil de l'eau (colonnes affichées, toutes les lignes) |
| `commandes/CommandeSearchService.java` | Déclaration des colonnes de l'écran « Commandes » |
| `commandes/CommandeController.java` | `POST /api/commandes/search` et `POST /api/commandes/export` |
| `commandes/CommandeDataSeeder.java` | Données de démonstration, identiques à celles du serveur simulé de la démo |

Pour une vraie base (PostgreSQL...), remplacez la dépendance `h2` et `spring.datasource.*`, et retirez `CommandeDataSeeder`. Les quatre classes du paquet `ngtable` se réutilisent telles quelles pour d'autres tables.
