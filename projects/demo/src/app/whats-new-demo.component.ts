import {ChangeDetectionStrategy, Component, computed, signal, viewChild} from '@angular/core';
import {
  describeAdvancedFilter,
  NgTableBlockRequest,
  NgTableBlockResult,
  NgTableColumn,
  NgTableComponent,
  NgTableFilterBuilderComponent,
  NgTableFilterGroup,
  NgTableRemoteDatasource,
} from '@sbourahla/ng-table';
import {CLIENTS, Commande, generateCommandes, STATUT_LABELS} from './demo-data';

type CommandeMiseEnForme = Commande & {avancement: number; note: number; marge: number};

interface LigneCommande {
  id: string;
  article: string;
  quantite: number;
  remise: number;
}

const TOTAL_SERVEUR = 1_000_000;

/**
 * Nouveautés : une section par fonctionnalité ajoutée récemment, avec ce qu'il faut essayer pour la voir.
 * Tout ce qui est mesuré ici l'est dans votre navigateur, à l'instant.
 */
@Component({
  selector: 'app-whats-new-demo',
  standalone: true,
  imports: [NgTableComponent, NgTableFilterBuilderComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
    .try {
      margin: 0 0 12px;
      padding: 10px 14px;
      border-inline-start: 4px solid var(--ngt-primary, #2f6fa8);
      background: var(--ngt-surface-soft, #f4f7fa);
      border-radius: 6px;
    }

    .try > b:first-child {
      display: block;
      margin-bottom: 2px;
    }

    .counters {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin: 0 0 12px;
    }

    .counter {
      padding: 6px 12px;
      border: 1px solid var(--ngt-border, rgba(20, 33, 43, 0.15));
      border-radius: 8px;
      font-variant-numeric: tabular-nums;
    }

    .counter b {
      font-size: 1.15em;
    }

    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin: 0 0 12px;
    }

    .actions button {
      padding: 6px 12px;
      border: 1px solid var(--ngt-border-strong, rgba(20, 33, 43, 0.3));
      border-radius: 8px;
      background: var(--ngt-surface, #fff);
      color: inherit;
      font: inherit;
      cursor: pointer;
    }

    .actions button[aria-pressed='true'] {
      background: var(--ngt-primary, #2f6fa8);
      border-color: var(--ngt-primary, #2f6fa8);
      color: var(--ngt-on-primary, #fff);
    }

    .log {
      margin: 0 0 12px;
      padding: 0;
      list-style: none;
      font-variant-numeric: tabular-nums;
    }

    .log li:first-child {
      font-weight: 700;
    }

    .detail {
      padding: 12px 16px;
      line-height: 1.5;
    }
    `,
  ],
  template: `
    <p class="demo-intro">
      Les fonctionnalités ajoutées récemment, une par section. Chaque encadré « À essayer » dit quoi faire pour la voir.
    </p>

    <!-- 1 -->
    <div class="demo-card">
      <h2>1. Cellules prêtes à l'emploi</h2>
      <p class="try">
        <b>À essayer</b>
        Regardez les colonnes : avatar, lien, pastille, barre de données, barre de progression, note en étoiles, dégradé de
        couleur. Triez « Marge » : les lignes <b>glissent</b> vers leur nouvelle place (<code>[animateRows]</code>) ; les valeurs négatives
        sont en rouge, les positives en vert, et le nombre reste toujours lisible.
      </p>
      <ng-table [animateRows]="true" [ariaLabel]="'Commandes mises en forme'" [columns]="formatColumns" [density]="'compact'" [rows]="formatRows"/>
      <pre class="demo-code" tabindex="0">{{ formatCode }}</pre>
    </div>

    <!-- 2 -->
    <div class="demo-card" style="margin-top: 16px">
      <h2>2. Recherche surlignée et état vide</h2>
      <p class="try">
        <b>À essayer</b>
        Tapez <code>dupont exp</code> dans la recherche : le texte trouvé est surligné, accents et majuscules ignorés (essayez
        <code>expediee</code>). Puis tapez <code>zzz</code> : la table dit qu'aucune ligne ne correspond et propose de réinitialiser.
      </p>
      <ng-table
        [ariaLabel]="'Commandes avec recherche surlignée'"
        [columns]="searchColumns"
        [globalSearchEnabled]="true"
        [highlightSearch]="true"
        [paginator]="true"
        [rows]="searchRows"
      />
    </div>

    <!-- 3 -->
    <div class="demo-card" style="margin-top: 16px">
      <h2>3. Tri et filtres : la table se souvient</h2>
      <p class="try">
        <b>À essayer</b>
        200 000 lignes. Triez « Référence » (premier tri : la table lit toutes les valeurs), puis cliquez encore pour
        <b>inverser</b> : le temps chute, car rien n'est relu. Filtrez ensuite « Client » en tapant <code>dup</code> puis
        <code>dupo</code>, ou revenez au tri « Référence » après un tri « Montant ».
      </p>
      <div class="counters" aria-live="polite">
        <span class="counter">Dernière action : <b>{{ lastTiming() }}</b></span>
      </div>
      <ol class="log" aria-label="Dernières actions">
        @for (entry of timings(); track $index) {
          <li>{{ entry }}</li>
        }
      </ol>
      <ng-table
        (filtersChange)="time('filtre')"
        (sortChange)="time($event.direction ? 'tri ' + $event.columnId + ' ' + $event.direction : 'tri retiré')"
        [ariaLabel]="'200 000 commandes'"
        [columns]="bigColumns"
        [density]="'compact'"
        [maxHeight]="'360px'"
        [rows]="bigRows"
        [virtualScroll]="true"
      />
    </div>

    <!-- 4 -->
    <div class="demo-card" style="margin-top: 16px">
      <h2>4. Défilement virtuel avec des lignes de hauteurs différentes</h2>
      <p class="try">
        <b>À essayer</b>
        5 000 lignes, dont une sur deux a une description sur plusieurs lignes. Dépliez le détail de deux ou trois lignes
        (chevron à gauche), puis cliquez « Aller à la ligne 2 500 » et « Revenir en haut » : les détails sont restés à leur
        place et la ligne demandée arrive bien en haut. La hauteur totale ci-dessous augmente quand vous dépliez.
      </p>
      <div class="actions">
        <button (click)="goTo(2499)" type="button">Aller à la ligne 2 500</button>
        <button (click)="goTo(4999)" type="button">Aller à la dernière ligne</button>
        <button (click)="goTo(0)" type="button">Revenir en haut</button>
      </div>
      <ng-table
        #heights
        [ariaLabel]="'Commandes à hauteurs variables'"
        [columns]="heightColumns"
        [detailRowTemplate]="detailTpl"
        [maxHeight]="'380px'"
        [rows]="heightRows"
        [virtualScroll]="true"
      />
      <ng-template #detailTpl let-row>
        <div class="detail">
          <strong>{{ row.reference }}</strong> — {{ row.client }}, {{ row.montant }} € HT.<br/>
          {{ row.description }}<br/>
          Commande du {{ row.dateCommande }}.
        </div>
      </ng-template>
    </div>

    <!-- 4 bis -->
    <div class="demo-card" style="margin-top: 16px">
      <h2>5. En-tête de groupe collant et repères dans la barre de défilement</h2>
      <p class="try">
        <b>À essayer</b>
        6 000 lignes regroupées par client. Faites défiler : l'en-tête du groupe en cours reste collé en haut. Le long du
        bord droit, les traits rouges montrent où sont les commandes de plus de 9 950 € dans toute la liste ; cochez
        quelques lignes, des traits bleus plus fins apparaissent à leur hauteur.
      </p>
      <ng-table
        [ariaLabel]="'Commandes regroupées par client'"
        [columns]="groupColumns"
        [density]="'compact'"
        [groupBy]="'client'"
        [maxHeight]="'380px'"
        [rowMarker]="markBigOrders"
        [rowSelectionEnabled]="true"
        [rows]="groupRows"
        [scrollMarkers]="true"
        [stickyGroupHeaders]="true"
        [virtualScroll]="true"
      />
    </div>

    <!-- 5 bis -->
    <div class="demo-card" style="margin-top: 16px">
      <h2>6. Poignée de recopie, comme dans un tableur</h2>
      <p class="try">
        <b>À essayer</b>
        Cliquez une cellule « Quantité » ou « Remise » : un petit carré apparaît à son coin. Tirez-le vers le bas : la valeur
        est recopiée. Sélectionnez d'abord les deux premières quantités (10 et 20), puis tirez : la suite continue (30, 40…).
        Ctrl+Z annule toute la recopie d'un coup. Au clavier : sélectionnez une plage avec Maj+flèches, puis Ctrl+D.
      </p>
      <ng-table
        [ariaLabel]="'Lignes de commande modifiables'"
        [cellNavigation]="true"
        [columns]="fillColumns"
        [density]="'compact'"
        [fillHandle]="true"
        [rangeSelection]="true"
        [rows]="fillRows"
      />
    </div>

    <!-- 5 ter -->
    <div class="demo-card" style="margin-top: 16px">
      <h2>7. Filtre avancé : des conditions avec ET / OU</h2>
      <p class="try">
        <b>À essayer</b>
        Le filtre de départ dit : (Validée OU Expédiée) ET montant de plus de 5 000 €. Changez « Toutes les conditions (ET) »
        en « Au moins une (OU) », cochez « Sauf », ajoutez une condition ou un groupe. Une valeur s'écrit comme dans le filtre
        de la colonne : <code>&gt;5000</code>, <code>100..500</code>, un texte.
      </p>
      <ng-table-filter-builder [(filter)]="advanced" [columns]="advancedColumns"/>
      <p class="demo-intro" style="margin: 10px 0">
        En clair : <b>{{ advancedText() || 'aucun filtre' }}</b>
      </p>
      <ng-table
        [(advancedFilter)]="advanced"
        [ariaLabel]="'Commandes filtrées par conditions'"
        [columns]="advancedColumns"
        [density]="'compact'"
        [paginator]="true"
        [rows]="searchRows"
      />
    </div>

    <!-- 5 -->
    <div class="demo-card" style="margin-top: 16px">
      <h2>8. Un million de lignes sur le serveur : annuler et charger d'avance</h2>
      <p class="try">
        <b>À essayer</b>
        Le « serveur » est simulé et répond en 400 ms. Cliquez « Sauter à un endroit, puis aussitôt à un autre » : les demandes du
        premier endroit ne servent plus et sont <b>annulées</b> (compteur). Activez ensuite « Charger d'avance » et faites défiler doucement :
        le bloc suivant est demandé avant que vous y arriviez, il y a moins de lignes grises.
      </p>
      <div class="actions">
        <button (click)="prefetch.set(prefetch() === 0 ? 1 : 0)" [attr.aria-pressed]="prefetch() === 1" type="button">
          Charger d'avance : {{ prefetch() === 1 ? 'oui' : 'non' }}
        </button>
        <button (click)="jumpTwice()" type="button">Sauter à un endroit, puis aussitôt à un autre</button>
        <button (click)="resetCounters()" type="button">Remettre les compteurs à zéro</button>
      </div>
      <div class="counters" aria-live="polite">
        <span class="counter">Blocs demandés : <b>{{ requested() }}</b></span>
        <span class="counter">Reçus : <b>{{ received() }}</b></span>
        <span class="counter">Annulés : <b>{{ aborted() }}</b></span>
        <span class="counter">Dernier bloc demandé : <b>{{ lastBlock() }}</b></span>
      </div>
      <ng-table
        #blocks
        [ariaLabel]="'Un million de commandes côté serveur'"
        [columns]="blockColumns"
        [dataMode]="'remote'"
        [density]="'compact'"
        [maxHeight]="'360px'"
        [prefetchBlocks]="prefetch()"
        [remoteDatasource]="datasource"
        [rows]="[]"
      />
    </div>
  `,
})
export class WhatsNewDemoComponent {
  // ------------------------------------------------------------------ 1. cellules prêtes à l'emploi
  protected readonly formatRows: CommandeMiseEnForme[] = generateCommandes(8).map((commande, index) => ({
    ...commande,
    avancement: (index * 37) % 101,
    note: 1 + ((index * 7) % 9) / 2,
    marge: Math.round(((index * 53) % 61) - 22),
  }));

  protected readonly formatColumns: NgTableColumn<CommandeMiseEnForme>[] = [
    {id: 'client', header: 'Client', valueAccessor: (c) => c.client, sortable: true, cell: {type: 'avatar'}},
    {
      id: 'reference',
      header: 'Référence',
      valueAccessor: (c) => c.reference,
      cell: {type: 'link', href: (c) => `https://example.com/commandes/${c.reference}`, external: true},
    },
    {
      id: 'statut',
      header: 'Statut',
      valueAccessor: (c) => STATUT_LABELS[c.statut],
      sortable: true,
      cell: {type: 'badge', tone: {Brouillon: 'neutral', Validée: 'info', Expédiée: 'success', Annulée: 'danger'}},
    },
    {id: 'montant', header: 'Montant (€)', valueAccessor: (c) => c.montant, sortable: true, cell: {type: 'dataBar'}},
    {id: 'avancement', header: 'Avancement', valueAccessor: (c) => c.avancement, sortable: true, cell: {type: 'progress'}},
    {id: 'note', header: 'Note', valueAccessor: (c) => c.note, sortable: true, cell: {type: 'rating'}},
    {id: 'marge', header: 'Marge (%)', valueAccessor: (c) => c.marge, sortable: true, cell: {type: 'colorScale', diverging: true}},
  ];

  protected readonly formatCode = `columns: NgTableColumn<Commande>[] = [
  {id: 'client', header: 'Client', valueAccessor: (c) => c.client, cell: {type: 'avatar'}},
  {id: 'reference', header: 'Référence', valueAccessor: (c) => c.reference,
   cell: {type: 'link', href: (c) => '/commandes/' + c.reference}},
  {id: 'statut', header: 'Statut', valueAccessor: (c) => c.statut,
   cell: {type: 'badge', tone: {Validée: 'info', Expédiée: 'success', Annulée: 'danger'}}},
  {id: 'montant', header: 'Montant (€)', valueAccessor: (c) => c.montant, cell: {type: 'dataBar'}},
  {id: 'avancement', header: 'Avancement', valueAccessor: (c) => c.avancement, cell: {type: 'progress'}},
  {id: 'note', header: 'Note', valueAccessor: (c) => c.note, cell: {type: 'rating'}},
  {id: 'marge', header: 'Marge (%)', valueAccessor: (c) => c.marge, cell: {type: 'colorScale', diverging: true}},
];`;

  // ------------------------------------------------------------------ 2. recherche surlignée
  protected readonly searchRows = generateCommandes(120);
  protected readonly searchColumns: NgTableColumn<Commande>[] = [
    {id: 'reference', header: 'Référence', valueAccessor: (c) => c.reference, sortable: true},
    {id: 'client', header: 'Client', valueAccessor: (c) => c.client, sortable: true},
    {id: 'statut', header: 'Statut', valueAccessor: (c) => STATUT_LABELS[c.statut], sortable: true},
    {id: 'description', header: 'Description', valueAccessor: (c) => c.description},
  ];

  // ------------------------------------------------------------------ 3. tri et filtres en mémoire
  protected readonly bigRows = generateCommandes(200_000);
  protected readonly bigColumns: NgTableColumn<Commande>[] = [
    {id: 'reference', header: 'Référence', valueAccessor: (c) => c.reference, sortable: true, filter: {type: 'text'}},
    {id: 'client', header: 'Client', valueAccessor: (c) => c.client, sortable: true, filter: {type: 'text'}},
    {id: 'statut', header: 'Statut', valueAccessor: (c) => STATUT_LABELS[c.statut], sortable: true, filter: {type: 'text'}},
    {id: 'montant', header: 'Montant (€)', valueAccessor: (c) => c.montant, sortable: true, filter: {type: 'number'}},
  ];
  protected readonly timings = signal<string[]>([]);
  protected readonly lastTiming = signal('aucune encore');

  /** Du clic à la deuxième image peinte : calcul et affichage compris, comme dans la page Benchmark. */
  protected time(label: string): void {
    const start = performance.now();
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const text = `${Math.round(performance.now() - start)} ms`;
        this.lastTiming.set(`${label} — ${text}`);
        this.timings.update((entries) => [`${label} : ${text}`, ...entries].slice(0, 6));
      }),
    );
  }

  // ------------------------------------------------------------------ 4. hauteurs variables
  private readonly heightsTable = viewChild<NgTableComponent<Commande>>('heights');
  protected readonly heightRows = generateCommandes(5000);
  protected readonly heightColumns: NgTableColumn<Commande>[] = [
    {id: 'reference', header: 'Référence', valueAccessor: (c) => c.reference, sortable: true, widthPx: 140},
    {id: 'client', header: 'Client', valueAccessor: (c) => c.client, sortable: true, widthPx: 180},
    {id: 'description', header: 'Description (sur plusieurs lignes)', valueAccessor: (c) => c.description, textOverflow: 'wrap'},
    {id: 'montant', header: 'Montant (€)', valueAccessor: (c) => c.montant, sortable: true, widthPx: 130},
  ];

  protected goTo(index: number): void {
    this.heightsTable()?.scrollToIndex(index);
  }

  // ------------------------------------------------------------------ 5. groupe collant et repères
  protected readonly groupRows = generateCommandes(6000);
  protected readonly groupColumns: NgTableColumn<Commande>[] = [
    {id: 'client', header: 'Client', valueAccessor: (c) => c.client, sortable: true},
    {id: 'reference', header: 'Référence', valueAccessor: (c) => c.reference, sortable: true},
    {
      id: 'statut',
      header: 'Statut',
      valueAccessor: (c) => STATUT_LABELS[c.statut],
      sortable: true,
      cell: {type: 'badge', tone: {Brouillon: 'neutral', Validée: 'info', Expédiée: 'success', Annulée: 'danger'}},
    },
    {id: 'montant', header: 'Montant (€)', valueAccessor: (c) => c.montant, sortable: true, aggregate: 'sum'},
  ];
  /** Repère rouge : les plus grosses commandes (plus de 9 950 €, une trentaine sur 6 000). */
  protected readonly markBigOrders = (commande: Commande) => (commande.montant > 9950 ? ('danger' as const) : null);

  // ------------------------------------------------------------------ 7. poignée de recopie
  protected readonly fillRows: LigneCommande[] = ['Vis M6', 'Écrou M6', 'Rondelle', 'Cheville', 'Équerre', 'Charnière', 'Poignée', 'Serrure'].map((article, index) => ({
    id: `${index + 1}`,
    article,
    quantite: index < 2 ? (index + 1) * 10 : 1,
    remise: 0,
  }));
  protected readonly fillColumns: NgTableColumn<LigneCommande>[] = [
    {id: 'article', header: 'Article', valueAccessor: (ligne) => ligne.article},
    {
      id: 'quantite',
      header: 'Quantité',
      valueAccessor: (ligne) => ligne.quantite,
      editable: true,
      editor: 'number',
      valueSetter: (ligne, value) => ({...ligne, quantite: value as number}),
      validate: (value) => ((value as number) < 0 ? 'Une quantité ne peut pas être négative' : null),
    },
    {
      id: 'remise',
      header: 'Remise (%)',
      valueAccessor: (ligne) => ligne.remise,
      editable: true,
      editor: 'number',
      valueSetter: (ligne, value) => ({...ligne, remise: value as number}),
    },
  ];

  // ------------------------------------------------------------------ filtre avancé
  protected readonly advancedColumns: NgTableColumn<Commande>[] = [
    {id: 'reference', header: 'Référence', valueAccessor: (c) => c.reference, sortable: true, filter: {type: 'text'}},
    {id: 'client', header: 'Client', valueAccessor: (c) => c.client, sortable: true, filter: {type: 'text'}},
    {id: 'statut', header: 'Statut', valueAccessor: (c) => STATUT_LABELS[c.statut], sortable: true, filter: {type: 'text'}},
    {id: 'montant', header: 'Montant (€)', valueAccessor: (c) => c.montant, sortable: true, filter: {type: 'number'}},
  ];
  protected readonly advanced = signal<NgTableFilterGroup | null>({
    operator: 'and',
    children: [
      {operator: 'or', children: [{columnId: 'statut', value: 'Validée'}, {columnId: 'statut', value: 'Expédiée'}]},
      {columnId: 'montant', value: '>5000'},
    ],
  });
  protected readonly advancedText = computed(() => describeAdvancedFilter(this.advanced(), this.advancedColumns, {and: 'ET', or: 'OU', not: 'SAUF'}));

  // ------------------------------------------------------------------ 6. blocs : annulation et chargement d'avance
  private readonly blocksTable = viewChild<NgTableComponent<Commande>>('blocks');
  protected readonly prefetch = signal(0);
  protected readonly requested = signal(0);
  protected readonly received = signal(0);
  protected readonly aborted = signal(0);
  protected readonly lastBlock = signal('—');

  protected readonly blockColumns: NgTableColumn<Commande>[] = [
    {id: 'reference', header: 'Référence', valueAccessor: (c) => c.reference},
    {id: 'client', header: 'Client', valueAccessor: (c) => c.client},
    {id: 'statut', header: 'Statut', valueAccessor: (c) => STATUT_LABELS[c.statut]},
    {id: 'montant', header: 'Montant (€)', valueAccessor: (c) => c.montant},
  ];

  /** Faux serveur : 400 ms par bloc, et il abandonne une demande dont le signal est levé (comme `fetch`). */
  protected readonly datasource: NgTableRemoteDatasource<Commande> = {
    getRows: (request: NgTableBlockRequest) =>
      new Promise<NgTableBlockResult<Commande>>((resolve, reject) => {
        this.requested.update((count) => count + 1);
        this.lastBlock.set(`n° ${request.page.index} (lignes ${request.startRow + 1} à ${request.endRow})`);
        const timer = setTimeout(() => {
          this.received.update((count) => count + 1);
          resolve({rows: commandesFrom(request.startRow, Math.min(request.endRow, TOTAL_SERVEUR)), totalCount: TOTAL_SERVEUR});
        }, 400);
        request.signal?.addEventListener('abort', () => {
          clearTimeout(timer);
          this.aborted.update((count) => count + 1);
          reject(new DOMException('Demande annulée', 'AbortError'));
        });
      }),
  };

  protected jumpTwice(): void {
    // Deux endroits jamais visités (tirés au hasard) : sinon les blocs sont déjà en cache et rien n'est demandé.
    const table = this.blocksTable();
    const middle = 100_000 + Math.floor(Math.random() * 400_000);
    table?.scrollToIndex(middle);
    setTimeout(() => table?.scrollToIndex(middle + 300_000 + Math.floor(Math.random() * 100_000)), 200);
  }

  protected resetCounters(): void {
    this.requested.set(0);
    this.received.set(0);
    this.aborted.set(0);
  }
}

/** Lignes `[start, end)` du faux serveur, calculées depuis leur rang (rien n'est stocké). */
function commandesFrom(start: number, end: number): Commande[] {
  const statuts = Object.keys(STATUT_LABELS) as Commande['statut'][];
  const rows: Commande[] = [];
  for (let i = start; i < end; i++) {
    rows.push({
      id: `${i + 1}`,
      reference: `CMD-${String(i + 1).padStart(7, '0')}`,
      client: CLIENTS[i % CLIENTS.length],
      statut: statuts[i % statuts.length],
      montant: Math.round(((i * 7919) % 100000) + 50) / 10,
      dateCommande: `2026-${String((i % 12) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`,
      urgent: i % 5 === 0,
      description: '',
    });
  }
  return rows;
}
