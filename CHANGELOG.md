# Changelog

Toutes les évolutions notables de `@sbourahla/ng-table`. Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/), versions suivant [SemVer](https://semver.org/lang/fr/).

## [1.0.0] — 2026-09-25

Première version majeure. Elle contient des changements cassants (section « Modifié (cassant) ») : voir « Migrer de 0.4 vers 1.0 » dans le README.

### Documentation
- `examples/spring-boot-backend` : export CSV / XLSX (`POST /api/commandes/export`, `NgTableExporter`, Apache POI en continu). Démo expert : punaise « colonne de référence » et choix du format d'export.
- `examples/spring-boot-backend` : le backend de l'Étape 17ter en projet Spring Boot autonome (H2, 100 000 commandes, tests, Maven Wrapper). La démo expert peut s'y brancher (**Serveur → Spring Boot**, proxy `/api` de `npm start`).
- README, Étape 17ter : backend Spring Boot complet pour le mode `remote` (contrat JSON requête / réponse, format des filtres par type, tri avec regroupement, groupes repliés, résumés de groupes), en JPA Criteria, testé avec Spring Boot 3.5 et 4.1.

### Outillage
- Démo en trois modes (simple, avancé, expert), un par route.
- Repo restructuré en workspace Angular : la lib est dans `projects/ng-table`, une application de démo dans `projects/demo` (`npm start`).
- Tests exécutables avec Vitest (`npm test`, `npm run test:ci`), lint avec angular-eslint (`npm run lint`), CI GitHub Actions.

### Ajouté
- `(remoteExportRequested)` émet un `NgTableRemoteExportRequest` : la requête courante, plus `columns` (colonnes visibles dans l'ordre affiché, hors `exportable: false`, avec leur libellé), `format` (`[exportFormat]`) et `filename` (`[exportFilename]`). Le serveur peut ainsi produire le même fichier que l'export local. Compatible : le type étend `NgTableRemoteQuery`.
- `NG_TABLE_LABELS_EN` : textes anglais prêts à l'emploi (`provideNgTableLabels(() => NG_TABLE_LABELS_EN)`).
- `ColumnFilterType` est exporté par l'API publique.
- `@angular/cdk` est déclaré en peerDependency (déjà requis de fait via Material) ; `@angular/router` en peerDependency optionnelle.
- `[stickyHeader]` et `[maxHeight]` : en-tête fixe dans une zone de défilement verticale.
- `column.pinned: 'left' | 'right'` : colonnes épinglées pendant le défilement horizontal.
- `[density]="'compact'"` : lignes et en-têtes plus serrés.
- Filtre `type: 'numberRange'` (deux champs min/max).
- Filtre `type: 'number'` : expressions `>150`, `<=20`, `!=0`, `=5`, `100..200` (virgule décimale acceptée).
- `filter.operator` pour les filtres texte : `'contains'` (défaut), `'equals'`, `'startsWith'`, `'endsWith'`.
- Recherche globale : `[globalSearchEnabled]`, mode contrôlé `[globalSearch]` / `(globalSearchChange)`, et `column.searchable` pour exclure une colonne ou fournir le texte cherché. Chaque mot doit apparaître dans la ligne ; casse et accents ignorés. La recherche est enregistrée dans les vues, et `NgTableRemoteQuery` gagne un champ `search`.
- Labels `globalSearchPlaceholder`, `globalSearchLabel`, `clearGlobalSearch`.
- Vue par défaut : une étoile dans le menu des vues choisit la vue appliquée à l'ouverture (`NgTableViewsStore.defaultViewId`, `toggleDefaultView()`, `isDefaultView()`).
- Regroupement en mode `remote` : `NgTableRemoteQuery.groupBy`, en-têtes dessinés sur la page reçue, compte et agrégats fournis par le serveur (`[groupSummaries]` : liste ordonnée de `NgTableGroupSummary`). Avec cette liste, les groupes se replient : `NgTableRemoteQuery.collapsedGroups` indique au serveur les groupes dont il exclut les lignes, et la table place leurs en-têtes à leur position dans la liste complète.
- `NgTableQueryState` gagne `groupBy` et `collapsedGroups` ; la directive `ngTableUrlState` écrit la colonne de regroupement dans l'URL (`g`).
- Regroupement de lignes (mode local) : `[groupingEnabled]` (bouton « Grouper »), `[(groupBy)]`, groupes repliables, `expandAllGroups()` / `collapseAllGroups()`, enregistré dans les vues. Agrégats par colonne (`aggregate: 'sum' | 'avg' | 'min' | 'max' | 'count'` ou fonction) dans les en-têtes de groupe, et ligne de totaux (`[showTotals]`). `(filteredCountChange)` compte un groupe replié pour une ligne.
- Colonne de référence choisie par l'utilisateur : `[referenceColumnSelectable]` ajoute une punaise dans le menu « Colonnes » pour fixer une colonne visible à gauche. `referenceColumn` (`model`) est enregistré dans les vues. Labels `setReferenceColumn`, `unsetReferenceColumn`.
- État dans l'URL : directive `ngTableUrlState` dans le nouveau point d'entrée `@sbourahla/ng-table/router`. Seul ce point d'entrée importe `@angular/router`.
- `getQueryState()`, `applyQueryState()`, `(queryStateChange)`, type `NgTableQueryState`.
- `NgTableHarness` (CDK test harness) dans le nouveau point d'entrée `@sbourahla/ng-table/testing`, avec `NgTableRowHarness` et `NgTableHeaderCellHarness`.
- Recherche globale : Entrée applique la saisie tout de suite, sans attendre le debounce.
- Paginateur intégré : `[paginator]`, `[pageSizeOptions]`, `[totalCount]` (mode remote). Plus besoin de relier `filteredCountChange` / `pageIndexChange` / `viewPaginationRestore` à son propre `<mat-paginator>`.
- Tri multi-colonnes : `[multiSort]`, Maj+clic sur un en-tête ; `(sortsChange)`, `NgTableRemoteQuery.sorts`, `NgTableViewState.sorts`. Labels `sortPriority`, `multiSortHint`.
- Accessibilité : navigation clavier cellule par cellule (`[cellNavigation]`, motif « grid » de WAI-ARIA) : un seul arrêt de tabulation, flèches, Début/Fin, Page préc./suiv., Entrée/F2 pour le contenu d'une cellule, Échap, Espace pour sélectionner.
- Accessibilité : une région `aria-live` annonce le tri et, en mode local, le nombre de lignes après chaque tri, filtre ou recherche. Labels `announceSortAsc`, `announceSortDesc`, `announceSortCleared`, `announceRowCount`, `announceNoRows`.
- Export / import des vues en JSON : `[viewsImportExportEnabled]`, `exportViews()`, `importViews(json, 'merge' | 'replace')`, `(viewsImported)`. Labels `setDefaultView`, `unsetDefaultView`, `exportViews`, `importViews`, `viewsImported`, `viewsImportInvalid`.
- `[exportFormat]="'xlsx'"` : export Excel natif, sans dépendance ; nombres et booléens restent typés, en-tête en gras et figé.

### Corrigé
- Filtres inline : les champs texte et nombre débordaient de 48 px sur la colonne voisine (`box-sizing` manquant). La place du bouton d'effacement n'est plus réservée que lorsqu'il est affiché, et seulement sous lui : le champ « Min » d'une plage garde toute sa largeur.
- Champs date : dans un champ étroit, le libellé passait sous l'icône du calendrier. Il est maintenant tronqué avant l'icône.
- Barre des filtres actifs : un filtre booléen affiche « Oui » / « Non » (labels `yes` / `no`) au lieu de « true » / « false ».
- Un filtre `enum` avec plusieurs valeurs cochées ne matchait plus aucune ligne.
- Le libellé accessible des cases de sélection de ligne affichait « ligne NaN », et `detailRowWhen` recevait un index `undefined` (`index` n'existe pas avec `multiTemplateDataRows`).

### Modifié (cassant)
- `pageIndex` / `pageSize` sont des `model()`. Le composant met la page à jour lui-même (retour en page 0 après un filtre, restauration d'une vue) au lieu de seulement émettre `pageIndexChange` : un parent qui liait `[pageIndex]` sans écouter l'événement voit donc la page changer. `(pageIndexChange)` fonctionne comme avant ; `(pageSizeChange)` est nouveau. Côté TypeScript, `table.pageIndexChange.subscribe(...)` devient `table.pageIndex.subscribe(...)`.
- `NgTableComponent<T>` est générique. `T` est inféré dans les templates depuis `[rows]`/`[columns]`, et les sorties sont typées (`rowClick: T`, `selectionChange: NgTableSelectionChangeEvent<T>`...). Du code qui passait des lignes incohérentes avec ses colonnes peut désormais être signalé à la compilation. Sans paramètre, `T = any` comme avant.
- Les membres internes du composant (gestionnaires d'événements du template, helpers d'affichage) sont `protected`. L'API publique se limite aux entrées, aux sorties et aux méthodes listées dans le README (« Méthodes publiques »). Du code qui appelait par exemple `onHeaderSort()` ou `onFilterValue()` doit passer par les entrées contrôlées (`[filters]`...) ou par ces méthodes.
- `NgTableDetailToggleEvent.row` est typé `T | null` : il valait déjà `null` après `collapseAllDetails()`.
- Les valeurs affichées (`valueAccessor`), les textes copiés et les classes (`rowClassFn`) sont calculés une fois par ligne rendue, et non plus à chaque détection de changements. Une ligne modifiée **sur place** (même objet, même tableau `rows`) n'est donc plus relue à l'écran, comme c'était déjà le cas pour les filtres, le tri et la recherche. Passez un nouveau tableau (`rows.set([...])`, ou un nouvel objet pour la ligne modifiée). Les signaux lus dans `valueAccessor` ou `rowClassFn` restent suivis.

### Modifié
- Tri : les cellules vides restent en fin de liste aussi en tri décroissant. Avant, un tri décroissant les faisait remonter en tête.
- Les vues stockées en `localStorage` portent une version de schéma ; les vues malformées sont ignorées au lieu de casser l'affichage, et une vue active qui n'existe plus est oubliée. Les stores existants sont relus sans perte.
- « Réinitialiser les filtres » efface aussi la recherche globale.
- Supprimer la vue active fait basculer sur la vue par défaut (sinon la première vue restante, comme avant).
- La largeur mini du tableau est au moins la somme des largeurs mini des colonnes visibles (120 px par défaut). Avec beaucoup de colonnes, le tableau défile horizontalement au lieu d'écraser les en-têtes, dont le libellé pouvait tomber à 0 px. La poignée de réordonnancement ne prend plus de place dans l'en-tête, et le bouton de filtre fait bien 28 px (Material lui imposait 40 px).
- Écran de moins de 900 px : la recherche globale prend toute une ligne, et les boutons d'action se partagent la suivante.
- Tous les filtres saisis au clavier (`number`, `search`...) sont debouncés comme `text`.

### Performance
- Défilement virtuel (`[virtualScroll]`) : sur 50 000 lignes sans pagination, 22 à 30 lignes rendues au lieu de 50 000. Hauteur de ligne mesurée, en-tête fixe, compatible filtres / tri / regroupement / sélection / navigation clavier.
- Tri : clés de tri calculées une fois par ligne au lieu d'à chaque comparaison (n au lieu de ~n·log n appels aux accessors).
- État de sélection mémoïsé : plus d'`Array.includes` par ligne en mode contrôlé, ni de `Set` recréé à chaque vérification.
- Modèle de vue précalculé par ligne rendue : une détection de changements sans rapport avec les données (sélection, menu, bouton « copié »...) ne rappelle plus `valueAccessor` ni `rowClassFn`. Mesuré : 50 sélections sur une page de 100 lignes × 10 colonnes, 0 appel au lieu de 105 000 ; contexte de `cellTemplate` à référence stable.

## [0.4.4]

### Ajouté
- `[columnsMenuEnabled]` pour masquer le bouton « Colonnes ».

## [0.4.3]

### Performance
- Réordonner les colonnes ne refiltre/retrie plus toutes les lignes.

## [0.4.2]

### Corrigé
- Activer une vue avec pagination sauvegardée ne remet plus la page à 0 ; en mode `remote`, `remoteQueryChange` porte la page restaurée.

## [0.4.1]

### Ajouté
- `NgTablePaginatorIntl` / `provideNgTablePaginatorIntl()` : traduction française de `<mat-paginator>`.

## [0.3.0]

### Ajouté
- Accessibilité : `aria-sort`, libellés des cases de sélection, réordonnancement et redimensionnement des colonnes au clavier, lignes activables au clavier, `[ariaLabel]`.

## [0.2.0]

### Modifié (cassant)
- `filter.type: 'date'` filtre désormais un **jour unique** ; l'ancienne plage de dates devient `filter.type: 'range'`.

### Ajouté
- Tooltip de troncature paramétrable (`--ngt-tooltip-*`), aussi sur les en-têtes.
