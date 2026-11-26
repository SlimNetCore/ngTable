# Changelog

Toutes les évolutions notables de `@sbourahla/ng-table`. Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/), versions suivant [SemVer](https://semver.org/lang/fr/).

## [Non publié]

## [6.0.1] — 2026-11-26

- **Attributs `cdk-*` retirés du gabarit.** Ils n'avaient plus de directive derrière eux depuis la 6.0.0 (`cdk-table`, `cdk-header-row`, `cdk-row`, `cdk-cell`, `cdk-footer-row`…). Les classes `cdk-*` et les rôles restent. **À vérifier si vos styles ou vos tests ciblaient un attribut** : `tr[cdk-row]` devient `tr.cdk-row`.
- **Code du composant découpé**, sans changement d'API. `ng-table.component.ts` passe de 7 495 à environ 1 230 lignes : il garde les entrées, les sorties et les méthodes publiques, et relie 31 classes du dossier `lib/table/`, une par domaine (colonnes, tri, filtres, données, édition, sélection, vues, export…). Les types publics sont dans `ng-table.models.ts` ; les imports depuis `@sbourahla/ng-table` ne changent pas. Les 200 membres publics du composant sont les mêmes dans les typings publiés ; les classes internes n'y figurent pas (`stripInternal`). Cinq membres morts depuis le retrait du `CdkTable` sont supprimés, ainsi que les `standalone: true` devenus inutiles. Le fichier de tests du composant (3 917 lignes) est découpé en dix fichiers par thème.
- **Signalements de l'IDE** (WebStorm, 569 au départ) : propriétés CSS déclarées deux fois retirées, blocs répétés du client de worker réunis en deux méthodes, test `instanceof` des colonnes de nombres réuni dans `isNumberColumn`, expressions à virgule réécrites, une variable CSS morte et une classe inutilisée retirées de la démo. `host-variables.css` (non chargé, non livré) déclare pour les outils les 50 variables CSS que la table lit sans les définir : `--app-*` de la page hôte et points de réglage `--ngt-*` facultatifs.
- **Sécurité (espace de travail)** : Angular passe de 22.2.0 à 22.3.0, hors de la plage touchée par trois avis sur le rendu côté serveur (`@angular/router` : GHSA-62vg-58rm-qff7 et GHSA-57xq-rjx2-v5xh ; `@angular/platform-server` : GHSA-w739-gvwx-grc3). Les `peerDependencies` du paquet restent en `^22.0.0`. Une règle de lint interdit aux sources de la bibliothèque de s'importer par `@sbourahla/ng-table` (le build s'arrêtait sur une dépendance circulaire), et l'ancien point d'entrée `lib/ng-table.ts`, importé nulle part, est supprimé.

## [6.0.0] — 2026-11-25

**Version 6.0.0.** Aucune entrée, sortie, méthode ni type n'est retiré ou renommé. La version est majeure parce que le comportement au clavier change par défaut, pour l'accessibilité. Guide « Migrer de 5 vers 6 » dans le README.

- **Changement par défaut : navigation par cellule d'office.** Dès qu'une colonne est éditable, que `[rangeSelection]` est actif, ou que des lignes se déplient (détail, arbre, groupes repliables), la table se parcourt cellule par cellule aux flèches, comme avec `[cellNavigation]`. Conséquences : Tab entre dans la table sur une seule cellule (les lignes et les en-têtes de groupe ne sont plus chacun un arrêt de tabulation) ; les boutons des cellules s'atteignent par les flèches puis Entrée ou F2 ; le rôle `grid` / `treegrid` n'est posé que dans ce cas. Les en-têtes de groupe font partie de la grille : Flèche droite déplie, Flèche gauche replie, `aria-level` sur les groupes et leurs lignes.
- **Changement de nom accessible** : la case de sélection d'une ligne s'appelle « Sélectionner la ligne {valeur de la première colonne} » (libellé `selectRowNamed`) au lieu du rang de rendu ; l'en-tête d'une colonne a pour nom son seul titre ; le bouton de filtre dit « Filtre actif sur … » quand il l'est ; la croix d'une puce nomme son champ. À vérifier si vos tests ciblent ces noms.
- **Éditeur à liste** : il ne valide plus à chaque changement mais à Entrée, Tab ou à la sortie du champ.
- **Alternatives au glisser** (WCAG 2.5.7) : dans le menu Colonnes, boutons pour déplacer une colonne d'un cran et pour ajuster sa largeur (`moveColumnBy()`, `autoFitColumn()`) ; un clic sur la poignée d'une ligne la saisit, un clic sur une autre poignée l'y dépose ; un clic sur la poignée de recopie l'arme, le clic suivant sur une cellule recopie jusqu'à elle.
- **Clavier** : F8 / Maj+F8 vont à la ligne repérée suivante / précédente (`[scrollMarkers]`) ; sur la poignée de redimensionnement, Entrée ajuste la colonne, Début et Fin vont aux largeurs minimale et maximale.
- **Focus** : il ne tombe plus sur la page quand le bouton activé disparaît (croix de recherche, puce de filtre, « désélectionner », panneau latéral, vue supprimée) ; Tab au bout d'un menu ou d'une liste le ferme et rend le focus à son bouton.
- **Annonces** aux lecteurs d'écran : copie d'une cellule ou d'une plage, nombre de cellules collées ou recopiées et valeurs refusées, nombre de lignes sélectionnées, vue appliquée, export lancé, filtre en mode serveur, colonne déplacée, saisie refusée puis abandonnée, échec de chargement d'un bloc ou d'options de filtre. Pendant la frappe d'une recherche, un nombre de lignes inchangé n'est plus redit ; la barre d'état ne redit plus les statistiques d'une plage d'une seule cellule.
- **Info-bulles** : survolables, fermées par Échap même ouvertes au survol, et ouvertes quand une cellule ou un en-tête au texte tronqué reçoit le focus au clavier.
- Panneaux Vues, Export et Filtre déclarés comme dialogues nommés ; lien externe annoncé « nouvel onglet » ; rang ARIA de la ligne de totaux ; cibles de 24 px pour les croix des puces ; tailles de texte des filtres en `rem`.
- **Mode live : suspendre les mises à jour** (WCAG 2.2.2). `[livePauseButton]="true"` ajoute un bouton « Suspendre les mises à jour » à la barre d'outils ; `[(liveUpdatesPaused)]` donne le même état à l'application. En pause (mode local), un nouveau `[rows]` n'est pas reporté et les transactions attendent ; à la reprise, tout est appliqué d'un coup. L'édition par l'utilisateur reste immédiate. **À savoir** : en pause, `applyTransaction()` met la transaction en attente et renvoie un résultat vide.
- **Défilement virtuel au clavier** : Ctrl+Fin, Ctrl+Début, Page suivante et Page précédente visent la liste entière, plus seulement les lignes rendues (la table défile, puis le focus se pose sur la ligne visée ; en modèle par blocs, dès que le bloc est chargé). Après un saut à la barre de défilement avec réutilisation des lignes, la cellule qui a gardé le focus est annoncée avec sa nouvelle ligne.
- **Barre d'actions de sélection** : F6 y mène depuis la table et en revient ; les flèches, Début et Fin passent d'un bouton à l'autre ; le raccourci est dit avec l'annonce de la première ligne cochée (libellé `selectionBarHint`).
- **Panneau latéral** : motif « tabs » complet (la liste ne contient que les onglets, un seul dans l'ordre de tabulation, flèches, Début et Fin, onglets reliés à leur contenu).
- **Focus après un déplacement au clavier** : il reste sur la poignée de la colonne ou de la ligne déplacée, et sur un bouton de la même colonne dans le menu Colonnes ; une colonne déplacée au clavier est annoncée.
- **Tri multi-niveaux sans Maj+clic** : sur un écran tactile, un bouton « ajouter au tri » apparaît dans les en-têtes dès qu'un tri est actif (libellés `addSortLevel`, `changeSortLevel`).
- **Textes du pivot, du graphique et de la liste déroulante** rattachés à `provideNgTableLabels` (clés `pivot…` et `chart…`, dans les cinq langues) : ils suivent la langue de l'application. Les entrées `[labels]` du pivot et `[zoomTexts]` du graphique restent prioritaires. Fonction `injectNgTableLabels()` exportée. **Changement visible** : dans une application qui fournit des libellés non français, le pivot et la barre de zoom du graphique ne sont plus en français.
- Annonces ajoutées : vue enregistrée, vue supprimée, tout replier, tout déplier, mises à jour suspendues ou reprises. Avec « moins d'animations », la surbrillance d'une cellule modifiée ne disparaît plus aussitôt : la teinte et le repère ▲ ▼ ◆ s'affichent sans fondu pendant la durée prévue. Cases à cocher : zone de clic de 24 px. Champs de filtre : hauteur en `rem`. `aria-colindex` sur les cellules de groupe et les en-têtes groupés.
- 53 libellés ajoutés dans les cinq langues (annonces, déplacements, noms accessibles, mode live, pivot, graphique).
- **Rendu sans `CdkTable`.** La table est rendue directement (une boucle par ligne, une par cellule) ; le CDK n'est plus utilisé que pour le sens de lecture et le harnais de test. Mesuré dans Chromium (50 000 lignes, 12 colonnes, toutes les options) : le script d'un défilement d'une ligne par image passe de 8,1 à 4,8 ms, le recalcul de style de 1,9 à 0,4 ms, et l'image la plus lente de 37 à 20 ms. Le CDK relançait ses requêtes de contenu et recalculait les colonnes figées à chaque ligne créée. Les classes et attributs `cdk-*` (`cdk-row`, `cdk-cell`, `cdk-column-…`, `cdk-table-sticky`…) et les rôles sont gardés. **À vérifier si vos styles ou vos tests en dépendent** : les colonnes figées ne portent plus de style en ligne `left` / `right` / `z-index` mais `inset-inline-start` / `inset-inline-end` (le `z-index` vient de la feuille de style) ; les classes `cdk-table-sticky-border-elem-left` / `-right` sont remplacées par `ngt-sticky-edge-start` / `-end`.
- **Performance** : la hauteur des lignes n'est plus mesurée de force après chaque rendu pendant un défilement (un `ResizeObserver` s'en charge) ; le tabindex itinérant ne reparcourt que les lignes qui entrent ; une cellule de texte simple suit un chemin court dans le gabarit (192 nœuds d'ancrage par ligne au lieu de 211 sur la page de démonstration) ; l'écriture Excel est chargée à la demande au premier export `.xlsx` (`(localExportCompleted)` est alors émis une fois le module chargé) ; les textes de la recherche globale sont rendus à la mémoire 30 secondes après l'effacement de la recherche (environ 250 octets par ligne).
- **Aspect, changements par défaut** : une colonne de nombres est alignée à droite, en chiffres à chasse fixe ; une ligne sélectionnée a un fond teinté et un liseré ; le bouton de filtre au repos est un entonnoir simple et discret (plus l'entonnoir barré), et plein avec un point quand il est actif ; la poignée de ligne est atténuée hors survol ; dans une colonne de moins de 120 px, l'icône de tri au repos et le bouton de filtre inactif se replient jusqu'au survol ou au focus de l'en-tête ; la ligne détail a un fond léger et un liseré ; un total ne passe plus sur deux lignes ; la liste du paginateur prend l'aspect des autres listes ; quand la barre des filtres actifs est affichée, l'état vide ne répète plus « Réinitialiser les filtres ».
- **Écran étroit** : les colonnes épinglées sont libérées quand la table fait 600 px de large ou moins, ou la fenêtre 760 px ou moins (elles prenaient toute la largeur d'un téléphone). `[pinColumnsOnMobile]="true"` les garde.
- **Nouvelles options** : `NgTableColumn.align` (`'start'`, `'center'`, `'end'`), `numberFormat` et `dateFormat` (affichage au format de la langue, sans toucher à la valeur triée, filtrée, exportée) ; `[striped]` (lignes alternées, stables au défilement virtuel) ; `[autoSizeColumns]` et `autoSizeAllColumns()` (largeurs ajustées au contenu au premier affichage). Variables CSS : `--ngt-row-selected-bg`, `--ngt-row-selected-hover-bg`, `--ngt-row-alt-bg`, `--ngt-detail-bg`.
- Essais avec un vrai lecteur d'écran : `npm run e2e:nvda` pilote NVDA par Guidepup sur huit parcours (hors intégration continue : Windows et fenêtre au premier plan). Parcours au clavier automatisés dans `e2e/accessibilite-clavier.e2e.ts`.

- Accessibilité, audit de novembre 2026 (`AUDIT-ACCESSIBILITE.md` : 41 constats, tous traités, trois avec une limite décrite dans le rapport). Premier lot :
  - Entrée ou Espace sur un bouton, une case ou un lien d'une ligne n'est plus capté par la ligne (l'action était annulée et le détail basculait).
  - Nouvelle entrée `[rowActivatable]` : chaque ligne reçoit le focus, Entrée et Espace émettent `(rowClick)`. À activer dès que l'application écoute `(rowClick)`.
  - Le focus revient à son point de départ à la fermeture du menu contextuel ouvert au clavier, et au bouton de filtre après Entrée dans un champ de filtre ; Entrée sur un bouton d'un panneau de filtre active ce bouton.
  - Échap ferme une info-bulle sans déclencher l'action du parent (la barre d'actions ne vide plus la sélection).
  - Contour de focus visible dans les menus et les listes ; contour de la cellule active aussi en `treegrid`.
  - La cellule qui reçoit le focus ne passe plus sous l'en-tête collant ni la ligne de totaux (marge de défilement).
  - Message d'erreur d'un éditeur relié à son champ (`aria-describedby`) ; focus rendu à la cellule après une édition lancée à la souris ; `aria-expanded` seulement sur une ligne dépliable ; champ « nom de la vue » nommé ; indicateur de chargement immobile avec « moins d'animations ».
  - **Changement visible** : le contour des champs de saisie, des listes et des boutons à contour passe de 1,44 à 3,3 pour 1 (WCAG 1.4.11), par le nouveau jeton `--ngt-control-border` (clair `rgba(20, 33, 43, 0.5)`, sombre `rgba(255, 255, 255, 0.45)`). Un thème qui définit déjà `--ngt-border-strong` garde sa valeur sur ces contours en thème clair.
- Démo, page **Thème** refaite : les 39 jetons classés par famille, réglables en clair et en sombre séparément, recherche, remise à zéro jeton par jeton, teintes légères de l'accent déduites, contrôle des contrastes WCAG (neuf couples texte / fond), six thèmes tout faits, CSS à copier pour toute l'application ou une zone, reprise d'un thème par collage, réglages gardés dans le navigateur.

- Performance, défilement virtuel : **réutilisation des lignes** (`[rowReuse]`, `'auto'` par défaut). Après un saut dans la liste, un tri ou un filtre, les lignes déjà créées sont reprises et seul leur contenu change, au lieu d'être détruites puis recréées. Mesuré dans Chromium sur 200 000 lignes, 26 lignes rendues : travail de script par saut de 9 ms à moins de 3 ms, temps total des tâches de 22 à 14 ms. Un défilement ligne à ligne est inchangé (une ligne créée, une détruite). En mode `'auto'`, la réutilisation ne s'applique que sans `cellTemplate` ni `detailRowTemplate` : un gabarit de l'application peut contenir un composant à état, qui le montrerait sur une autre ligne. `[rowReuse]="true"` la force, `false` la coupe. À savoir : avec la réutilisation, `[animateRows]` n'anime plus un tri (les lignes ne bougent pas, leur contenu change), et une cellule qui a le focus le garde après un saut (elle montre alors une autre ligne).
- Performance, Web Worker : le filtre avancé (ET / OU) se calcule maintenant dans le worker, avec les filtres de colonnes ; seul un `filterPredicate` cité par une condition ramène le calcul sur le fil principal.

## [5.0.0] — 2026-11-13

**Version 5.0.0.** Aucune API n'est retirée ni renommée : le code écrit pour la 4.x compile et fonctionne sans changement. La version est majeure pour quatre changements de comportement visibles, détaillés dans le README (« Migrer de 4 vers 5 ») :

1. Liste vidée par les filtres : le message « Aucune ligne ne correspond aux filtres » et un bouton de réinitialisation remplacent `[emptyLabel]` dans ce cas.
2. Défilement virtuel : la hauteur estimée d'une ligne est la plus fréquente des lignes rendues (et non celle de la première), et les lignes plus hautes sont mesurées.
3. Tri : les valeurs de tri sont gardées tant que le tableau de lignes ne change pas ; une ligne modifiée sur place puis retriée garde son ancienne valeur.
4. Compteur de groupe et initiales d'avatar : texte dans la couleur du texte, plus dans la couleur d'accent (contraste).

Toutes les nouvelles options sont désactivées par défaut.

- Rendu côté serveur : corrigé, la table plantait à sa destruction sur un serveur (`document` appelé sans exister). `npm run ssr:check` rend désormais la table, le constructeur de filtres et le pivot dans Node, sans navigateur simulé, à partir du paquet construit ; ajouté à la CI.

- Démo : page **Thème**, un bac à sable où régler les jetons `--ngt-*` (couleurs, rayons, hauteur de ligne, taille du texte), voir la table changer aussitôt et copier le CSS obtenu ; quatre thèmes tout faits pour partir de quelque chose.

- Filtre avancé : enregistré dans les vues, présent dans `getQueryState()` / `applyQueryState()` (`advancedFilter`, `null` pour le retirer) et dans l'URL (`ngTableUrlState`, paramètre `af`). `sanitizeFilterGroup` valide un filtre venu de l'extérieur. À noter : `fromUrlParams()` renvoie maintenant aussi `advancedFilter` (`null` s'il n'y en a pas).

- Pivot en Web Worker : `<ng-table-pivot [workerCompute]="true">` calcule le tableau croisé hors du fil principal quand `rows` dépasse `[workerThreshold]` lignes (100 000 par défaut). Les valeurs de chaque champ partent une seule fois par jeu de lignes : changer d'agrégat, permuter lignes et colonnes ou retirer un champ ne renvoie rien. L'ancien résultat reste affiché pendant le calcul ; en cas d'échec du worker, le pivot revient sur le fil principal. `[computeWorkerFactory]` comme sur `ng-table`. Sans effet avec `[datasource]`.

- Filtre avancé : `[(advancedFilter)]` sur `ng-table` reçoit des conditions combinées par ET / OU, en groupes imbriqués (`NgTableFilterGroup`), avec « sauf » par condition. Chaque condition lit sa saisie comme le filtre de sa colonne (`>5000`, `10..50`, `Validée,Annulée`, un texte). Il s'ajoute aux filtres de colonnes et à la recherche ; en mode `remote` il part dans la requête (`advancedFilter`) ; « Réinitialiser les filtres » l'efface. Nouveau composant `<ng-table-filter-builder [columns] [(filter)]>` pour le construire à l'écran (trois niveaux de groupes, 13 libellés dans les cinq langues). Fonctions `compileAdvancedFilter`, `describeAdvancedFilter`, `countActiveConditions` exportées. Avec un filtre avancé actif, le calcul reste sur le fil principal (pas de Web Worker).

- `[fillHandle]` : poignée de recopie, comme dans un tableur. Un carré au coin de la plage sélectionnée se tire vers le bas, le haut, la droite ou la gauche ; les valeurs sont recopiées dans l'ordre, et une suite de nombres à pas constant est prolongée (10, 20 → 30, 40). Aperçu en pointillés pendant le glissement ; l'ensemble s'annule en une fois (Ctrl+Z) et passe par `validate`. Au clavier : Ctrl+D (vers le bas) et Ctrl+R (vers la droite) sur une plage. Demande `[rangeSelection]`, le mode local et des colonnes à `valueSetter`. `(cellEdited)` porte `source: 'fill'`.
- Garde-fou de performance : `npm run perf:check` (`scripts/perf-check.mjs`, budgets dans `scripts/perf-budget.json`) vérifie des rapports entre deux temps d'une même exécution (« inverser un tri coûte moins de la moitié du premier tri »...), ajouté à la CI.

- `[animateRows]` : au changement de tri, les lignes déjà à l'écran glissent vers leur nouvelle place et les autres apparaissent en fondu (260 ms). Rien ne bouge si l'utilisateur a demandé moins d'animations, ni au-delà de 120 lignes rendues.
- `[stickyGroupHeaders]` : l'en-tête du groupe en cours, et de ses groupes parents, reste collé sous l'en-tête des colonnes pendant le défilement, y compris en défilement virtuel (l'en-tête sorti de la tranche rendue y est remis).
- `[scrollMarkers]` et `[rowMarker]` : repères le long de la barre de défilement pour les lignes sélectionnées et les lignes signalées (`'danger'`, `'warning'`, `'info'`, `'success'`). Chaque trait est à la position exacte où commence sa ligne dans le contenu (en-têtes et hauteurs mesurées compris) ; deux lignes à moins de 4 px l'une de l'autre partagent un trait. **Un clic sur un trait amène la ligne au milieu de la zone et la met en évidence** (attribut `data-ngt-located`). Décoratifs (masqués aux lecteurs d'écran) ; l'épaisseur du trait distingue une alerte d'une sélection.
- Modèle par blocs, pagination par clé : `NgTableBlockRequest.afterRow` (dernière ligne du bloc précédent) et `beforeRow` (première ligne du bloc suivant), fournies quand la table les a en mémoire. Le serveur peut alors demander « les lignes après celle-ci » au lieu d'un décalage `startRow`. `NgTableBlockRequest` devient générique (`NgTableBlockRequest<T>`, `unknown` par défaut : sans effet sur le code existant).
- Démo : page **Nouveautés**, une section par fonctionnalité récente avec ce qu'il faut essayer.

- Défilement virtuel : **lignes de hauteurs différentes**. La table retient la hauteur réelle des lignes qu'elle a rendues (détail déplié, texte sur plusieurs lignes, en-tête de groupe) ; les autres gardent la hauteur estimée, qui est maintenant la hauteur la plus fréquente des lignes rendues. La barre de défilement et `scrollToIndex()` en tiennent compte : un détail déplié garde sa place même une fois sorti de la zone rendue. Positions calculées en O(log n) par un arbre de Fenwick (`row-heights.ts`). Limites : pas en modèle par blocs ; au-delà de 15 millions de pixels (barre comprimée) le calcul uniforme est gardé ; les mesures repartent de zéro quand la liste change (tri, filtre, données). Aucun changement d'API.
- Calcul en Web Worker et mode live : une transaction (`applyTransaction`, `applyTransactionAsync`, nouveau `[rows]` qui garde l'ordre) n'oblige plus à renvoyer toutes les colonnes au worker. Seules les valeurs des lignes modifiées, ajoutées ou retirées partent (message `patch`), et le worker retouche ses colonnes. Le fil principal ne relit donc plus toutes les lignes à chaque lot. Aucun changement d'API.

- Cellules prêtes à l'emploi et mise en forme conditionnelle : `NgTableColumn.cell`, sans `cellTemplate`. Sept types : `badge` (pastille, teinte selon la valeur), `progress` (barre de progression), `rating` (note en étoiles, demi-étoiles), `link`, `avatar` (initiales ou image), `dataBar` (barre de données, valeurs négatives à gauche de l'axe zéro) et `colorScale` (dégradé, option `diverging`). Bornes des barres et dégradés mesurées sur les lignes filtrées, ou fixées par `min` / `max`. Le texte ou le nombre reste toujours affiché (jamais la couleur seule). Composant `NgTableCellFormatComponent` utilisable seul ; types `NgTableCellFormat`, `NgTableTone`... exportés ; libellé `ratingLabel` dans les cinq langues.

- Recherche globale : `[highlightSearch]="true"` surligne dans les cellules le texte trouvé (casse et accents ignorés, texte d'origine conservé ; balise `<mark class="ngt-search-hit">`, fond et gras, jetons `--ngt-search-hit-bg` / `--ngt-search-hit-text`). Cellules en texte seulement : pas celles d'un `cellTemplate`.
- État vide : quand la liste est vide **à cause des filtres ou de la recherche**, la table affiche « Aucune ligne ne correspond aux filtres » (libellé `noDataFiltered`, cinq langues) et un bouton « Réinitialiser les filtres ». Changement visible : dans ce cas, ce message remplace `[emptyLabel]` / `noData`, qui restent affichés quand la liste est vide sans filtre.
- Impression : feuille de style `@media print`. Seul le tableau est imprimé, en entier (zone défilante dépliée), en-têtes répétés à chaque page, textes non tronqués ; barre d'actions, filtres, pagination, poignées et boutons retirés. En défilement virtuel, seules les lignes rendues sont imprimées.

- Modèle par blocs : `NgTableBlockRequest.signal` (`AbortSignal`) est levé quand la table n'a plus besoin d'un bloc (tri ou filtre changé, zone quittée par un défilement rapide). Transmis à `fetch` ou à `HttpClient`, il annule la requête ; une source Observable est désabonnée d'office. Une demande annulée n'émet pas `(remoteBlockError)` et ne marque pas le bloc en échec. Nouvelle entrée `[prefetchBlocks]` (défaut `0`) : nombre de blocs chargés d'avance dans le sens du défilement, une fois la zone affichée servie.

- Performance, filtres : une colonne aux valeurs répétées (4 096 valeurs distinctes au plus, à partir de 2 000 lignes) est gardée en **dictionnaire** (`column-store.ts`, 2 octets par ligne) : le filtre se calcule une fois par valeur distincte, puis chaque ligne ne coûte qu'une lecture. Et quand une saisie est **prolongée** (« dup » → « dupo ») ou qu'un filtre est ajouté, la recherche globale comprise, seul le résultat précédent est refiltré, sans nouveau tri, tant qu'il reste peu de lignes ou que retrier coûterait cher. Mesuré sur 200 000 lignes (Node, médiane de 5) : filtre de texte sur 500 valeurs répétées 17 → 10 ms la première fois, 14 → 3 ms ensuite ; filtre posé sous un tri de texte 104 → 26 ms. Aucun changement d'API.

- Performance, tri : les valeurs de tri d'une colonne sont gardées **en colonnes** (`column-store.ts`, 8 octets par ligne, 8 colonnes au plus) tant que les lignes ne changent pas. Un tri ne rappelle donc `valueAccessor` et ne reclasse les textes que la première fois : inverser le sens, changer un filtre en restant trié, revenir à une colonne déjà triée ou ajouter un niveau ne coûte plus que les passes du tri par base. Mesuré sur 200 000 lignes (Node, `column-store.performance.spec.ts`) : inversion d'un tri de texte 196 → 32 ms, filtre modifié sous un tri de texte 172 → 21 ms, retour à une colonne déjà triée 316 → 18 ms ; le premier tri d'une colonne ne change pas. À savoir : le cache suit l'identité du tableau de lignes ; une ligne modifiée **sur place** puis retriée garde son ancienne valeur de tri (les lignes sont immuables : passez un nouveau tableau ou une transaction). Aucun changement d'API.

## [4.0.1] — 2026-11-13

- Master / detail : bouton **natif** déplier / replier. Dès qu'un `detailRowTemplate` est fourni, une colonne en tête porte un chevron par ligne (clavier, `aria-expanded`, libellés `detailExpand` / `detailCollapse` / `detailColumn` dans les cinq langues). `[detailRowToggleButton]="false"` le retire. En mode contrôlé, le bouton émet `(detailToggle)` avec les clés à appliquer. Changement visible : les tables qui ont un détail gagnent une colonne de 44 px.

- Accessibilité, daltonisme (WCAG 1.4.1) : nouvelle palette des graphiques `--ngt-chart-1` à `8` (clair et sombre), distinguable en protanopie, deutéranopie, tritanopie et niveaux de gris, contraste ≥ 3:1 ; courbes avec forme de point et tireté propres à chaque série, repris dans la légende ; `[patterns]` sur `ng-table-chart` pour hachurer barres et secteurs ; repère ▲ ▼ ◆ avec la surbrillance du mode live. Changement visible : les couleurs par défaut des graphiques changent (réglables comme avant avec les jetons). Tests : simulation de daltonisme (`color-vision.ts`), 24 tests unitaires et 6 tests e2e de plus.

- Apparence « material » : `provideNgTableLook('material')` donne le rendu d'un tableau Angular Material : texte noir (blanc en thème sombre), lignes de la grille noires, icônes pleines (31 icônes, tracés Material Icons, Apache 2.0) et icône de tri en accent ; les boutons, champs et cartes gardent leurs traits ; la police est celle de la page (déjà le cas par défaut). Nouveaux : `NG_TABLE_ICON_STYLE`, `NG_TABLE_LOOK_CLASS`, `NG_TABLE_LOOK_OVERRIDES`, classe `ngt-look-material`. Sélecteur « Apparence » dans la démo. Aucun changement par défaut.

- Accessibilité : `aria-colcount` et `aria-colindex` en virtualisation des colonnes (le nombre total de colonnes est annoncé, pas seulement la fenêtre rendue). Test e2e sur la page Live à 108 colonnes.

- Accessibilité : `aria-rowcount` et `aria-rowindex` en défilement virtuel et en modèle par blocs (le total réel est annoncé, plus seulement les lignes rendues) ; mode contraste élevé (`@media (forced-colors: active)`) pour le focus, le tri actif, les plages de cellules, les zones de dépôt, les lignes épinglées, de groupe et de totaux, les menus, listes et panneaux, et la barre d'actions ; zone cliquable de 24 × 24 px pour la poignée de déplacement de colonne. 5 tests e2e de plus.

- Accessibilité, corrigée après un premier audit axe (WCAG 2.2 A/AA) : le bouton de tri a pour nom « libellé de l'en-tête, action » (WCAG 2.5.3) ; la table prend le rôle `treegrid` quand des lignes se déplient (arbre, ligne détail, groupes), puisque `aria-expanded` n'est permis sur une ligne que là ; la poignée de redimensionnement porte toujours `aria-valuenow` ; l'ancre du menu contextuel n'expose plus `aria-expanded` ; le menu des colonnes est un `dialog` nommé et non un `menu` (il contient des cases à cocher) — `ng-table-menu` gagne `panelRole` et `panelLabel`. Démo : contrastes de la page Live en thème sombre, blocs de code défilants atteignables au clavier.
- Tests de bout en bout dans un vrai navigateur (Playwright, `npm run e2e`) avec audit axe de chaque page de la démo en clair et en sombre, de la barre d'actions (grand et petit écran), du menu des colonnes, de l'arabe (RTL) et du tri au clavier ; job ajouté à la CI.

## [4.0.0] — 2026-10-16

- Schéma `ng add @sbourahla/ng-table` : ajoute `@angular/cdk`, et avec `--locale` enregistre les textes de la langue et pose `lang` / `dir` sur `<html>` (options `--project`, `--skip-install`). Tests `npm run schematics:test`, compilation dans `npm run build`.
- Langues et RTL : textes espagnol, allemand et arabe (`NG_TABLE_LABELS_ES/DE/AR`, `NG_TABLE_LOCALES`, `ngTableLabelsFor`, `ngTableIsRtl`) ; mise en page en propriétés logiques et `:dir(rtl)`, entrée `[dir]`, menus et listes alignés selon le sens, icônes directionnelles inversées, colonnes figées selon `Directionality`. Sélecteur de langue dans la démo.
- Site de documentation : démo vivante sous `demo/` (`npm run docs:demo`) et bouton « Ouvrir dans StackBlitz » (Quick Start).
- Publication automatique (elease.yml) à chaque push sur main qui change la version : CHANGELOG daté, tag, npm (README, CHANGELOG et documentation dans le paquet, homepage vers le site), Release GitHub avec les notes du CHANGELOG.
- Référence d'API générée par TypeDoc (`npm run docs:api`, publiée sous `api/` dans le site de documentation).
- Filtre par ensemble de valeurs : `filter.type: 'set'` (une case par valeur distincte avec son effectif, recherche, « tout sélectionner », cellules vides ; valeur sérialisée en tableau JSON). Composant `NgTableSetFilterComponent` exporté ; labels `selectAll`, `blanks`, `setFilterTruncated`.
- Panneau de regroupement (`[groupPanel]`) et regroupement sur plusieurs niveaux (`[groupLevels]`, mode local) : dépôt d'en-têtes de colonnes, puces réordonnables, sous-groupes en retrait, agrégats par niveau, repli à tous les niveaux ; `groupLevels` dans les vues et `getQueryState()`.
- Export Excel mis en forme (`exportXlsxStyle: 'styled'`, défaut) : en-têtes colorés avec l'accent du thème, lignes alternées, vraies dates Excel, formats de nombres, largeurs ajustées, filtre automatique, ligne d'en-têtes figée et répétée à l'impression. `NgTableColumn.excel`, `[exportXlsxOptions]`, `toStyledXlsx`. Changement : un export `xlsx` est désormais stylé par défaut (`[exportXlsxStyle]="'plain'"` pour l'ancien classeur brut).
- Calcul en Web Worker (`[workerCompute]`, `[workerThreshold]`, `(computing)`, `[computeWorkerFactory]`) : tri, filtres et recherche globale hors du fil principal pour les grands jeux de données ; worker livré dans la bibliothèque (`Blob`), repli automatique sur le fil principal en cas d'échec. `npm run worker:bundle` / `worker:check`.
- Spring d'exemple : `NgTableColumn.Filter.SET` lit le filtre par ensemble de valeurs (tableau JSON, `IN` plus `IS NULL` pour les valeurs vides), avec un analyseur JSON sans dépendance. Le calcul en worker envoie les colonnes de textes en un seul tampon UTF-8 transféré (fil principal : ~560 → ~155 ms sur 1 000 000 de lignes).
- Démo : la colonne Client de la page Expert (simulé et Spring Boot) utilise le filtre `set` ; vérifié de bout en bout contre Spring avec 1 000 000 de commandes (décocher un client : 1 000 000 → 833 333 lignes). La page Benchmark gagne un banc « Calcul en Web Worker » (gel du fil principal et temps total d'un tri ou d'un filtre, avec et sans worker, 1re fois puis ensuite).
- Site de documentation statique (`npm run docs:build`, `npm run docs:serve`) généré depuis le README, le CHANGELOG et la ROADMAP : 80 pages, recherche plein texte, coloration du code, thème sombre ; workflow GitHub Pages (`.github/workflows/docs.yml`) et vérification dans la CI.
- Barre d'actions flottante sur la sélection (`[selectionBar]`, `[selectionActions]`, `(selectionAction)`) : compteur, désélection, « tout sélectionner », actions avec règles métier (`when`, `minRows`, `maxRows`, masquées ou grisées avec leur raison), règle d'affichage `[selectionBarWhen]`, menu « Autres actions », contenu libre `[selectionBarTemplate]`. Indépendante du menu contextuel, dont le gabarit reçoit désormais `selectedRows`. Nouveaux libellés `selectionBarLabel`, `selectionCountOne`, `selectionCountMany`, `selectionClear`, `selectionSelectAll`, `selectionMore` ; icône `more_horiz`.

### Ajouté
- Mode live : `applyTransaction()`, `applyTransactionAsync()` (lots regroupés pendant `[asyncTransactionWaitMillis]`), `flushAsyncTransactions()`, `(asyncTransactionsFlushed)`, types `NgTableRowTransaction` / `NgTableTransactionResult`.
- Surbrillance des cellules modifiées : `[flashCells]`, `[flashDurationMs]`, `NgTableColumn.flashOnChange`, attribut `data-ngt-flash`, variables `--ngt-flash-up-bg`, `--ngt-flash-down-bg`, `--ngt-flash-change-bg`.
- Modèle serveur par blocs (`[remoteDatasource]`, `NgTableRemoteDatasource` / `NgTableBlockRequest` / `NgTableBlockResult`) : défilement continu sur toutes les lignes du serveur, blocs chargés à la demande et mis en cache (`[cacheBlockSize]`, `[maxBlocksInCache]`, `[maxConcurrentBlockRequests]`), `refreshRemoteDatasource()`, `remoteRowCount()`, `(remoteBlockError)`. Label `blockLoadError`.
- Affichage partiel des colonnes (`[virtualColumns]`) pour les tables très larges.
- `scrollToIndex()`.
- Thème : 22 jetons de plus (38 au total), dont `--ngt-radius-button`, `--ngt-row-height-compact` / `--ngt-header-height-compact`, `--ngt-font-family`, `--ngt-font-size`, `--ngt-header-font-size` et `--ngt-header-font-weight` : la forme des boutons, la densité compacte et la typographie se règlent sans CSS. En plus de `--ngt-success`, `--ngt-warning`, `--ngt-on-primary` : `--ngt-success`, `--ngt-warning`, `--ngt-on-primary`, la palette des graphiques `--ngt-chart-1` à `-8` (jusqu'ici fixée sur l'élément, donc non surchargeable depuis un ancêtre), les rayons `--ngt-radius-card` / `--ngt-radius-control` et les hauteurs `--ngt-row-height` / `--ngt-header-height`. Il ne reste plus de couleur en dur hors des valeurs de repli. `NgTableToken.kind` distingue les couleurs des dimensions (celles-ci ne sont pas répétées dans le thème sombre généré).
- Style : palette plus calme (accent #2f6fa8, gris bleutés, filets fins, ombre en deux couches), thème sombre affiné, cartes à 16 px de rayon, en-têtes sur fond léger, survol de ligne, icônes de tri discrètes (l'accent n'apparaît que sur la colonne triée), 29 icônes redessinées au trait de 1,7 px à coins arrondis, boutons à contour neutre. La démo gagne un sélecteur Clair / Sombre / Auto (classe `ngt-dark` sur `<html>`). Les valeurs par défaut des jetons changent (voir `NG_TABLE_TOKENS`) ; une application qui les redéfinit n'est pas touchée.
- Performance, mode live : le pipeline incrémental ne construit plus ni entrée ni index par ligne. Les clés de tri se recalculent pour les seules lignes qu'une recherche dichotomique examine, et la version précédente d'une ligne modifiée vient du magasin (`RowStore.previous`). Sans tri, une mise à jour qui garde sa place est remplacée sur place. Sur 1 000 000 de lignes, le premier lot de 1 000 mises à jour après un recalcul passe de 356 à moins de 20 ms sans tri, et d'environ 700 à 320 ms avec un tri numérique. Le constructeur d'`IncrementalPipeline` ne prend plus de paramètre.
- Retrait d'Angular Material, étape 1 : paginateur intégré (`<ng-table-paginator>`, textes de `[labels]`, `NgTablePaginatorHarness`) et cases à cocher (`<ng-table-checkbox>`, `<input>` natif, sortie `(checkedChange)`) propres à la bibliothèque. Rupture : `getPaginator()` du harnais ne renvoie plus un `MatPaginatorHarness`.
- Retrait d'Angular Material, étape 2 : icônes SVG (`<ng-table-icon>`, plus de police d'icônes à charger), boutons natifs (`ngt-button`, `ngt-stroked-button`, `ngt-flat-button`, `ngt-icon-button`) et info-bulle propre (`NgTableTooltipDirective`). Rupture : la surface de l'info-bulle est `.ngt-tooltip` (et non `.mat-mdc-tooltip-surface`).
- Retrait d'Angular Material, étape 3 : liste déroulante propre à la bibliothèque (`<ng-table-select>`, simple ou multiple, recherche intégrée, clavier et ARIA complets) pour les filtres énumérés et booléens ; le composant interne `ng-table-select-filter` est supprimé. Le panneau suit son champ (défilement, filtre inline, fenêtre de filtre qui se déplace) au lieu de se fermer. Rupture : les classes `.mat-mdc-select-*` et `.column-filter-select-panel` n'existent plus.
- Retrait d'Angular Material, étape 4 : menus propres à la bibliothèque (`<ng-table-menu>`, `[ngTableMenuTriggerFor]`) pour les colonnes, le regroupement, les vues, l'export, les filtres de colonne et le menu contextuel de ligne ; panneau dans la top layer, suivi du déclencheur, clavier, thème sombre appliqué aux panneaux (`data-ngt-theme`). Rupture : `.mat-mdc-menu-*` devient `.ngt-menu-*` ; dans un modèle de menu contextuel, utilisez `ngt-menu-item` (`mat-menu-item` reste stylé).
- Retrait d'Angular Material, étape 5 : filtres de dates en `<input type="date">` natifs (jour et période), sans `MatDatepicker` ni `MatNativeDateModule`. Changement de comportement : la période s'applique dès qu'une borne change, il n'y a plus de boutons OK / Annuler. Il ne reste d'Angular Material que `mat-table` (CDK table).
- Retrait d'Angular Material, étape 6 (fin) : le tableau passe de `mat-table` au `CdkTable` du CDK, avec les styles de base de la bibliothèque. Ruptures : classes `.mat-mdc-cell` / `.mat-mdc-header-cell` / `.mat-mdc-row` / `.mat-column-<id>` / `.mat-mdc-table-sticky` renommées en `.cdk-*` ; `NgTablePaginatorIntl` et `provideNgTablePaginatorIntl()` retirés ; `@angular/material` n'est plus un peer dependency (`@angular/cdk` reste). Plus aucun composant Angular Material dans la bibliothèque.
- Thème : jetons de conception `--ngt-*` (16 couleurs et ombre, `NG_TABLE_TOKENS`) lus par tous les styles, anciens noms `--app-*` conservés en repli ; thème sombre par `[theme]` (`'dark'`, `'light'`, `'auto'`) ou classe `ngt-dark` sur `<html>` ; passerelle vers les variables `--mat-sys-*` d'Angular Material en thème sombre. `theme.css` est généré (`npm run theme:css`, `npm run theme:check`).
- Page `/benchmark` de la démo : comparaison reproductible avec AG Grid Community (chargement, tri, filtre, saut, lot de mises à jour), rendu compté, rapport Markdown. `ag-grid-community` est installé dans `benchmarks/`, hors de la bibliothèque.
- Pivot : **plusieurs champs en colonnes** (`columns` accepte un champ ou une liste, `PivotResult.columnPaths`, `PIVOT_PATH_SEPARATOR`, `pivotColumnFields()`), et **glisser une colonne de `ng-table` dans une zone du pivot** (`NG_TABLE_COLUMN_DRAG_TYPE`). Rupture pendant le développement : `PivotServerRequest.column` devient `columns: string[]`, `PivotServerResult.columnKeys` devient `columns: string[][]`, `PivotLayout.column` devient `columns`, la zone `column` devient `columns`.
- Backend Spring Boot (`examples/spring-boot-backend`) : pivot par la base (`POST /api/commandes/pivot`), édition (`PATCH /api/commandes/{id}`), flux de cotations en SSE (`/api/quotes`, `/api/quotes/stream`), arborescence (`/api/dossiers`), `tendance` dans les lignes ; 34 tests Java. La classe `CommandesApplication` passe dans le paquet racine `com.example` (les nouveaux paquets sont ainsi analysés).
- Démo : les pages Expert, Live et Analyse se branchent sur Spring Boot.
- Performances (1 000 000 de lignes) : tri par base stable (de 2,7 s à 0,35 – 0,65 s en numérique, de 6,4 s à 1 – 2,4 s pour un million de textes distincts, via des clés de tri ASCII vérifiées contre `Intl.Collator`), filtres compilés une fois par saisie (de 0,5 – 1,1 s à 0,2 – 0,45 s), pivot en une passe (de 1 s à 0,3 s), recalcul sans index ni clés de tri inutiles. Correctif : un graphique de plus de ~100 000 points faisait déborder la pile.
- Données arborescentes : `[treeData]`, `[treeChildren]` / `[treeParent]`, `[treeDefaultExpanded]`, `[treeIndent]`, `(treeToggle)`, `setTreeExpanded()`, `expandAllTree()`, `collapseAllTree()`, Alt + flèches ; filtre qui garde les ancêtres ; une `ng-table` dans une ligne détail (maître / détail imbriqué).
- Pivot : calcul par le serveur (`[datasource]`, `PivotDatasource`, annulation des requêtes périmées, erreur et réessai), composition par glisser-déposer des champs (`[configurator]`, `[(config)]`, `[dimensions]`, `[measures]`).
- Graphiques : zoom (sélection à la souris, Ctrl + molette, boutons, clavier, `(zoomChange)`) et réduction des grandes séries (`[maxPoints]`) qui garde pics et creux.
- Analyse : tableau croisé dynamique (`<ng-table-pivot>`, `buildPivotModel`, `computePivot`), graphiques SVG (`<ng-table-chart>` : barres, courbes, zones, secteurs, anneau ; `rangeChartData()`), mini-graphiques (`NgTableColumn.sparkline`, `<ng-table-sparkline>`).
- Glisser-déposer de lignes : `[rowDrag]`, `(rowMoved)` (nouvel ordre complet), `moveRow()`, Alt + flèches au clavier, défilement automatique.
- Barre d'état (`[statusBar]` : lignes, sélection, somme / moyenne / min / max d'une plage) et panneau latéral colonnes / filtres (`[sidePanel]`, `[(sidePanelOpen)]`, `toggleSidePanel()`).
- Correctif : les colonnes figées des lignes épinglées passent désormais devant celles des lignes qui défilent.
- Édition de cellules : options de colonne `editable`, `editor`, `editorOptions`, `valueSetter`, `validate` ; `(cellEdited)`, `(cellEditRejected)`, `[editOnPaste]`, `[undoRedoLimit]`, `undo()`, `redo()`, `canUndo()`, `canRedo()`, `startEditing()`, `stopEditing()` ; collage appliqué aux cellules éditables, annuler / rétablir par lots.
- Sélection de plage de cellules et copier-coller : `[rangeSelection]`, `[rangeCopyHeaders]`, `(rangeCopied)`, `(rangePasted)`, `getSelectedRange()`, `copySelectedRange()`, `pasteIntoRange()`, `selectAllCells()`, `clearRangeSelection()`. Texte tabulé compatible Excel / Google Sheets.
- En-têtes de colonnes groupés : `NgTableColumn.headerGroup` (libellé ou chemin), une ligne par niveau, cellules fusionnées par `colspan`.
- Lignes épinglées en haut et en bas : `[pinnedTopRows]`, `[pinnedBottomRows]` (attributs `data-ngt-pin`, `data-ngt-pin-edge`).
- Démo : page **Live** (flux de cotations jusqu'à 50 000 mises à jour/s sur 100 000 instruments, compteurs de performance).

### Performance
- Pipeline local incrémental : quand seules les données changent (transaction ou nouveau tableau `[rows]` comparé clé par clé), seules les lignes modifiées sont refiltrées et replacées dans le tri par recherche dichotomique. Sur 100 000 lignes triées et filtrées, un lot de 1 000 mises à jour coûte ~15 ms de pipeline au lieu de ~115 ms (mesuré sous jsdom).
- Recherche globale : le texte de recherche des lignes inchangées reste en cache quand les données changent.
- Ligne de totaux : sommes et moyennes tenues par différence en mode live.

### Corrigé
- Défilement virtuel sur de très longues listes : la fin de la liste était inatteignable au-delà du plafond de hauteur des navigateurs (~33 millions de px pour Chrome, ~17,9 millions pour Firefox). La barre de défilement est maintenant comprimée au-delà de 15 millions de px.

## [1.0.0] — 2026-09-25

Première version majeure. Elle contient des changements cassants (section « Modifié (cassant) ») : voir « Migrer de 0.4 vers 1.0 » dans le README.

### Documentation
- `examples/spring-boot-backend` : export CSV / XLSX (`POST /api/commandes/export`, `NgTableExporter`, Apache POI en continu). Démo expert : punaise « colonne de référence » et choix du format d'export.
- `examples/spring-boot-backend` : le backend de l'Étape 17ter en projet Spring Boot autonome (H2, 100 000 commandes, tests, Maven Wrapper). La démo expert peut s'y brancher (**Serveur → Spring Boot**, proxy `/api` de `npm start`).
- README, Étape 17ter : backend Spring Boot complet pour le mode `remote` (contrat JSON requête / réponse, format des filtres par type, tri avec regroupement, groupes repliés, résumés de groupes), en JPA Criteria, testé avec Spring Boot 3.5 et 4.1.

### Outillage
- Publication automatique : pousser un tag de version (`1.0.0`) lance `.github/workflows/release.yml`, qui vérifie, publie sur npm avec provenance et crée la Release GitHub.
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
