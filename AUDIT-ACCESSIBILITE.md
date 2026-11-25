# Audit d'accessibilité de `@sbourahla/ng-table`

Audit du 25 novembre 2026, sur la version 5.0.0 et la branche `feat/perf-theme-a11y`. Référentiel : WCAG 2.2, niveaux A et AA, et le motif « grid / treegrid » des WAI-ARIA Authoring Practices.

## En bref

- **L'audit automatique passe.** axe ne signale rien sur les sept pages de la démo, en clair et en sombre. Mais axe ne voit qu'une partie des défauts : ni les parcours au clavier, ni la gestion du focus, ni les annonces.
- **La relecture du code et les essais au clavier ont trouvé 41 constats** : 3 bloquants, 17 majeurs, 21 mineurs.
- **Les 41 sont traités dans cette branche**, la plupart avec un test. Trois gardent une limite, décrite au cinquième lot : la largeur de la poignée de redimensionnement, le rôle du graphique zoomable, les hauteurs de ligne en pixels.
- **Lecteur d'écran** : huit parcours écoutés avec NVDA, automatisés. Pas d'essai avec JAWS ni VoiceOver, ni avec des personnes concernées : la bibliothèque ne peut pas encore être déclarée conforme.

## Méthode et limites

| Source | Ce qu'elle couvre | Fiabilité |
|---|---|---|
| axe dans Chromium (`e2e/accessibilite*.e2e.ts`) | Contrastes calculés, attributs ARIA, noms manquants, sur 7 pages × 2 thèmes et 4 états | Rejoué à chaque passe |
| Relecture du code (gabarits, feuilles de style, gestion du clavier) | Les 12 familles de critères listées en annexe | Chaque constat est rattaché à une ligne ; **tous n'ont pas été rejoués dans un navigateur** |
| Essais au clavier dans Chromium (`e2e/accessibilite-clavier.e2e.ts`) | 23 parcours : menus, filtres, bulles, focus, déplacements sans glisser et au clavier, défilement virtuel, barre d'actions, onglets, mode live, écran tactile | Automatisés |
| NVDA piloté par Guidepup (`e2e-nvda/`) | Huit parcours écoutés : ce que le lecteur d'écran prononce | Automatisés, hors intégration continue |
| Bac à sable de thème (page Thème de la démo) | Rapport de contraste des couleurs par défaut | Calcul WCAG |

Dans les tableaux, **Vérifié** veut dire : reproduit dans un navigateur ou couvert par un test. **Lu** veut dire : constaté en lisant le code, à confirmer dans un navigateur ou avec un lecteur d'écran.

## Corrigé dans cette branche

| # | Défaut | Critère | Correction | Preuve |
|---|---|---|---|---|
| B2 | Entrée ou Espace sur un bouton, une case ou un lien d'une ligne était capté par la ligne : l'action était annulée et le détail basculait à la place | 2.1.1 | La ligne ne réagit que si elle a elle-même le focus | Test unitaire, test e2e |
| B3 | `(rowClick)` n'avait pas d'équivalent clavier : une ligne cliquable n'était pas focalisable | 2.1.1 | Nouvelle entrée `[rowActivatable]` : la ligne reçoit le focus, Entrée et Espace émettent `(rowClick)` | Test unitaire |
| M1 | Menu contextuel ouvert au clavier : à la fermeture, le focus tombait sur la page | 2.4.3 | Le focus revient à l'élément de départ | Test e2e |
| M2 | Entrée dans un champ de filtre fermait le menu sans rendre le focus, et interceptait Entrée sur les boutons du panneau | 2.4.3, 2.1.1 | Seul un champ de saisie valide ; le focus revient au bouton de filtre | Test e2e |
| M5 | Échap pour fermer une bulle vidait aussi la sélection (barre d'actions) | 1.4.13, 3.2.2 | Quand une bulle était ouverte, Échap s'arrête à la bulle | Test e2e |
| M8 | Dans les menus et les listes, l'élément au focus ne se distinguait que par un fond à 1,07 pour 1 | 2.4.7 | Contour de 2 px dans la couleur d'accent | Relecture |
| M10 | La cellule qui reçoit le focus pouvait arriver sous l'en-tête collant ou la ligne de totaux | 2.4.11 | Marge de défilement égale à la hauteur de l'en-tête et du pied | Test unitaire, test e2e |
| M14 | Le message d'erreur d'un éditeur n'était pas relié à son champ | 3.3.1 | `aria-describedby` vers le message | Relecture |
| M15 | Après une édition lancée à la souris, le focus tombait sur la page | 2.4.3 | La cellule est rendue focalisable avant de recevoir le focus | Relecture |
| m2 | `aria-expanded` posé sur des lignes qui ne peuvent pas se déplier | 4.1.2 | Absent quand la ligne n'a pas de bouton de détail | Test unitaire |
| m5 | Champ « nom de la vue » sans nom accessible | 3.3.2 | `aria-label` | Relecture |
| m12 | Contour de la cellule active absent en `treegrid` | 2.4.7 | Sélecteur étendu à `treegrid` | Relecture |
| m15 | Contour des champs de saisie à 1,44 pour 1 (mesuré) | 1.4.11 | Nouveau jeton `--ngt-control-border`, 3,3 pour 1 en clair et 4,5 en sombre | Test e2e |
| m16 (en partie) | L'indicateur de chargement tournait malgré « moins d'animations » | 2.3.3 | Animation coupée | Relecture |

Trouvé en corrigeant M2 : rendre le focus au bouton de filtre rouvrait aussitôt le menu, parce que la suite de la frappe Entrée arrivait sur le bouton. Corrigé dans la foulée ; c'est sans doute pourquoi le focus n'était pas rendu à l'origine.

## Corrigé ensuite (second lot)

| # | Défaut | Correction | Preuve |
|---|---|---|---|
| B1 | Édition, plage, copie et recopie inaccessibles au clavier sans `[cellNavigation]` | La navigation par cellule s'active d'office dès qu'une colonne est éditable, que `[rangeSelection]` est actif ou que des lignes se déplient. **Changement de comportement par défaut** (version majeure) | Tests unitaires |
| M9 | Rôle `treegrid` sans le clavier qui va avec ; en-têtes de groupe hors navigation | Le rôle `grid` / `treegrid` n'est posé qu'avec la navigation par cellule ; les en-têtes de groupe y sont inclus (flèches, Flèche droite / gauche pour déplier / replier), avec `aria-level` | Test unitaire |
| M3 | Tab au bout d'un menu ou d'une liste envoyait le focus en fin de page | Le menu se ferme et le focus revient à son bouton | Test e2e |
| M4 | Focus perdu quand le bouton activé disparaît | Rattrapage général : le focus va à un voisin stable (champ de recherche, puce suivante, bouton du panneau, cellule active) ; dans un menu, le panneau reprend le focus | 2 tests e2e |
| M17 (en partie) | Actions non annoncées | Annoncés maintenant : copie d'une cellule, copie d'une plage, nombre de cellules collées ou recopiées et valeurs refusées, nombre de lignes sélectionnées, vue appliquée, export lancé, filtre ou recherche en mode serveur. Huit libellés ajoutés dans les cinq langues | Test e2e (sélection) |

M12 est corrigé aussi : les panneaux Vues, Export et Filtre sont des `dialog` nommés, comme le panneau Colonnes (vérifié par l'audit axe et les tests de bout en bout).

Restent ouverts dans M17 : chargement et échec d'un bloc, erreurs de chargement des options de filtre, vue enregistrée ou supprimée, groupes tous repliés ou dépliés, déplacement d'une colonne au clavier.

Les lignes B1, M3, M4, M9 et M17 des tableaux ci-dessous sont donc traitées, en tout ou partie.

## Essais avec NVDA (troisième lot)

NVDA 2026.3 est piloté par Guidepup dans Chromium (`npm run e2e:nvda`, hors intégration continue : il faut Windows et la fenêtre au premier plan). Huit parcours sont écoutés et vérifiés : trier, chercher, sélectionner, parcourir la grille aux flèches, déplier un détail, puis (cinquième lot) atteindre la barre d'actions par F6, changer d'onglet dans le panneau latéral, suspendre le mode live. Ce que NVDA prononce est gardé dans `e2e-nvda/journal/`.

Ce que l'écoute a montré :

| Constat | Ce que NVDA disait | État |
|---|---|---|
| M11 confirmé : en-tête de colonne pollué | « Martin SARL, Commande Réordonner la colonne : glisser-déposer, ou flèches gauche barre oblique droite au clavier Client, Trier Filtrer par Client 0, colonne 5 » | **Corrigé** : « Martin SARL, Commande Client, colonne 5 » |
| Doublon à la sélection | « 1 ligne(s) sélectionnée(s). 200 lignes 1 sélectionnée(s). Barre d'état » | **Corrigé** : avec la barre d'état, elle seule annonce le compte |
| Recherche bavarde | Le nombre de lignes est redit à chaque lettre tapée, même quand il ne change pas, suivi de « 1 – 10 sur 40 » du paginateur | **Corrigé** (quatrième lot) : un compte inchangé n'est plus redit pendant la saisie |
| Barre d'état bavarde en navigation | « 200 lignes 1 cellules. Barre d'état » redit à chaque flèche quand la sélection de plage est active | **Corrigé** (quatrième lot) : pas de statistiques pour une plage d'une seule cellule |
| Tri redondant | « Référence, tri croissant. 120 ligne(s) affichée(s). trié par ordre croissant. Référence, Trié croissant » | Gardé : NVDA annonce de lui-même le changement de tri de l'en-tête, d'autres lecteurs d'écran non ; l'annonce de la table reste donc |
| Détail, case de sélection, bouton de tri | Noms et états corrects (« Afficher le détail, bouton, réduit » puis « développé ») | Conforme |

Corrigés aussi dans ce lot, d'après la relecture du code :

| # | Correction | Preuve |
|---|---|---|
| M6 | Les bulles sont survolables (elles restent tant que le pointeur est dessus) et Échap les ferme même ouvertes au survol | Tests unitaires |
| M7 | Un texte tronqué s'affiche en bulle quand sa cellule ou son bouton d'en-tête reçoit le focus au clavier | Test e2e (cinquième lot) |
| M13 | L'éditeur à liste ne valide plus à chaque changement : Entrée, Tab ou la sortie du champ valident | Tests unitaires existants |
| M14 (reste) | Une saisie refusée puis abandonnée est annoncée avec son motif | Relecture |

Limite de ces essais : ils vérifient des phrases prononcées par un NVDA en français dans Chromium. Ils ne remplacent ni JAWS, ni VoiceOver, ni l'avis d'une personne qui utilise un lecteur d'écran au quotidien.

## Quatrième lot

| # | Correction | Preuve |
|---|---|---|
| M16 | Alternatives au glisser : boutons du menu Colonnes pour déplacer et ajuster une colonne ; poignée de ligne en deux clics (saisir, déposer) ; poignée de recopie en deux clics (armer, désigner la dernière cellule) | 2 tests e2e, 1 test unitaire |
| M17 (suite) | Colonne déplacée annoncée ; échec d'un bloc et erreur d'options de filtre en `role="alert"` ; recherche et barre d'état moins bavardes | Réécoute NVDA |
| m1 | Case de sélection nommée par la valeur de la première colonne | NVDA : « Sélectionner la ligne CMD-000001 » |
| m3, m6 | Bouton de filtre « Filtre actif sur X » ; croix de puce « Effacer le filtre : X » | Tests |
| m7 (en partie) | Croix des puces : zone de clic de 24 px | Relecture |
| m8 | F8 / Maj+F8 : ligne repérée suivante / précédente, annoncée | Test e2e |
| m9 | Poignée de redimensionnement : Entrée ajuste, Début et Fin vont aux butées | Test unitaire |
| m13 (en partie) | Rang ARIA de la ligne de totaux | Relecture |
| m18 (en partie) | Raccourcis du graphique déclarés (`aria-keyshortcuts`) | Relecture |
| m19 (en partie) | Texte des filtres en `rem` | Relecture |
| m20 | Lien externe annoncé « nouvel onglet » | Relecture |

## Cinquième lot

| # | Correction | Preuve |
|---|---|---|
| m4 | Panneau latéral : la liste d'onglets ne contient plus que les onglets ; un seul est dans l'ordre de tabulation ; flèches, Début et Fin ; `aria-controls` et `aria-labelledby` | Test unitaire, test e2e, NVDA : « Colonnes, onglet, sélectionné, 1 sur 2 » |
| m10 | Après un déplacement au clavier, le focus reste sur la poignée de la colonne ou de la ligne déplacée ; dans le menu Colonnes, sur un bouton de la même colonne | 3 tests e2e |
| m11 | Défilement virtuel : Ctrl+Fin, Ctrl+Début, Page suivante et Page précédente visent la liste entière ; après un saut à la barre de défilement, la cellule restée au focus est annoncée avec sa nouvelle ligne | Test unitaire, test e2e (sur une table groupée à en-têtes collants). L'annonce après un saut à la souris n'est ni testée ni écoutée avec NVDA ; le modèle par blocs n'est pas rejoué dans un navigateur |
| m14 | Barre d'actions : F6 y mène et en revient, flèches, Début et Fin entre les boutons, raccourci dit à la première ligne cochée. Tab continue de parcourir les boutons, parce que la barre peut contenir un gabarit de l'application | Test unitaire, test e2e, NVDA : « F 6 : barre d'actions », puis « Actions sur la sélection, barre d'outils. Tout désélectionner, bouton » |
| m16 (reste) | Bouton « Suspendre les mises à jour » (`[livePauseButton]`, `[(liveUpdatesPaused)]`) ; avec « moins d'animations », la teinte et le repère ▲ ▼ ◆ restent affichés sans fondu | Test unitaire, test e2e, NVDA : « Mises à jour suspendues ». Le repère fixe est relu, pas testé |
| m17 | Bouton « ajouter au tri » dans les en-têtes sur écran tactile, de 24 px au moins | Test unitaire, test e2e en émulation tactile |
| m21 | Textes du pivot, de la barre de zoom du graphique et de la liste déroulante rattachés à `provideNgTableLabels`, dans les cinq langues | Tests unitaires |
| M7 | Bulle d'un en-tête tronqué ouverte au focus clavier, fermée par Échap | Test e2e |
| M17 (reste) | Vue enregistrée, vue supprimée, tout replier, tout déplier, colonne déplacée au clavier | Test unitaire |
| m7 (suite) | Cases à cocher : zone de clic de 24 px | Relecture |
| m13 (reste) | `aria-colindex` des cellules de groupe et des en-têtes groupés | Relecture |
| m19 (suite) | Hauteur des champs de filtre en `rem` | Relecture |

**Bilan : les 41 constats sont traités.** Trois gardent une limite assumée :

- **m7** : la poignée de redimensionnement fait 14 px de large sur toute la hauteur de l'en-tête, et les traits de repère 4 px. L'élargir empiéterait sur les boutons voisins de l'en-tête. Équivalents : « Ajuster la largeur » dans le menu Colonnes, les flèches, Entrée, Début et Fin au clavier, F8 pour les repères. Le redimensionnement libre au doigt reste donc moins facile que les autres gestes.
- **m18** : le graphique zoomable reste un élément focalisable de rôle `img`, avec ses raccourcis déclarés. Un rôle plus juste pour un graphique interactif reste à choisir après écoute.
- **m19** : la hauteur des lignes reste en pixels, parce que le défilement virtuel calcule ses positions en pixels. Le zoom du navigateur fonctionne ; seul un agrandissement du texte seul peut rogner une ligne.

Ce qui n'est toujours pas fait : essais avec JAWS et VoiceOver, essai par une personne qui utilise un lecteur d'écran, relecture des traductions espagnole, allemande et arabe par des locuteurs natifs.

Les tableaux ci-dessous sont l'état d'origine de l'audit ; ils sont gardés pour mémoire.

## À faire : propositions par priorité

### Priorité 1 — bloque un utilisateur au clavier

| # | Constat | Critère | État | Proposition | Effort |
|---|---|---|---|---|---|
| B1 | Sans `[cellNavigation]` (désactivée par défaut), l'édition, la sélection de plage, la copie et la recopie n'existent qu'à la souris | 2.1.1 | Lu | Activer d'office la navigation par cellule dès qu'une colonne est éditable ou que `[rangeSelection]` est actif. Change le comportement par défaut : à annoncer dans une version mineure, ou à réserver à une majeure | Moyen |
| M3 | Tab depuis le dernier élément d'un menu ou d'une liste sort vers la fin de la page, le menu se ferme, le focus ne revient pas près du bouton | 2.4.3 | Lu | Aux extrémités, fermer le menu et rendre le focus au bouton avant de laisser Tab continuer | Moyen |
| M4 | Le focus est perdu quand le bouton activé disparaît : suppression d'une vue, croix de recherche, croix d'une puce de filtre, « Réinitialiser » de l'état vide, fermeture du panneau latéral, effacement de la sélection, retrait d'une condition du constructeur de filtres | 2.4.3 | Lu | Après chaque action, placer le focus sur un voisin stable (champ de recherche, puce suivante, bouton du panneau, cellule active) | Moyen, 9 endroits |
| M9 | Le rôle `treegrid` est posé dès qu'il y a un détail, un arbre ou des groupes, même sans navigation par cellule ; les lignes de groupe sont sautées par les flèches | 4.1.2, 2.1.1 | Lu | N'exposer `grid` / `treegrid` qu'avec `[cellNavigation]` ; inclure les lignes de groupe dans la navigation, avec Flèche droite / gauche pour déplier / replier et `aria-level` | Élevé |
| M16 | Aucune alternative au glisser pour qui ne peut que cliquer : redimensionner ou déplacer une colonne, déplacer une ligne, recopier | 2.5.7 | Lu | Commandes dans un menu de colonne (« Déplacer à gauche / à droite », « Ajuster la largeur »), « Monter / Descendre » pour une ligne, « Recopier vers le bas » dans la barre d'état | Élevé |

### Priorité 2 — information non transmise

| # | Constat | Critère | État | Proposition | Effort |
|---|---|---|---|---|---|
| M17 | Rien n'est annoncé pour : un filtre ou une recherche en mode serveur, la copie d'une cellule ou d'une plage, le nombre de cellules collées ou recopiées et les refus, le nombre de lignes sélectionnées, une vue activée ou enregistrée, un export, le chargement et l'échec d'un bloc | 4.1.3 | Lu | Un appel à la région d'annonce par action, avec des libellés dédiés dans les cinq langues | Moyen |
| M11 | Le nom d'un en-tête de colonne inclut les libellés de ses boutons (poignée, tri, filtre, redimensionnement) : chaque cellule lue est précédée de ce texte | 1.3.1 | Lu, à confirmer au lecteur d'écran | `aria-label` de l'en-tête réduit au titre ; consignes clavier en `aria-describedby` | Faible, mais à valider à l'écoute |
| M12 | Les panneaux Vues, Export et Filtre sont des `menu` qui contiennent des champs de saisie | 4.1.2 | Lu | `role="dialog"` nommé, comme le panneau Colonnes | Faible |
| M7 | Un texte tronqué (cellule, en-tête) n'est lisible en entier qu'au survol | 1.4.13, 2.1.1 | Lu | Ouvrir la bulle quand la cellule ou le bouton d'en-tête reçoit le focus | Faible |
| M6 | Les bulles ne peuvent pas être survolées, et Échap ne les ferme que si l'élément a le focus | 1.4.13 | Lu | Garder la bulle tant que le pointeur est dessus ; Échap au niveau du document | Moyen |
| M13 | L'éditeur à liste valide à chaque changement : sous Windows, une flèche ferme l'éditeur sur l'option voisine | 3.2.2 | Lu, à confirmer | Valider sur Entrée ou à la perte de focus | Faible |
| M14 (reste) | Une saisie invalide est abandonnée sans message quand le champ perd le focus | 3.3.1 | Lu | Annoncer l'abandon, ou garder l'éditeur ouvert | Faible |
| m11 | Avec la réutilisation des lignes, une cellule au focus change de contenu après un saut, sans annonce ; Ctrl+Fin et Page suivante s'arrêtent aux lignes rendues | 2.4.3 | Lu | Annoncer la nouvelle position ; faire défiler puis placer le focus sur la vraie dernière ligne | Moyen |

### Priorité 3 — confort et finitions

| # | Constat | Critère | Proposition |
|---|---|---|---|
| m1 | « Sélectionner la ligne 3 » suit le rang de rendu et change au défilement | 2.4.6 | Nommer par la valeur de la première colonne |
| m3 | Le bouton de filtre s'appelle « Filtrer par X » qu'un filtre soit actif ou non | 4.1.2 | Libellé « Filtre actif sur X » |
| m4 | Panneau latéral : onglets sans `aria-controls`, boutons étrangers dans la liste d'onglets, pas de flèches | 4.1.2 | Compléter le motif « tabs » |
| m6 | Libellés imprécis : croix de puces toutes nommées « Effacer le filtre », poignées sans nom de colonne, liste de valeurs nommée « Tout sélectionner » | 2.4.6 | Inclure le nom du champ ou de la colonne |
| m7 | Cibles sous 24 px : croix des puces (18 à 22 px), cases à cocher (18 px), poignée de redimensionnement (14 px), traits de repère (4 px) | 2.5.8 | Agrandir la zone de clic sans changer le dessin |
| m8, m9 | Sans équivalent clavier : aller à la ligne repérée suivante ; ajuster une colonne (double-clic) | 2.1.1 | Raccourci (F8) avec annonce ; Entrée sur la poignée |
| m10 | Focus après le déplacement d'une colonne ou d'une ligne au clavier | 2.4.3 | À vérifier dans un navigateur |
| m13 | Rangs ARIA manquants : ligne de totaux, cellules de groupe, en-têtes groupés | 1.3.1 | Compléter `aria-rowindex` / `aria-colindex` |
| m14 | La barre d'actions de sélection n'est jamais atteinte par programme ; pas de flèches entre ses boutons | 2.4.3 | Raccourci vers la barre, `tabindex` itinérant |
| m16 (reste) | Mode live : aucune commande pour l'utilisateur afin de suspendre les mises à jour ; surbrillance réduite à rien avec « moins d'animations », sans repère fixe | 2.2.2, 2.3.3 | Bouton « Suspendre » ; garder le repère ▲ ▼ sans animation |
| m17 | « Maj+clic : ajouter un niveau de tri » n'est dit que dans une bulle ; pas d'équivalent tactile | 3.3.2 | Entrée dans le menu de colonne |
| m18 | Graphique focalisable en `role="img"`, raccourcis non annoncés | 4.1.2 | `aria-roledescription` et `aria-keyshortcuts` |
| m19 | Tailles de texte en pixels dans les filtres ; hauteurs fixes | 1.4.4 | Passer en `rem` |
| m20 | Lien externe sans avertissement (`cell: {type: 'link', external: true}`) | 3.2.5 (AAA) | Mention « nouvel onglet » pour les lecteurs d'écran |
| m21 | Textes du pivot, du graphique et de la liste hors du système de libellés | 3.1.2 | Les rattacher à `provideNgTableLabels` |

## Ce qui est bien traité (à ne pas casser)

- **Région d'annonce** toujours présente, qui relit un texte identique.
- **Tri** : `aria-sort` sur le tri principal, nom du bouton commençant par le libellé visible.
- **Équivalents clavier** déjà en place : déplacement et redimensionnement de colonne, déplacement de ligne (Alt+flèches), menu contextuel (Maj+F10), recopie (Ctrl+D, Ctrl+R), plage (Maj+flèches, Ctrl+A, Ctrl+C).
- **Grille** : `tabindex` itinérant, Entrée ou F2 pour entrer dans une cellule, Échap pour en sortir, pas de piège au clavier.
- **Menus et listes** : `aria-haspopup`, `aria-expanded`, retour du focus sur Échap, liste déroulante en `combobox` / `listbox`.
- **Virtualisation** : `aria-rowcount`, `aria-rowindex`, `aria-colcount`, `aria-colindex`.
- **Couleur jamais seule** : sens d'une variation par ▲ ▼ ◆, formes des séries de graphiques, épaisseur des repères, hachures des valeurs négatives.
- **Contraste élevé de Windows** (`forced-colors`) et **impression** traités dans toutes les feuilles de style.
- **Sens de lecture** droite-à-gauche complet.

## Prochaines étapes recommandées

1. **Essais avec d'autres lecteurs d'écran** : NVDA avec Firefox, JAWS, VoiceOver avec Safari, sur les huit parcours déjà écoutés avec NVDA dans Chromium.
2. **Relecture par des personnes concernées**, et relecture des traductions espagnole, allemande et arabe des libellés.
3. **Les trois limites du cinquième lot** (m7, m18, m19), à reprendre si un essai réel montre qu'elles gênent.

## Annexe : familles de critères passées en revue

Équivalents clavier (2.1.1), alternative au glisser (2.5.7), ordre et visibilité du focus (2.4.3, 2.4.7, 2.4.11, 2.1.2), noms, rôles et structure (4.1.2, 1.3.1), annonces (4.1.3), taille des cibles (2.5.8), mouvement et délais (2.2.1, 2.2.2, 2.3.3), contenu au survol (1.4.13), zoom et reflow (1.4.4, 1.4.10, 1.4.12), couleur et contraste non textuel (1.4.1, 1.4.11), saisie (3.3.1, 3.3.2), langue (3.1.2).
