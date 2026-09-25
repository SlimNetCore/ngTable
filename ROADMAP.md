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
| C2 | Après les refontes (phase 3) | `npm run lint`, `npm run test:ci`, `npm run build`, tester la démo | À faire |
| C3 | Avant la publication 1.0.0 | Tout, plus un test manuel dans votre application | À faire |

## 1. Outillage et qualité

| ID | Amélioration | Statut | Notes |
|----|--------------|--------|-------|
| O1 | Workspace Angular (lib + démo) | Vérifié | Migration faite |
| O2 | Tests exécutables (Vitest via `@angular/build:unit-test`) | Vérifié | 130 tests OK ; `npm test` / `npm run test:ci` |
| O3 | CI GitHub Actions | Fait (à vérifier) | Nécessite de committer `package-lock.json` |
| O4 | ESLint (angular-eslint) | Vérifié | 0 erreur, 0 avertissement ; `no-explicit-any` en erreur |
| O5 | Application de démo | Vérifié | Trois modes routés : simple (code affiché), avancé (toutes les options en local, panneau de réglages), expert (faux serveur, mode contrôlé, filtre personnalisé, API, journal d'événements) |
| O6 | CHANGELOG, semver, guide de migration 1.0.0 | En cours | Rempli au fil des phases |
| O7 | Ménage du repo | Fait (à vérifier) | `.gitignore` ; fichiers obsolètes supprimés par le script |
| O8 | Harness de test CDK (`NgTableHarness`) | Vérifié | Point d'entrée `@sbourahla/ng-table/testing` (construit par ng-packagr, présent dans `exports`) ; lignes, en-têtes, tri, recherche, sélection, paginateur ; 4 tests |

## 2. Performance

| ID | Amélioration | Statut | Notes |
|----|--------------|--------|-------|
| P1 | Scroll virtuel | À faire | Après C1 (refonte risquée) |
| P2 | Modèle de vue précalculé par ligne | À faire | Après C1 |
| P3 | Sélection en O(1) (`Set` mémoïsé) | Fait (à vérifier) | `selectedKeysSet` ; case « tout sélectionner » en `computed` |

## 3. Architecture et fiabilité

| ID | Amélioration | Statut | Notes |
|----|--------------|--------|-------|
| A1 | Découper le composant monolithique | En cours | Extraits : `views-storage.ts`, `filter-matching.ts` (fonctions pures testées) |
| A2 | Mode non contrôlé pour `pageIndex`/`pageSize` | Vérifié | `model()` + paginateur intégré `[paginator]` (local et remote, `[totalCount]`), recul automatique sur la dernière page, pagination des vues réappliquée ; 4 tests ; démo simplifiée (plus de `<mat-paginator>` à relier) |
| A3 | Versionner le schéma des vues stockées | Fait (à vérifier) | `views-storage.ts` : version, migrations, vues malformées écartées |
| A4 | Protections SSR (`window`/`document`/`localStorage`) | Fait (à vérifier) | Le reste était déjà sûr (gestionnaires d'événements seulement). Limite connue : `isMobileView` vaut `false` côté serveur |

## 4. API et expérience développeur

| ID | Amélioration | Statut | Notes |
|----|--------------|--------|-------|
| D1 | Typage générique `NgTableComponent<T>` | Vérifié | Inférence de `T` vérifiée dans la démo (erreur volontaire détectée). 87 `any` → 0 ; `no-explicit-any` passe en erreur. Écart de type réel trouvé : `detailToggle.row` pouvait être `null` |
| D2 | Exporter `ColumnFilterType` | Fait (à vérifier) | |
| D3 | Méthodes internes en `protected` | Vérifié | 75 membres passés en `protected`, API publique listée dans le README ; spec adaptée (156 accès par indexation) |
| D4 | Pack de labels anglais | Fait (à vérifier) | `NG_TABLE_LABELS_EN` |

## 5. Fonctionnalités

| ID | Amélioration | Statut | Notes |
|----|--------------|--------|-------|
| F1 | En-tête sticky | Fait (à vérifier) | `[stickyHeader]` + `[maxHeight]` ; compilé |
| F2 | Colonnes épinglées (gauche/droite) | Fait (à vérifier) | `column.pinned` ; regroupées aux bords ; compilé |
| F3 | Tri multi-colonnes | Vérifié | `[multiSort]` + Maj+clic, rang affiché, `sorts` en remote et dans les vues ; clés précalculées, tri stable ; 3 tests ; testé dans la démo |
| F4 | Densité compacte | Fait (à vérifier) | `[density]="'compact'"` via les tokens Material ; compilé |
| F5 | Recherche globale | Vérifié | `[globalSearchEnabled]`, `column.searchable`, champ `search` en remote, sauvegardée dans les vues. Texte des lignes mis en cache (`WeakMap`) : pas de recalcul à chaque frappe. 3 tests purs + 7 tests composant OK, testée dans la démo |
| F6 | Filtre numérique par plage | Vérifié (partiel) | `type: 'numberRange'` ; logique testée (Vitest), UI compilée |
| F7 | Opérateurs de filtre | Vérifié (partiel) | `filter.operator` (texte), expressions `>`, `<=`, `!=`, `a..b` (number) ; logique testée |
| F8 | Regroupement de lignes + agrégats | À faire | |
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
| X1 | Navigation clavier cellule par cellule (APG Grid) | À faire | |
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
