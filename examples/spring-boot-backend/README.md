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

Autres endpoints (la démo Angular les utilise tous) :

| Endpoint | Rôle |
|---|---|
| `POST /api/commandes/pivot` | Pivot calculé par la base : `{"rows":["client"],"columns":["statut","urgent"],"values":[{"id":"montant","aggregate":"sum"}],"columnSort":"asc","filters":{...}}` → colonnes (chemins), lignes, totaux, total général. Champs : `client`, `statut`, `mois`, `urgent` ; mesure : `montant` ; agrégats `sum`, `avg`, `min`, `max`, `count` |
| `PATCH /api/commandes/{id}` | Modifie `client`, `statut` (nom ou libellé) et/ou `montant` ; 400 si invalide (montant négatif, statut inconnu, client vide), 404 si la commande n'existe pas |
| `GET /api/quotes?size=N` | Instantané du marché simulé (N instruments, jusqu'à 200 000) |
| `GET /api/quotes/stream?size=N&rate=R` | Flux Server-Sent Events `transaction` : `{"update":[...]}` toutes les 100 ms, `R` mises à jour par seconde (jusqu'à 100 000) |
| `GET /api/dossiers` | Arborescence à plat de 5 096 lignes (`id`, `name`, `size`, `parent`), pour `[treeParent]` |

Nombre de commandes générées : `demo.commandes.count` dans `src/main/resources/application.properties` (100 000 par défaut, 0 pour aucune).

## Dans IntelliJ IDEA

1. Copiez le dossier `examples/spring-boot-backend` où vous voulez, par exemple dans `C:\Users\<vous>\IdeaProjects\ng-table-spring-backend`. Le projet est autonome : il ne dépend pas du reste du dépôt.
2. **File → Open**, puis choisissez le `pom.xml`, et ouvrez-le comme projet.
3. Réglez le SDK du projet sur un JDK 21 (**File → Project Structure → Project SDK**).
4. Lancez `CommandesApplication` (paquet `com.example`) (flèche verte dans la marge), ou la tâche Maven `spring-boot:run`.

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

34 tests (`./mvnw test`, aucun accès réseau nécessaire une fois les dépendances téléchargées). Ils couvrent le pivot (cellules, totaux, plusieurs champs en colonnes, moyenne recombinée, filtres, refus), l'édition, le flux de cotations et l'arborescence, ainsi que la requête de regroupement avec groupes repliés (via HTTP), chaque type de filtre, la recherche globale, le groupe des valeurs vides replié, l'export CSV et XLSX (contenu, ordre, types de cellules, fichiers temporaires supprimés), et les refus (colonne non déclarée, page sans taille, format inconnu).

## Structure

| Fichier | Rôle |
|---|---|
| `ngtable/NgTable.java` | Contrat JSON : requête (`remoteQueryChange`) et réponse (`rows`, `total`, `groupSummaries`) |
| `ngtable/NgTableColumn.java` | Ce que le serveur autorise pour chaque colonne (filtre, tri, recherche, regroupement, agrégat) |
| `ngtable/NgTableJpaSearch.java` | Traduction en JPA Criteria : filtres, recherche, tri, groupes repliés, pagination, résumés |
| `ngtable/NgTableExporter.java` | Export CSV / XLSX au fil de l'eau (colonnes affichées, toutes les lignes) |
| `ngtable/NgTablePivot.java`, `ngtable/NgTablePivotSearch.java` | Contrat et moteur du pivot : un `GROUP BY` JPA, totaux et moyennes recombinés |
| `commandes/CommandeSearchService.java` | Déclaration des colonnes de l'écran « Commandes », champs du pivot, édition |
| `quotes/` | Marché simulé et flux SSE de cotations |
| `dossiers/` | Arborescence à plat |
| `commandes/CommandeController.java` | `POST /api/commandes/search` et `POST /api/commandes/export` |
| `commandes/CommandeDataSeeder.java` | Données de démonstration, identiques à celles du serveur simulé de la démo |

Pour une vraie base (PostgreSQL...), remplacez la dépendance `h2` et `spring.datasource.*`, et retirez `CommandeDataSeeder`. Les quatre classes du paquet `ngtable` se réutilisent telles quelles pour d'autres tables.
