# Feuille de route — améliorations de `@sbourahla/ng-table`

Suivi des améliorations décidées le 2026-09-25. Mettez à jour ce fichier à chaque étape.

**Statuts** : `À faire` · `En cours` · `Fait (à vérifier)` (code écrit, build/tests pas encore lancés) · `Vérifié` (build + tests OK) · `Abandonné`

**Décisions** (2026-09-25) :
- Export xlsx : générateur maison sans dépendance, au lieu de SheetJS (la version npm `xlsx@0.18.5` n'est plus maintenue et a des failles connues).
- Sync URL : `@angular/router` en peerDependency **optionnelle**, injectée seulement si la fonctionnalité est activée.
- Version : passage en **1.0.0** avec CHANGELOG et guide de migration (plusieurs changements cassants).
- Structure : workspace Angular standard, lib dans `projects/ng-table`, démo dans `projects/demo`.

## Points de contrôle

Les commandes sont lancées par l'assistant (Bash / terminal WebStorm).

| # | Quand | À lancer | Statut |
|---|-------|----------|--------|
| C1 | Après l'outillage (phase 1) | `node scripts/migrate-to-workspace.mjs` puis `npm install`, `npm run build`, `npm run test:ci`, `npm start` | Passé (2026-09-25) |
| C2 | Après les refontes (phase 3) | `npm run lint`, `npm run test:ci`, `npm run build`, tester la démo | Passé (2026-09-25) |
| C3 | Avant la publication 1.0.0 | Tout, plus un test manuel dans votre application | En partie : paquet 1.0.0 installé dans une application Angular 22 neuve (build + navigateur OK) ; reste le test dans votre application |

## 1. Outillage et qualité

| ID | Amélioration | Statut | Notes |
|----|--------------|--------|-------|
| O1 | Workspace Angular (lib + démo) | Vérifié | Migration faite |
| O2 | Tests exécutables (Vitest via `@angular/build:unit-test`) | Vérifié | 130 tests OK ; `npm test` / `npm run test:ci` |
| O3 | CI GitHub Actions | Fait (à vérifier) | Nécessite de committer `package-lock.json` |
| O4 | ESLint (angular-eslint) | Vérifié | 0 erreur, 0 avertissement ; `no-explicit-any` en erreur |
| O5 | Application de démo | Vérifié | Trois modes routés : simple (code affiché), avancé (toutes les options en local, panneau de réglages), expert (faux serveur, mode contrôlé, filtre personnalisé, API, journal d'événements) |
| O6 | CHANGELOG, semver, guide de migration 1.0.0 | Fait | CHANGELOG `[1.0.0]` daté ; guide « Migrer de 0.4 vers 1.0 » dans le README (visible sur npm) ; version 1.0.0 dans `projects/ng-table/package.json` |
| O7 | Ménage du repo | Fait (à vérifier) | `.gitignore` ; fichiers obsolètes supprimés par le script |
| O8 | Harness de test CDK (`NgTableHarness`) | Vérifié | Point d'entrée `@sbourahla/ng-table/testing` (construit par ng-packagr, présent dans `exports`) ; lignes, en-têtes, tri, recherche, sélection, paginateur ; 4 tests |

## 2. Performance

| ID | Amélioration | Statut | Notes |
|----|--------------|--------|-------|
| P1 | Scroll virtuel | Vérifié | Fenêtrage maison (le CDK virtual scroll gère mal `mat-table`, l'en-tête fixe et les lignes multiples) : lignes d'espacement + tranche visible, hauteur mesurée, bornes seules recalculées ; `virtual-window.ts` testé ; 4 tests composant ; vérifié sur 50 000 lignes dans la démo (22 à 30 lignes rendues, position exacte au milieu et en fin de liste) |
| P2 | Modèle de vue précalculé par ligne | Vérifié | `row-view.ts` : valeur, texte, texte copié, contexte de `cellTemplate` et classes calculés dans un `computed` sur les lignes rendues × colonnes visibles (signaux lus par les accessors suivis). 50 sélections sur 100 lignes × 10 colonnes : 0 appel à `valueAccessor` au lieu de 105 000, ~20 % de temps en moins sous jsdom ; 4 tests purs + 3 tests composant ; vérifié dans la démo |
| P3 | Sélection en O(1) (`Set` mémoïsé) | Fait (à vérifier) | `selectedKeysSet` ; case « tout sélectionner » en `computed` |

## 3. Architecture et fiabilité

| ID | Amélioration | Statut | Notes |
|----|--------------|--------|-------|
| A1 | Découper le composant monolithique | En cours | Modules purs extraits et testés : `views-storage.ts` (format + localStorage), `filter-matching.ts`, `export-writers.ts`, `grid-navigation.ts`, `row-pipeline.ts` (filtres, recherche, tri), `dom-utils.ts`. Composant : 3 112 → 2 885 lignes. Reste : redimensionnement et vues (logique liée à l'état du composant) |
| A2 | Mode non contrôlé pour `pageIndex`/`pageSize` | Vérifié | `model()` + paginateur intégré `[paginator]` (local et remote, `[totalCount]`), recul automatique sur la dernière page, pagination des vues réappliquée ; 4 tests ; démo simplifiée (plus de `<mat-paginator>` à relier) |
| A3 | Versionner le schéma des vues stockées | Fait (à vérifier) | `views-storage.ts` : version, migrations, vues malformées écartées |
| A4 | Protections SSR (`window`/`document`/`localStorage`) | Fait (à vérifier) | Le reste était déjà sûr (gestionnaires d'événements seulement). Limite connue : `isMobileView` vaut `false` côté serveur |

## 4. API et expérience développeur

| ID | Amélioration | Statut | Notes |
|----|--------------|--------|-------|
| D1 | Typage générique `NgTableComponent<T>` | Vérifié | Inférence de `T` vérifiée dans la démo (erreur volontaire détectée). 87 `any` → 0 ; `no-explicit-any` passe en erreur. Écart de type réel trouvé : `detailToggle.row` pouvait être `null` |
| D2 | Exporter `ColumnFilterType` | Fait (à vérifier) | |
| D3 | Méthodes internes en `protected` | Vérifié | 75 membres passés en `protected`, API publique listée dans le README ; spec adaptée (156 accès par indexation) |
| D4 | Pack de labels anglais | Vérifié | `NG_TABLE_LABELS_EN` ; « Search… », « Columns », « Views », « Export » (démo et application neuve) |

## 5. Fonctionnalités

| ID | Amélioration | Statut | Notes |
|----|--------------|--------|-------|
| F1 | En-tête sticky | Vérifié | `[stickyHeader]` + `[maxHeight]` ; en-tête resté en haut après 400 px de défilement (démo) |
| F2 | Colonnes épinglées (gauche/droite) | Vérifié | `column.pinned` ; regroupées aux bords ; fixes au défilement horizontal, colonnes libres décalées (démo) |
| F3 | Tri multi-colonnes | Vérifié | `[multiSort]` + Maj+clic, rang affiché, `sorts` en remote et dans les vues ; clés précalculées, tri stable ; 3 tests ; testé dans la démo |
| F4 | Densité compacte | Vérifié | `[density]="'compact'"` via les tokens Material ; ligne de 52 à 45 px (démo) |
| F5 | Recherche globale | Vérifié | `[globalSearchEnabled]`, `column.searchable`, champ `search` en remote, sauvegardée dans les vues. Texte des lignes mis en cache (`WeakMap`) : pas de recalcul à chaque frappe. 3 tests purs + 7 tests composant OK, testée dans la démo |
| F6 | Filtre numérique par plage | Vérifié (partiel) | `type: 'numberRange'` ; logique testée (Vitest), UI compilée |
| F7 | Opérateurs de filtre | Vérifié (partiel) | `filter.operator` (texte), expressions `>`, `<=`, `!=`, `a..b` (number) ; logique testée |
| F8 | Regroupement de lignes + agrégats | Vérifié | Logique pure dans `row-grouping.ts` (groupes, unités de pagination, en-têtes, agrégats) ; `displayedRows()` reste `T[]`, les en-têtes passent par une source interne ; ligne de totaux ; vues ; 4 tests purs + 6 tests composant ; testé dans la démo. Mode remote : en-têtes sur la page reçue, résumés serveur (`[groupSummaries]`), groupes repliables (`collapsedGroups`, placement par `remoteGroupedPage`) |
| F9 | Export xlsx | Vérifié (partiel) | `[exportFormat]="'xlsx'"` ; `export-writers.ts` sans dépendance ; zip/XML validés hors navigateur, câblage UI compilé |
| F10 | Vue par défaut | Vérifié | Étoile dans le menu, `defaultViewId` dans le store (validé au chargement) ; 2 tests composant + 1 test pur ; testée dans la démo |
| F11 | Import/export de vues | Vérifié | `[viewsImportExportEnabled]`, `exportViews()`/`importViews()` ; fusion par nom via `mergeViewsStores` (testée) ; 2 tests composant ; testée dans la démo |
| F13 | Colonne de référence choisie dans le menu « Colonnes » | Vérifié | Demande utilisateur. Punaise par colonne (désactivée si masquée), `referenceColumn` en `model()` (`undefined` / id / `null`), remplace les `pinned: 'left'` déclarés, enregistrée dans les vues ; 4 tests ; testée dans la démo (mode avancé) |
| F12 | Synchronisation de l'état dans l'URL | Vérifié | `@sbourahla/ng-table/router` (`ngTableUrlState`, préfixe) ; bundle principal sans import du router (vérifié dans `dist`) ; API `getQueryState`/`applyQueryState`/`queryStateChange` ; 3 tests purs + 3 tests avec vrai router + 2 tests composant ; testé dans la démo |

## 5bis. Constaté en cours de route

| ID | Amélioration | Statut | Notes |
|----|--------------|--------|-------|
| L1 | En-têtes illisibles dans une colonne étroite | Vérifié | Cause : `table-layout: fixed` répartissait `minTableWidthPx` sans plancher (71 px par colonne dans la démo). Largeur mini du tableau = somme des largeurs mini des colonnes ; poignée en position absolue dans la marge ; bouton filtre ramené à 28 px. Libellés de 0 à 26-52 px dans la démo ; 1 test |

## 6. Accessibilité

| ID | Amélioration | Statut | Notes |
|----|--------------|--------|-------|
| X1 | Navigation clavier cellule par cellule (APG Grid) | Vérifié | `[cellNavigation]` ; logique dans `grid-navigation.ts` (calcul pur testé + tabindex itinérant) ; 4 tests purs + 5 tests DOM ; testée au vrai clavier dans la démo, y compris après changement de page |
| X2 | Annonces `aria-live` sur tri/filtres | Vérifié | Région `role="status"` ; tri + nombre de lignes (local), tri seul (remote) ; message identique réannoncé ; 3 tests |

## Journal

- **2026-09-25** — Création de la feuille de route. Phase 1 (outillage) écrite, plus les points à faible risque D2, D4, P3, A3, A4. En attente du point de contrôle C1 avant les refontes (A1, P1, P2, D1...).
- **2026-09-25** — C1 : `npm i` en échec (ERESOLVE, mélange Angular 22.1 / 22.2 entre l'ancien lockfile et `@angular/build`). Framework aligné sur `^22.2.0`.
- **2026-09-25** — `npm i` réussi (Angular 22.2.0, Vitest 4.1.11). Migration du workspace bloquée côté assistant (déplacement/suppression de fichiers) : à lancer par l'utilisateur. En attendant, vérification par `ngc --noEmit` (templates stricts) et Vitest direct sur les modules purs.
- **2026-09-25** — F1, F2, F4, F6, F7 écrits. Bug corrigé au passage : un filtre `enum` avec 2 valeurs cochées ou plus ne matchait plus aucune ligne. Les filtres `number`/`search`/etc. sont maintenant debouncés comme `text`.
- **2026-09-25** — F9 : export xlsx écrit (`export-writers.ts`, avec le CSV extrait au passage). 22 tests Vitest OK sur les modules purs. Un fichier généré a été ouvert par .NET (`Expand-Archive`) et ses 6 parties XML parsées sans erreur. Nombres et booléens restent typés dans Excel.
- **2026-09-25** — README et démo mis à jour (F1, F2, F4, F6, F7, F9). F5 (recherche globale) écrit. La vérification (`ngc`, Vitest) a été refusée par le classifieur de permissions de l'assistant : c'est à l'utilisateur de la lancer.
- **2026-09-25** — C1 passé. Tests : 130/130 après correction de 6 erreurs de typage dans l'ancienne spec (jamais compilée jusqu'ici) et de 3 tests fragiles (faux timers avant `whenStable`, `Blob.text()` absent de jsdom, spies non restaurés). **Bug réel trouvé** : avec `multiTemplateDataRows`, `index` est indéfini, d'où « Sélectionner la ligne NaN » et un index indéfini passé à `detailRowWhen`. Passage à `dataIndex`. Lint : 0 erreur (84 avertissements `any`, traités par D1). Build lib + démo OK, recherche globale testée dans la démo.
- **2026-09-25** — F10 + F11 faits et vérifiés (137 tests OK, lint 0 erreur, démo). Corrigé au passage : les écritures du store (enregistrer, mettre à jour, supprimer) reconstruisaient l'objet et auraient perdu tout champ ajouté, dont `defaultViewId`. Régression de mise en page corrigée : sous 900 px, les boutons d'action occupaient chacun une ligne depuis l'ajout de la recherche.
- **2026-09-25** — X2 fait et vérifié (140 tests OK, lint 0 erreur).
- **2026-09-25** — F3 fait et vérifié (143 tests OK, lint 0 erreur, démo). Démo : `minTableWidthPx` passé à 1200 pour que la colonne épinglée ait un intérêt. Ajout de L1 (en-têtes étroits illisibles, problème préexistant).
- **2026-09-25** — L1 corrigé et vérifié (144 tests, démo).
- **2026-09-25** — D1 fait et vérifié (144 tests, lint 0/0, build lib + démo).
- **2026-09-25** — D3 fait et vérifié (144 tests, lint 0/0, build lib + démo).
- **2026-09-25** — A2 fait et vérifié (148 tests, lint 0/0, démo).
- **2026-09-25** — O8 fait et vérifié (152 tests, lint 0/0, build). Note : l'option `include` du builder de tests est relative à `sourceRoot` (`src/`), d'où `../testing/**/*.spec.ts`.
- **2026-09-25** — F12 fait et vérifié (160 tests, lint 0/0, build des 3 points d'entrée, démo).
- **2026-09-25** — Retour utilisateur : filtres inline qui débordent de leur colonne. Mesuré dans la démo, colonne par colonne : +48 px pour les champs texte/nombre (`box-sizing` manquant sur `.field-shell`), libellé des dates sous l'icône du calendrier. Corrigé, 0 px de débordement mesuré ensuite. Démo refaite en trois modes. Trouvé en la construisant : un filtre booléen s'affichait « true » dans la barre des filtres actifs (corrigé). 161 tests OK.
- **2026-09-25** — F13 (colonne de référence dynamique) fait et vérifié (165 tests, lint 0/0, démo).
- **2026-09-25** — Démo (mode avancé) : exemple de paginateur personnalisé (`page-bar.component.ts`, sans Material) branché par `[pageTrackingEnabled]`, `[(pageIndex)]`, `[(pageSize)]`, `(filteredCountChange)`, avec le code affiché ; choix Intégrée / Personnalisée / Aucune. Vérifié dans le navigateur (navigation, taille de page, retour en page 1 après recherche, URL).
- **2026-09-25** — X1 fait et vérifié (174 tests, lint 0/0, démo au clavier). Piège rencontré : `#ref` sur `<table mat-table>` désigne l'instance `MatTable`, d'où `viewChild(..., {read: ElementRef})`.
- **2026-09-25** — A1 : extraction de `row-pipeline.ts` (filtres par colonne, recherche, tri multi-niveaux) et de `dom-utils.ts`, lecture/écriture `localStorage` déplacée dans `views-storage.ts`. 10 tests dédiés au pipeline. Trouvé en les écrivant : en tri décroissant, les cellules vides remontaient en tête ; elles restent maintenant en fin de liste. 184 tests OK.
- **2026-09-25** — F8 fait et vérifié (194 tests, lint 0/0, démo). Corrigé en le testant : libellé de groupe lu « Statut :Brouillon1 ligne(s) » par les lecteurs d'écran (espaces retirés par Angular entre les balises), libellé coupé dans une colonne épinglée, fond blanc de la cellule épinglée dans une ligne de groupe.
- **2026-09-25** — P1 fait et vérifié (201 tests, lint 0/0, démo 50 000 lignes). Ajusté en testant : une liste qui rétrécit sous un filtre, alors qu'on est défilé loin, affiche la dernière page de lignes au lieu d'une zone vide. Note de test : dans le panneau navigateur masqué, les événements `scroll` ne sont pas émis (pas d'étape de rendu) ; vérification faite en les déclenchant.
- **2026-09-25** — Demande utilisateur : regroupement activable/désactivable dans la démo (modes avancé et expert), et possible en mode remote. En remote, le serveur trie par `groupBy` et fournit compte et agrégats de chaque groupe (`[groupSummaries]`) ; la table dessine les en-têtes sur la page reçue ; groupes non repliables (replier fausserait la pagination serveur). Faux serveur de la démo étendu (tri par groupe + `GROUP BY`). 204 tests OK ; vérifié dans la démo.
- **2026-09-25** — Suite de la demande : groupes **repliables** en remote. `[groupSummaries]` devient la liste ordonnée de tous les groupes (`key`, `count`, `aggregates`) ; replier envoie `collapsedGroups` au serveur, qui exclut leurs lignes de la pagination ; la table replace les en-têtes repliés à leur position (`remoteGroupedPage`, 3 tests purs). `NgTableQueryState` gagne `groupBy` / `collapsedGroups`, l'URL gagne `g` (groupes repliés non écrits). Test de performance remote sur 1 000 000 de lignes (`ng-table.performance.spec.ts`) : coût lié à la page, pas au total. Vérification : 1 test dépendant de la locale (attendait `125 000`, la table suit la locale du navigateur) rendu indépendant. **Bug trouvé dans la démo** : « Tout replier » depuis une page lointaine laissait une page vide au-delà de la fin (ni lignes, ni en-têtes) ; la page est maintenant ramenée à la dernière page existante, calculée depuis les comptes des résumés (1 test). README, CHANGELOG et démo mis à jour. 213 tests, lint 0/0, build lib + démo, vérifié dans la démo.
- **2026-09-25** — P2 fait et vérifié (220 tests, lint 0/0, build lib + démo, démo avancée : templates, classes, copie, pagination). Choix : calcul immédiat dans un `computed` plutôt qu'un cache rempli à la demande, pour que les signaux lus par `valueAccessor` / `rowClassFn` invalident le résultat. Conséquence documentée (CHANGELOG, cassant) : une ligne modifiée sur place n'est plus relue à l'écran, comme c'était déjà le cas pour filtres et tri.
- **2026-09-25** — Demande utilisateur : exploiter la requête côté Spring Boot. README, Étape 17ter : contrat (`remoteQueryChange` et non `queryStateChange`), format des filtres par type, règles serveur (tri par `groupBy` d'abord, groupes repliés exclus de la page et du total, résumés de tous les groupes dans l'ordre des lignes, clés de groupe identiques à celles du client), extrait Angular (`HttpClient` + `switchMap`), code Java générique (`NgTable`, `NgTableColumn`, `NgTableJpaSearch`, JPA Criteria) + service et contrôleur d'exemple. Vérifié hors dépôt : projet Maven sur H2, 5 tests (la requête de la question via HTTP, chaque type de filtre, recherche, groupe vide replié, erreurs 400), verts sur Spring Boot 4.1.1 et 3.5.16, et en échec si l'exclusion des groupes repliés est retirée. Extrait Angular compilé (`ngc`, templates stricts) depuis le README.
- **2026-09-25** — Demande utilisateur : créer le projet Spring Boot et y brancher la démo. Le projet ne peut pas être écrit sur le poste de l'utilisateur (`C:\Users\...\IdeaProjects`) depuis l'environnement de l'assistant : il est livré dans `examples/spring-boot-backend` (autonome, Maven Wrapper, README avec les étapes IntelliJ), à copier dans IdeaProjects. Données générées avant l'ouverture du port HTTP (`SmartInitializingSingleton`) : sinon, des totaux partiels au démarrage. Démo expert : choix Simulé / Spring Boot, client `fetch` + proxy `/api` → `localhost:8080`, message si le backend est arrêté. **Bug corrigé dans la démo** : la colonne « Urgent » était regroupable alors que son `valueAccessor` renvoie « Oui » / « Non » (clés différentes de celles du serveur) ; les colonnes regroupables sont désormais explicites et identiques des deux côtés. Vérifié : 5 tests Maven, backend lancé (100 000 lignes en 4,6 s, ~20 ms par requête ensuite), et démo branchée dessus dans un navigateur (regroupement, repli, tri, filtres, recherche, page 2, backend arrêté).
- **2026-09-25** — Retour utilisateur : deux requêtes au changement de serveur dans la démo expert. Cause : `switchApi()` appelait `load()` puis `applyQueryState()`, qui émet lui-même `(remoteQueryChange)`. Seul `applyQueryState()` reste. Vérifié dans le navigateur, backend Spring Boot lancé : une requête HTTP par action (choix du serveur, regroupement, recherche avec et sans Entrée, repli, page suivante, bouton preset).
- **2026-09-25** — Demande utilisateur : colonne de référence dans la démo expert, et export côté serveur avec Spring. Démo expert : `[referenceColumnSelectable]`, choix CSV / Excel. Librairie : `(remoteExportRequested)` émet `NgTableRemoteExportRequest` (requête + `columns`, `format`, `filename`), sans quoi le serveur ne peut pas savoir quelles colonnes exporter (1 test). Spring : `POST /api/commandes/export`, `NgTableExporter` (CSV identique à l'export local, XLSX POI SXSSF typé), lignes lues en flux (`streamAll`) et détachées, validation avant écriture (400 plutôt qu'un fichier tronqué). Trouvé par les tests : la base renvoie `97.80` (échelle SQL) là où l'export local écrit `97.8` ; aligné. 11 tests Maven (dont fuite de fichiers temporaires POI, vérifiée par mutation). Vérifié dans le navigateur : punaise sur Client, Description masquée, filtre « urgentes validées » → CSV et XLSX de 5 000 lignes téléchargés et relus (colonnes dans l'ordre affiché, montant numérique, date Excel).
- **2026-09-25** — Retour utilisateur : brancher l'export sur Spring. C'était fait, mais deux choses l'empêchaient en pratique : la démo repartait sur « Serveur simulé » à chaque visite (l'export n'y produit pas de fichier), et un backend lancé avant la mise à jour renvoie 404 sur `/export` avec un message trompeur (« Lancez le backend »). Le choix du serveur est retenu (`localStorage`), et un 404 dit que le backend n'est pas à jour. Vérifié dans le navigateur avec l'ancien backend (message clair) puis le backend à jour (commandes.csv, 100 000 lignes ; choix retenu après rechargement).
- **2026-09-25** — Demande utilisateur : publier la 1.0.0. Pas d'identifiants npm dans l'environnement de l'assistant (et la publication est quasi irréversible) : publication préparée, commande finale laissée à l'utilisateur. Version 1.0.0, CHANGELOG daté, guide de migration dans le README (corrigé au passage : il citait une entrée `[sorts]` qui n'existe pas). Points « à vérifier » contrôlés dans le navigateur : F1, F2, F4, D4 → Vérifié. C2 passé : lint 0/0, 221 tests, build des 3 points d'entrée, build démo. `npm pack` : 12 fichiers, 238 kB, ni démo ni exemples. Tarball installé dans une application Angular 22 neuve (`ng new`) : build OK, table, recherche et état dans l'URL fonctionnent dans le navigateur.
