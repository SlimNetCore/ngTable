import {ChangeDetectionStrategy, Component, computed, effect, signal, TemplateRef, viewChild} from '@angular/core';
import {MatButtonModule} from '@angular/material/button';
import {MatButtonToggleModule} from '@angular/material/button-toggle';
import {MatIconModule} from '@angular/material/icon';
import {MatMenuModule} from '@angular/material/menu';
import {MatSlideToggleModule} from '@angular/material/slide-toggle';
import {
  NG_TABLE_LABELS_EN,
  NgTableColumn,
  NgTableComponent,
  NgTableCopyEvent,
  NgTableExportFormat,
  NgTableFilterOption,
} from '@sbourahla/ng-table';
import {NgTableUrlStateDirective} from '@sbourahla/ng-table/router';
import {PageBarComponent} from './page-bar.component';
import {CLIENTS, Commande, CommandeStatut, generateCommandes, STATUT_LABELS, STATUT_OPTIONS} from './demo-data';

type CellTemplate = NgTableColumn<Commande>['cellTemplate'];

/** Date ISO + n jours (livraison prévue), sans fuseau horaire. */
function addDays(isoDay: string, days: number): string {
  const date = new Date(`${isoDay}T00:00:00`);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/**
 * Mode avancé : toutes les fonctionnalités d'affichage et d'interaction, en mode
 * local (données en mémoire). Chaque réglage du panneau active une option de la lib.
 */
@Component({
  selector: 'app-advanced-demo',
  standalone: true,
  imports: [
    NgTableComponent,
    NgTableUrlStateDirective,
    MatSlideToggleModule,
    MatButtonToggleModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    PageBarComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .detail { padding: 8px 16px; color: #4f6573; line-height: 1.5; }
    .actions { display: flex; gap: 2px; }
    .actions button { --mat-icon-button-state-layer-size: 32px; width: 32px; height: 32px; padding: 4px; }
    .loader { display: flex; flex-direction: column; align-items: center; gap: 8px; color: #1d4f91; font-weight: 500; }
    .loader mat-icon { animation: spin 1s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
  `,
  template: `
    <p class="demo-intro">
      Toutes les fonctionnalités d'affichage et d'interaction, sur des données en mémoire. Chaque réglage active une
      option ; l'état (tri, filtres, recherche, page) est aussi reflété dans l'URL grâce à <code>ngTableUrlState</code>.
    </p>

    <div class="demo-card">
      <h2>Réglages</h2>
      <div class="demo-settings">
        <span>
          <span class="setting-label">Lignes</span>
          <mat-button-toggle-group [value]="rowCount()" (change)="rowCount.set($event.value)">
            <mat-button-toggle [value]="200">200</mat-button-toggle>
            <mat-button-toggle [value]="5000">5 000</mat-button-toggle>
            <mat-button-toggle [value]="50000">50 000</mat-button-toggle>
          </mat-button-toggle-group>
        </span>
        <span>
          <span class="setting-label">Pagination</span>
          <mat-button-toggle-group [value]="pagination()" (change)="pagination.set($event.value)">
            <mat-button-toggle value="integree">Intégrée</mat-button-toggle>
            <mat-button-toggle value="personnalisee">Personnalisée</mat-button-toggle>
            <mat-button-toggle value="virtuelle">Défilement virtuel</mat-button-toggle>
            <mat-button-toggle value="aucune">Aucune</mat-button-toggle>
          </mat-button-toggle-group>
        </span>
        <span>
          <span class="setting-label">Export</span>
          <mat-button-toggle-group [value]="exportFormat()" (change)="exportFormat.set($event.value)">
            <mat-button-toggle value="csv">CSV</mat-button-toggle>
            <mat-button-toggle value="xlsx">Excel</mat-button-toggle>
          </mat-button-toggle-group>
        </span>
        @for (setting of settings; track setting.label) {
          <mat-slide-toggle [checked]="setting.value()" (change)="setting.value.set($event.checked)">
            {{ setting.label }}
          </mat-slide-toggle>
        }
      </div>
    </div>

    <ng-table
      [ngTableUrlState]="'av'"
      [ariaLabel]="'Commandes (mode avancé)'"
      [columns]="columns()"
      [rows]="rows()"
      [rowKeyAccessor]="rowKey"
      [rowClassFn]="rowClass"
      [labels]="english() ? labelsEn : {}"
      [emptyLabel]="english() ? 'No order matches.' : 'Aucune commande ne correspond.'"
      [globalSearchEnabled]="true"
      [showActiveFiltersBar]="true"
      [inlineFilters]="inlineFilters()"
      [multiSort]="multiSort()"
      [cellNavigation]="cellNavigation()"
      [groupingEnabled]="grouping()"
      [(groupBy)]="groupBy"
      [showTotals]="totalsRow()"
      [paginator]="pagination() === 'integree'"
      [pageTrackingEnabled]="pagination() === 'personnalisee'"
      [virtualScroll]="pagination() === 'virtuelle'"
      [(pageIndex)]="pageIndex"
      [(pageSize)]="pageSize"
      [pageSizeOptions]="[10, 25, 100]"
      (filteredCountChange)="filteredTotal.set($event)"
      [rowSelectionEnabled]="selection()"
      [columnsMenuEnabled]="columnsMenu()"
      [referenceColumnSelectable]="true"
      [density]="compact() ? 'compact' : 'default'"
      [stickyHeader]="stickyHeader()"
      [maxHeight]="stickyHeader() ? '60vh' : null"
      [loading]="loading()"
      [loadingTemplate]="customLoader() ? loaderTpl : null"
      [detailRowTemplate]="detailRows() ? detailTpl : null"
      [detailRowAccordion]="true"
      [rowContextMenuEnabled]="contextMenu()"
      [rowContextMenuTemplate]="contextMenuTpl"
      [viewsEnabled]="true"
      [viewsStorageKey]="'demo-avance'"
      [viewsImportExportEnabled]="true"
      [exportEnabled]="true"
      [exportFilename]="'commandes'"
      [exportFormat]="exportFormat()"
      (selectionChange)="selectedCount.set($event.selectedKeys.length)"
      (cellCopied)="onCopied($event)"
      (rowClick)="lastClicked.set($event.reference)"
    />

    @if (pagination() === 'personnalisee') {
      <app-page-bar [total]="filteredTotal()" [(pageIndex)]="pageIndex" [(pageSize)]="pageSize" [sizes]="[10, 25, 100]"/>
      <div class="demo-card" style="margin-top: 12px">
        <h2>Brancher son propre paginateur</h2>
        <pre class="demo-code">{{ customPaginatorCode }}</pre>
      </div>
    }

    <p class="demo-meta">
      {{ rows().length }} lignes
      @if (selection()) { · {{ selectedCount() }} sélectionnée(s) }
      @if (lastClicked()) { · dernière ligne cliquée : {{ lastClicked() }} }
      @if (copied()) { · copié : « {{ copied() }} » }
    </p>

    <div class="demo-card">
      <h2>Ce que montre ce mode</h2>
      <ul class="demo-features">
        <li>Filtres de tous types : texte avec opérateur (<code>startsWith</code>), options chargées à la demande
          (Client), <code>enum</code> multi-valeurs, expressions numériques (<code>&gt;1000</code>, <code>100..500</code>),
          plage numérique (TTC), période, jour exact, booléen.</li>
        <li>Recherche globale (le statut est cherché sur son libellé via <code>searchable</code>).</li>
        <li>Tri, et tri multi-colonnes avec Maj+clic.</li>
        <li>Colonnes épinglées (Référence à gauche, Actions à droite), redimensionnables, réordonnables. La colonne
          fixée à gauche se choisit avec la punaise du menu « Colonnes » (<code>referenceColumnSelectable</code>).</li>
        <li>Colonne « Livraison » masquée par défaut : bouton « Colonnes ».</li>
        <li>Rendu personnalisé (<code>cellTemplate</code>), copie de cellule, lignes urgentes mises en avant
          (<code>rowClassFn</code>).</li>
        <li>Ligne détail, menu contextuel (clic droit ou Maj+F10), sélection de lignes.</li>
        <li>Navigation clavier cellule par cellule (<code>cellNavigation</code>) : Tab entre dans la table, flèches,
          Début/Fin, Entrée ou F2 pour les boutons d'une cellule, Échap pour en sortir, Espace pour sélectionner.</li>
        <li>Regroupement (bouton « Grouper », ex. par Statut ou Client), groupes repliables, agrégats par colonne
          (<code>aggregate: 'sum'</code> sur les montants, agrégat personnalisé sur « Urgent ») et ligne de totaux.</li>
        <li>Vues sauvegardées, vue par défaut (étoile), export / import des vues.</li>
        <li>Défilement virtuel (<code>[virtualScroll]</code>) : 50 000 lignes sans pagination, seules les lignes
          visibles sont rendues.</li>
        <li>Pagination intégrée (<code>[paginator]</code>), ou paginateur personnalisé branché avec
          <code>[pageTrackingEnabled]</code>, <code>[(pageIndex)]</code>, <code>[(pageSize)]</code> et
          <code>(filteredCountChange)</code>.</li>
        <li>Export CSV ou Excel, sur une plage de pages.</li>
        <li>Densité compacte, en-tête fixe, chargement (spinner ou modèle perso), textes en anglais.</li>
        <li>50 000 lignes pour éprouver les performances.</li>
      </ul>
    </div>

    <ng-template #statutCell let-row>
      <span [class]="'statut statut--' + row.statut">{{ statutLabel(row.statut) }}</span>
    </ng-template>

    <ng-template #actionsCell let-row>
      <span class="actions">
        <button (click)="$event.stopPropagation(); lastClicked.set('Ouvrir ' + row.reference)" aria-label="Ouvrir"
                mat-icon-button type="button">
          <mat-icon>open_in_new</mat-icon>
        </button>
        <button (click)="$event.stopPropagation(); lastClicked.set('Dupliquer ' + row.reference)" aria-label="Dupliquer"
                mat-icon-button type="button">
          <mat-icon>content_copy</mat-icon>
        </button>
      </span>
    </ng-template>

    <ng-template #detailTpl let-row>
      <div class="detail">
        <strong>{{ row.reference }}</strong> — {{ row.client }}, {{ row.montant }} € HT.<br/>
        {{ row.description }}
      </div>
    </ng-template>

    <ng-template #contextMenuTpl let-row>
      <button (click)="lastClicked.set('Ouvrir ' + row.reference)" mat-menu-item type="button">
        <mat-icon>open_in_new</mat-icon> Ouvrir {{ row.reference }}
      </button>
      <button (click)="lastClicked.set('Annuler ' + row.reference)" mat-menu-item type="button">
        <mat-icon>block</mat-icon> Annuler la commande
      </button>
    </ng-template>

    <ng-template #loaderTpl>
      <span class="loader"><mat-icon>autorenew</mat-icon> Chargement des commandes…</span>
    </ng-template>
  `,
})
export class AdvancedDemoComponent {
  protected readonly rowCount = signal(200);
  protected readonly rows = computed(() => generateCommandes(this.rowCount()));
  protected readonly exportFormat = signal<NgTableExportFormat>('csv');

  protected readonly pagination = signal<'integree' | 'personnalisee' | 'virtuelle' | 'aucune'>('integree');
  protected readonly pageIndex = signal(0);
  protected readonly pageSize = signal(25);
  /** Total après filtres, fourni par ng-table : c'est lui que doit afficher un paginateur externe. */
  protected readonly filteredTotal = signal(0);
  protected readonly inlineFilters = signal(false);
  protected readonly multiSort = signal(true);
  protected readonly cellNavigation = signal(true);
  protected readonly totalsRow = signal(true);
  protected readonly grouping = signal(true);
  protected readonly groupBy = signal<string | null>(null);
  protected readonly selection = signal(false);
  protected readonly detailRows = signal(true);
  protected readonly contextMenu = signal(true);
  protected readonly columnsMenu = signal(true);
  protected readonly compact = signal(false);
  protected readonly stickyHeader = signal(false);
  protected readonly wrapDescriptions = signal(false);
  protected readonly loading = signal(false);
  protected readonly customLoader = signal(false);
  protected readonly english = signal(false);

  protected readonly settings = [
    {label: 'Filtres inline', value: this.inlineFilters},
    {label: 'Tri multi-colonnes', value: this.multiSort},
    {label: 'Navigation clavier (grille)', value: this.cellNavigation},
    {label: 'Regroupement', value: this.grouping},
    {label: 'Ligne de totaux', value: this.totalsRow},
    {label: 'Sélection', value: this.selection},
    {label: 'Ligne détail', value: this.detailRows},
    {label: 'Menu contextuel', value: this.contextMenu},
    {label: 'Bouton Colonnes', value: this.columnsMenu},
    {label: 'Densité compacte', value: this.compact},
    {label: 'En-tête fixe (60vh)', value: this.stickyHeader},
    {label: 'Descriptions sur plusieurs lignes', value: this.wrapDescriptions},
    {label: 'Chargement', value: this.loading},
    {label: 'Loader personnalisé', value: this.customLoader},
    {label: 'Textes en anglais', value: this.english},
  ];

  protected readonly selectedCount = signal(0);
  protected readonly lastClicked = signal('');
  protected readonly copied = signal('');

  protected readonly labelsEn = NG_TABLE_LABELS_EN;

  protected readonly customPaginatorCode = `<ng-table
  [pageTrackingEnabled]="true"
  [(pageIndex)]="pageIndex"
  [(pageSize)]="pageSize"
  (filteredCountChange)="filteredTotal.set($event)"
  ... />

<!-- N'importe quel composant de pagination : ici celui de la démo, sans Material -->
<app-page-bar [total]="filteredTotal()" [(pageIndex)]="pageIndex" [(pageSize)]="pageSize" />

pageIndex = signal(0);
pageSize = signal(25);
filteredTotal = signal(0);   // total APRÈS filtres : seul ng-table le connaît`;
  protected readonly rowKey = (row: Commande): string => row.id;
  protected readonly rowClass = (row: Commande) => ({'row-urgent': row.urgent});

  private readonly statutCell = viewChild<TemplateRef<unknown>>('statutCell');
  private readonly actionsCell = viewChild<TemplateRef<unknown>>('actionsCell');

  protected readonly columns = computed<NgTableColumn<Commande>[]>(() => [
    {
      id: 'reference',
      header: 'Référence',
      valueAccessor: (c) => c.reference,
      sortable: true,
      pinned: 'left',
      copy: true,
      filter: {type: 'text', operator: 'startsWith', placeholder: 'Commence par…'},
    },
    {
      id: 'client',
      header: 'Client',
      valueAccessor: (c) => c.client,
      sortable: true,
      resizable: true,
      // Options chargées à la première ouverture du filtre (simule un appel serveur).
      filter: {type: 'enum', optionsLoader: () => this.loadClients()},
    },
    {
      id: 'statut',
      header: 'Statut',
      valueAccessor: (c) => c.statut,
      sortable: true,
      cellTemplate: this.statutCell() as CellTemplate,
      searchable: (c) => STATUT_LABELS[c.statut],
      exportValueAccessor: (c) => STATUT_LABELS[c.statut],
      filter: {type: 'enum', options: STATUT_OPTIONS},
    },
    {
      id: 'montant',
      header: 'Montant HT (€)',
      valueAccessor: (c) => c.montant,
      sortable: true,
      filter: {type: 'number', placeholder: '>1000, 100..500'},
      aggregate: 'sum',
    },
    {
      id: 'ttc',
      header: 'Montant TTC (€)',
      valueAccessor: (c) => Math.round(c.montant * 120) / 100,
      sortable: true,
      filter: {type: 'numberRange'},
      aggregate: 'sum',
    },
    {id: 'dateCommande', header: 'Commande', valueAccessor: (c) => c.dateCommande, sortable: true, filter: {type: 'range'}},
    {
      id: 'livraison',
      header: 'Livraison',
      valueAccessor: (c) => addDays(c.dateCommande, 7),
      visible: false,
      sortable: true,
      filter: {type: 'date'},
    },
    {
      id: 'urgent',
      header: 'Urgent',
      valueAccessor: (c) => (c.urgent ? 'Oui' : 'Non'),
      // Nombre de commandes urgentes du groupe (agrégat personnalisé).
      aggregate: (rows) => `${rows.filter((c) => c.urgent).length} urgente(s)`,
      exportValueAccessor: (c) => c.urgent,
      filter: {type: 'boolean'},
      filterPredicate: (c, value) => String(c.urgent) === value,
    },
    {
      id: 'description',
      header: 'Description',
      valueAccessor: (c) => c.description,
      resizable: true,
      widthPx: 280,
      textOverflow: this.wrapDescriptions() ? 'wrap' : 'truncate',
    },
    {
      id: 'actions',
      header: 'Actions',
      valueAccessor: () => '',
      cellTemplate: this.actionsCell() as CellTemplate,
      pinned: 'right',
      widthPx: 120,
      exportable: false,
      searchable: false,
      mobileRowActions: true,
    },
  ]);

  constructor() {
    // Désactiver le regroupement retire aussi le regroupement en cours (le bouton disparaît).
    effect(() => {
      if (!this.grouping()) {
        this.groupBy.set(null);
      }
    });
  }

  protected statutLabel(statut: CommandeStatut): string {
    return STATUT_LABELS[statut];
  }

  protected onCopied(event: NgTableCopyEvent<Commande>): void {
    this.copied.set(event.value);
  }

  private loadClients(): Promise<NgTableFilterOption[]> {
    return new Promise((resolve) => setTimeout(() => resolve(CLIENTS.map((client) => ({value: client, label: client}))), 600));
  }
}
