import {JsonPipe} from '@angular/common';
import {afterNextRender, ChangeDetectionStrategy, Component, computed, inject, Injector, signal, TemplateRef, viewChild} from '@angular/core';
import {MatButtonToggleModule} from '@angular/material/button-toggle';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {MatSlideToggleModule} from '@angular/material/slide-toggle';
import {
  NG_TABLE_LABELS_EN,
  NgTableColumn,
  NgTableComponent,
  NgTableGroupSummary,
  NgTableQueryState,
  NgTableRemoteQuery,
  NgTableViewsStore,
} from '@sbourahla/ng-table';
import {CLIENTS, Commande, CommandeStatut, STATUT_LABELS, STATUT_OPTIONS} from './demo-data';
import {CommandesBackend, FakeCommandesApi} from './fake-commandes-api';
import {SpringCommandesApi} from './spring-commandes-api';
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
  imports: [NgTableComponent, JsonPipe, MatButtonModule, MatButtonToggleModule, MatIconModule, MatSlideToggleModule],
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
    .server--error { color: #b3261e; font-weight: 600; }
    .perf { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 8px; margin-top: 10px; }
    .perf div { padding: 8px 10px; background: #f5f7fa; border-radius: 8px; }
    .perf strong { display: block; font-size: 1.1rem; color: #0d1d26; }
    .perf span { font-size: .75rem; color: #4f6573; }
  `,
  template: `
    <p class="demo-intro">
      Les données viennent d'un serveur : simulé dans le navigateur (jusqu'à 1 000 000 de commandes, 150 ms de latence), ou le
      vrai backend Spring Boot de <code>examples/spring-boot-backend</code>. ng-table n'affiche que la page reçue et
      émet <code>(remoteQueryChange)</code> à chaque tri, filtre, recherche ou page. L'état (filtres, colonnes, ordre,
      sélection, page, vues) est tenu par le parent (mode contrôlé), et chaque événement est journalisé à droite.
    </p>

    <div class="demo-card">
      <h2>Serveur et performance</h2>
      <div class="actions-row">
        <span class="setting-label">Serveur</span>
        <mat-button-toggle-group [value]="backend()" (change)="setBackend($event.value)">
          <mat-button-toggle value="fake">Simulé (navigateur)</mat-button-toggle>
          <mat-button-toggle value="spring">Spring Boot (localhost:8080)</mat-button-toggle>
        </mat-button-toggle-group>
      </div>
      <div class="actions-row">
        <span class="setting-label">Commandes côté serveur</span>
        <mat-button-toggle-group [disabled]="backend() === 'spring'" [value]="datasetSize()" (change)="setDatasetSize($event.value)">
          <mat-button-toggle [value]="2000">2 000</mat-button-toggle>
          <mat-button-toggle [value]="100000">100 000</mat-button-toggle>
          <mat-button-toggle [value]="1000000">1 000 000</mat-button-toggle>
        </mat-button-toggle-group>
        @if (backend() === 'spring') {
          <span class="server">Fixé par <code>demo.commandes.count</code> (100 000 par défaut) dans le backend.</span>
        }
      </div>
      <div class="perf">
        <div><strong>{{ total().toLocaleString('fr-FR') }}</strong><span>lignes correspondantes côté serveur</span></div>
        <div><strong>{{ renderedRows() }}</strong><span>lignes rendues dans la table</span></div>
        <div><strong>{{ lastServerMs() }} ms</strong><span>{{ backend() === 'spring' ? 'aller-retour HTTP (Spring Boot + H2)' : 'calcul serveur (filtre, tri, résumés)' }}</span></div>
        <div><strong>{{ lastRenderMs() }} ms</strong><span>rendu de la table (réponse → écran)</span></div>
      </div>
    </div>

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
        <mat-slide-toggle [checked]="grouping()" (change)="setGrouping($event.checked)">Regroupement (côté serveur)</mat-slide-toggle>
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
          [groupingEnabled]="grouping()"
          [(groupBy)]="groupBy"
          [groupSummaries]="groupSummaries()"
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
        <p [class.server--error]="serverError()" class="demo-meta server">{{ serverStatus() }}</p>
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
        <li>Regroupement côté serveur : <code>groupBy</code> part dans la requête, le serveur trie par groupe et renvoie le
          compte et la somme de chaque groupe (<code>[groupSummaries]</code>), calculés sur tout le groupe et pas sur la page.
          Les groupes se replient : <code>collapsedGroups</code> part dans la requête et le serveur exclut leurs lignes.</li>
        <li>Vrai backend au choix : Spring Boot + JPA (<code>examples/spring-boot-backend</code>), appelé par
          <code>fetch</code> via le proxy <code>/api</code> de <code>npm start</code>.</li>
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
  private api: CommandesBackend = new FakeCommandesApi(2000);
  protected readonly backend = signal<'fake' | 'spring'>('fake');
  protected readonly serverError = signal(false);
  private readonly injector = inject(Injector);
  private lastQuery: NgTableRemoteQuery = {sort: {columnId: '', direction: ''}, sorts: [], filters: {}, search: '', page: {index: 0, size: 20}};
  protected readonly datasetSize = signal(2000);
  protected readonly lastServerMs = signal(0);
  protected readonly lastRenderMs = signal(0);
  protected readonly renderedRows = computed(() => this.rows().length);
  private requestId = 0;
  private logId = 0;

  protected readonly rows = signal<Commande[]>([]);
  protected readonly total = signal(0);
  protected readonly loading = signal(false);
  protected readonly serverStatus = signal('');
  protected readonly english = signal(false);
  protected readonly labelsEn = NG_TABLE_LABELS_EN;
  protected readonly grouping = signal(false);
  protected readonly groupBy = signal<string | null>(null);
  protected readonly groupSummaries = signal<NgTableGroupSummary[] | null>(null);

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
    // `groupable` explicite : mêmes colonnes que côté serveur (`NgTableColumn.groupable()` en Java).
    {id: 'reference', header: 'Référence', valueAccessor: (c) => c.reference, sortable: true, groupable: false, filter: {type: 'text'}},
    {
      id: 'client',
      header: 'Client',
      valueAccessor: (c) => c.client,
      sortable: true,
      groupable: true,
      filter: {type: 'enum', options: CLIENTS.map((client) => ({value: client, label: client}))},
    },
    {
      id: 'statut',
      header: 'Statut',
      valueAccessor: (c) => c.statut,
      sortable: true,
      groupable: true,
      cellTemplate: this.statutCell() as CellTemplate,
      filter: {type: 'enum', options: STATUT_OPTIONS},
    },
    {
      id: 'montant',
      header: 'Montant (€)',
      valueAccessor: (c) => c.montant,
      sortable: true,
      groupable: false,
      aggregate: 'sum', // somme calculée par le serveur (groupSummaries)
      filter: {type: 'numberRange', label: 'Tranche de montant', component: MontantPresetFilterComponent},
    },
    {id: 'dateCommande', header: 'Date', valueAccessor: (c) => c.dateCommande, sortable: true, groupable: true, filter: {type: 'range'}},
    {
      id: 'urgent',
      header: 'Urgent',
      valueAccessor: (c) => (c.urgent ? 'Oui' : 'Non'),
      // Pas regroupable : la table regrouperait sur « Oui » / « Non », le serveur sur true / false.
      groupable: false,
      filter: {type: 'boolean'},
    },
    {id: 'description', header: 'Description', valueAccessor: (c) => c.description, widthPx: 260},
  ]);

  constructor() {
    // Premier chargement : ng-table n'émet `remoteQueryChange` qu'au premier changement.
    void this.load(this.lastQuery);
  }

  /** Change la taille de la « base » du serveur et recharge la même requête. */
  protected setDatasetSize(size: number): void {
    this.datasetSize.set(size);
    this.switchApi(new FakeCommandesApi(size));
  }

  /** Serveur simulé dans le navigateur, ou vrai backend Spring Boot. */
  protected setBackend(backend: 'fake' | 'spring'): void {
    this.backend.set(backend);
    this.switchApi(backend === 'spring' ? new SpringCommandesApi() : new FakeCommandesApi(this.datasetSize()));
  }

  /** Recharge la même requête (page 1) sur un autre serveur. */
  private switchApi(api: CommandesBackend): void {
    this.api = api;
    void this.load({...this.lastQuery, page: {...this.lastQuery.page, index: 0}});
    this.table().applyQueryState({pageIndex: 0});
  }

  protected async load(query: NgTableRemoteQuery): Promise<void> {
    this.log('remoteQueryChange', query);
    this.lastQuery = query;
    const id = ++this.requestId;
    this.loading.set(true);
    let page;
    try {
      page = await this.api.query(query);
    } catch (error) {
      if (id === this.requestId) {
        this.showServerError(error);
      }
      return;
    }
    if (id !== this.requestId) {
      return; // une requête plus récente est partie entre-temps : réponse obsolète
    }
    this.serverError.set(false);
    // Temps de rendu de la table : de la réception de la page à l'écran mis à jour.
    const received = performance.now();
    this.rows.set(page.rows);
    this.total.set(page.total);
    this.groupSummaries.set(page.groupSummaries);
    this.loading.set(false);
    afterNextRender(() => this.lastRenderMs.set(Math.round(performance.now() - received)), {injector: this.injector});
    this.lastServerMs.set(Math.round(page.serverMs));
    this.serverStatus.set(`Serveur : ${page.total.toLocaleString('fr-FR')} commande(s) correspondent, page ${query.page.index + 1} reçue.`);
  }

  protected async exportOnServer(query: NgTableRemoteQuery): Promise<void> {
    this.log('remoteExportRequested', query);
    try {
      const count = await this.api.count(query);
      this.serverStatus.set(`Export lancé côté serveur : ${count} ligne(s), toutes pages confondues.`);
    } catch (error) {
      this.showServerError(error);
    }
  }

  private showServerError(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    this.loading.set(false);
    this.rows.set([]);
    this.total.set(0);
    this.groupSummaries.set(null);
    this.serverError.set(true);
    this.serverStatus.set(this.backend() === 'spring'
      ? `Erreur du serveur : ${message}. Lancez le backend : cd examples/spring-boot-backend puis ./mvnw spring-boot:run (mvnw.cmd sous Windows).`
      : `Erreur du serveur : ${message}.`);
    this.log('erreur serveur', message);
  }

  protected saveViews(store: NgTableViewsStore): void {
    this.viewsStore.set(store);
    this.log('viewsStoreChange', `${store.views.length} vue(s), active : ${store.activeViewId ?? 'aucune'}`);
  }

  protected setGrouping(enabled: boolean): void {
    this.grouping.set(enabled);
    this.groupBy.set(enabled ? 'statut' : null); // un regroupement par défaut pour voir tout de suite l'effet
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
