import {JsonPipe} from '@angular/common';
import {ChangeDetectionStrategy, Component, computed, signal, TemplateRef, viewChild} from '@angular/core';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {MatSlideToggleModule} from '@angular/material/slide-toggle';
import {
  NG_TABLE_LABELS_EN,
  NgTableColumn,
  NgTableComponent,
  NgTableQueryState,
  NgTableRemoteQuery,
  NgTableViewsStore,
} from '@sbourahla/ng-table';
import {CLIENTS, Commande, CommandeStatut, STATUT_LABELS, STATUT_OPTIONS} from './demo-data';
import {FakeCommandesApi} from './fake-commandes-api';
import {MontantPresetFilterComponent} from './montant-preset-filter.component';

interface LogEntry {
  id: number;
  time: string;
  event: string;
  detail: string;
}

type CellTemplate = NgTableColumn<Commande>['cellTemplate'];

/**
 * Mode expert : données côté serveur (`dataMode='remote'`), état entièrement
 * contrôlé par le parent, filtre personnalisé, API programmatique, et journal de
 * tous les événements émis par ng-table.
 */
@Component({
  selector: 'app-expert-demo',
  standalone: true,
  imports: [NgTableComponent, JsonPipe, MatButtonModule, MatIconModule, MatSlideToggleModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .layout { display: grid; grid-template-columns: minmax(0, 1fr) 340px; gap: 16px; align-items: start; }
    @media (max-width: 1100px) { .layout { grid-template-columns: minmax(0, 1fr); } }
    .actions-row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
    .log { margin: 0; padding: 0; list-style: none; max-height: 360px; overflow: auto; font-size: .75rem; }
    .log li { padding: 4px 0; border-bottom: 1px solid rgba(15, 23, 42, .08); }
    .log .event { font-weight: 600; color: #1d4f91; }
    .log .time { color: #8a99a6; margin-right: 6px; }
    .log .detail { display: block; color: #4f6573; word-break: break-all; }
    .state { margin: 0; font-size: .72rem; max-height: 220px; overflow: auto; background: #f5f7fa; padding: 8px; border-radius: 8px; }
    .server { font-size: .8rem; color: #4f6573; }
  `,
  template: `
    <p class="demo-intro">
      Les données viennent d'un faux serveur (2 000 commandes, 450 ms de latence) : ng-table n'affiche que la page reçue et
      émet <code>(remoteQueryChange)</code> à chaque tri, filtre, recherche ou page. L'état (filtres, colonnes, ordre,
      sélection, page, vues) est tenu par le parent (mode contrôlé), et chaque événement est journalisé à droite.
    </p>

    <div class="demo-card">
      <h2>API programmatique</h2>
      <div class="actions-row">
        <button (click)="applyPreset()" mat-stroked-button type="button">
          <mat-icon>bolt</mat-icon> Urgentes validées, par montant décroissant
        </button>
        <button (click)="table().applyQueryState({sorts: [], filters: {}, search: ''})" mat-stroked-button type="button">
          <mat-icon>restart_alt</mat-icon> Réinitialiser (applyQueryState)
        </button>
        <button (click)="toggleDescription()" mat-stroked-button type="button">
          <mat-icon>view_column</mat-icon> {{ columnVisibility()['description'] === false ? 'Afficher' : 'Masquer' }} « Description »
        </button>
        <button (click)="selectedKeys.set([])" [disabled]="selectedKeys().length === 0" mat-stroked-button type="button">
          <mat-icon>deselect</mat-icon> Vider la sélection ({{ selectedKeys().length }})
        </button>
        <mat-slide-toggle [checked]="english()" (change)="english.set($event.checked)">Textes en anglais</mat-slide-toggle>
      </div>
    </div>

    <div class="layout">
      <div>
        <ng-table
          [ariaLabel]="'Commandes (mode expert, données serveur)'"
          [dataMode]="'remote'"
          [columns]="columns()"
          [rows]="rows()"
          [loading]="loading()"
          [rowKeyAccessor]="rowKey"
          [labels]="english() ? labelsEn : {}"
          [globalSearchEnabled]="true"
          [multiSort]="true"
          [showActiveFiltersBar]="true"
          [paginator]="true"
          [totalCount]="total()"
          [(pageIndex)]="pageIndex"
          [(pageSize)]="pageSize"
          [pageSizeOptions]="[10, 20, 50]"
          [filters]="filters()"
          (filtersChange)="filters.set($event); log('filtersChange', $event)"
          [columnVisibility]="columnVisibility()"
          (columnVisibilityChange)="columnVisibility.set($event); log('columnVisibilityChange', $event)"
          [columnOrder]="columnOrder()"
          (columnOrderChange)="columnOrder.set($event); log('columnOrderChange', $event)"
          [rowSelectionEnabled]="true"
          [selectedRowKeys]="selectedKeys()"
          (selectionChange)="selectedKeys.set($event.selectedKeys); log('selectionChange', $event.selectedKeys.length + ' ligne(s)')"
          [viewsEnabled]="true"
          [viewsStore]="viewsStore()"
          (viewsStoreChange)="saveViews($event)"
          (viewActivated)="log('viewActivated', $event?.name ?? null)"
          [exportEnabled]="true"
          [exportMode]="'remote'"
          (remoteExportRequested)="exportOnServer($event)"
          [detailRowTemplate]="detailTpl"
          (remoteQueryChange)="load($event)"
          (queryStateChange)="queryState.set($event)"
          (sortsChange)="log('sortsChange', $event)"
          (globalSearchChange)="log('globalSearchChange', $event)"
          (pageIndexChange)="log('pageIndexChange', $event)"
          (rowClick)="log('rowClick', $event.reference)"
        />
        <p class="demo-meta server">{{ serverStatus() }}</p>
      </div>

      <aside>
        <div class="demo-card">
          <h2>État « requête » (queryStateChange)</h2>
          <pre class="state">{{ queryState() | json }}</pre>
        </div>
        <div class="demo-card">
          <h2>Journal des événements</h2>
          <ul class="log">
            @for (entry of logEntries(); track entry.id) {
              <li><span class="time">{{ entry.time }}</span><span class="event">{{ entry.event }}</span>
                <span class="detail">{{ entry.detail }}</span></li>
            } @empty {
              <li>Interagissez avec la table…</li>
            }
          </ul>
        </div>
      </aside>
    </div>

    <div class="demo-card">
      <h2>Ce que montre ce mode</h2>
      <ul class="demo-features">
        <li><code>dataMode='remote'</code> : tri (multi-colonnes), filtres, recherche et page envoyés au serveur en une
          requête ; réponses obsolètes ignorées.</li>
        <li>Paginateur intégré en remote : <code>[totalCount]</code>, <code>[(pageIndex)]</code>, <code>[(pageSize)]</code>.</li>
        <li>Mode contrôlé : <code>[filters]</code>, <code>[columnVisibility]</code>, <code>[columnOrder]</code>,
          <code>[selectedRowKeys]</code>, <code>[viewsStore]</code> (vues « enregistrées côté serveur »).</li>
        <li>Filtre 100 % personnalisé sur « Montant » (<code>filter.component</code>).</li>
        <li><code>applyQueryState()</code> / <code>getQueryState()</code> pilotés par des boutons.</li>
        <li>Export généré côté serveur (<code>exportMode='remote'</code>).</li>
        <li>Textes traduits via <code>[labels]</code> (<code>NG_TABLE_LABELS_EN</code>).</li>
        <li>En test : <code>NgTableHarness</code> (<code>&#64;sbourahla/ng-table/testing</code>) pilote cette table comme
          un utilisateur.</li>
      </ul>
    </div>

    <ng-template #statutCell let-row>
      <span [class]="'statut statut--' + row.statut">{{ statutLabel(row.statut) }}</span>
    </ng-template>

    <ng-template #detailTpl let-row>
      <div style="padding: 8px 16px; color: #4f6573">{{ row.description }}</div>
    </ng-template>
  `,
})
export class ExpertDemoComponent {
  protected readonly table = viewChild.required<NgTableComponent<Commande>>(NgTableComponent);
  private readonly api = new FakeCommandesApi();
  private requestId = 0;
  private logId = 0;

  protected readonly rows = signal<Commande[]>([]);
  protected readonly total = signal(0);
  protected readonly loading = signal(false);
  protected readonly serverStatus = signal('');
  protected readonly english = signal(false);
  protected readonly labelsEn = NG_TABLE_LABELS_EN;

  // État tenu par le parent (mode contrôlé).
  protected readonly pageIndex = signal(0);
  protected readonly pageSize = signal(20);
  protected readonly filters = signal<Record<string, string>>({});
  protected readonly columnVisibility = signal<Record<string, boolean>>({});
  protected readonly columnOrder = signal<string[]>([]);
  protected readonly selectedKeys = signal<unknown[]>([]);
  /** Tient lieu de stockage serveur des vues (le composant n'écrit rien en localStorage). */
  protected readonly viewsStore = signal<NgTableViewsStore>({views: [], activeViewId: null});

  protected readonly queryState = signal<NgTableQueryState | null>(null);
  protected readonly logEntries = signal<LogEntry[]>([]);

  protected readonly rowKey = (row: Commande): string => row.id;
  private readonly statutCell = viewChild<TemplateRef<unknown>>('statutCell');

  protected readonly columns = computed<NgTableColumn<Commande>[]>(() => [
    {id: 'reference', header: 'Référence', valueAccessor: (c) => c.reference, sortable: true, filter: {type: 'text'}},
    {
      id: 'client',
      header: 'Client',
      valueAccessor: (c) => c.client,
      sortable: true,
      filter: {type: 'enum', options: CLIENTS.map((client) => ({value: client, label: client}))},
    },
    {
      id: 'statut',
      header: 'Statut',
      valueAccessor: (c) => c.statut,
      sortable: true,
      cellTemplate: this.statutCell() as CellTemplate,
      filter: {type: 'enum', options: STATUT_OPTIONS},
    },
    {
      id: 'montant',
      header: 'Montant (€)',
      valueAccessor: (c) => c.montant,
      sortable: true,
      filter: {type: 'numberRange', label: 'Tranche de montant', component: MontantPresetFilterComponent},
    },
    {id: 'dateCommande', header: 'Date', valueAccessor: (c) => c.dateCommande, sortable: true, filter: {type: 'range'}},
    {
      id: 'urgent',
      header: 'Urgent',
      valueAccessor: (c) => (c.urgent ? 'Oui' : 'Non'),
      filter: {type: 'boolean'},
    },
    {id: 'description', header: 'Description', valueAccessor: (c) => c.description, widthPx: 260},
  ]);

  constructor() {
    // Premier chargement : ng-table n'émet `remoteQueryChange` qu'au premier changement.
    void this.load({sort: {columnId: '', direction: ''}, sorts: [], filters: {}, search: '', page: {index: 0, size: 20}});
  }

  protected async load(query: NgTableRemoteQuery): Promise<void> {
    this.log('remoteQueryChange', query);
    const id = ++this.requestId;
    this.loading.set(true);
    const page = await this.api.query(query);
    if (id !== this.requestId) {
      return; // une requête plus récente est partie entre-temps : réponse obsolète
    }
    this.rows.set(page.rows);
    this.total.set(page.total);
    this.loading.set(false);
    this.serverStatus.set(`Serveur : ${page.total} commande(s) correspondent, page ${query.page.index + 1} reçue.`);
  }

  protected exportOnServer(query: NgTableRemoteQuery): void {
    this.log('remoteExportRequested', query);
    this.serverStatus.set(`Export lancé côté serveur : ${this.api.count(query)} ligne(s), toutes pages confondues.`);
  }

  protected saveViews(store: NgTableViewsStore): void {
    this.viewsStore.set(store);
    this.log('viewsStoreChange', `${store.views.length} vue(s), active : ${store.activeViewId ?? 'aucune'}`);
  }

  protected applyPreset(): void {
    this.table().applyQueryState({
      sorts: [{columnId: 'montant', direction: 'desc'}],
      filters: {statut: 'VALIDEE', urgent: 'true'},
      search: '',
    });
  }

  protected toggleDescription(): void {
    const visible = this.columnVisibility()['description'] !== false;
    this.columnVisibility.update((current) => ({...current, description: !visible}));
  }

  protected statutLabel(statut: CommandeStatut): string {
    return STATUT_LABELS[statut];
  }

  protected log(event: string, detail: unknown): void {
    const time = new Date().toLocaleTimeString('fr-FR');
    const text = typeof detail === 'string' ? detail : JSON.stringify(detail);
    this.logEntries.update((entries) => [{id: ++this.logId, time, event, detail: text}, ...entries].slice(0, 40));
  }
}
