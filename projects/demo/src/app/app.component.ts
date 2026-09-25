import {ChangeDetectionStrategy, Component, TemplateRef, computed, signal, viewChild} from '@angular/core';
import {MatButtonToggleModule} from '@angular/material/button-toggle';
import {MatPaginatorModule, PageEvent} from '@angular/material/paginator';
import {MatSlideToggleModule} from '@angular/material/slide-toggle';
import {NgTableColumn, NgTableComponent, NgTableExportFormat} from '@sbourahla/ng-table';
import {Commande, generateCommandes} from './demo-data';

const STATUT_LABELS: Record<Commande['statut'], string> = {
  BROUILLON: 'Brouillon',
  VALIDEE: 'Validée',
  EXPEDIEE: 'Expédiée',
  ANNULEE: 'Annulée',
};

/**
 * Banc d'essai de la lib : chaque fonctionnalité est activable depuis le panneau
 * de réglages, et la taille du jeu de données sert à éprouver les performances.
 * Importe `@sbourahla/ng-table` depuis les SOURCES (paths du tsconfig racine) :
 * une modification de la lib est visible immédiatement, sans rebuild.
 */
@Component({
  selector: 'app-root',
  standalone: true,
  imports: [NgTableComponent, MatPaginatorModule, MatSlideToggleModule, MatButtonToggleModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host { display: block; max-width: 1400px; margin: 0 auto; padding: 24px 16px; }
    h1 { margin: 0 0 4px; font-size: 1.6rem; }
    .subtitle { margin: 0 0 20px; color: #4f6573; }
    .settings { display: flex; flex-wrap: wrap; gap: 12px 24px; align-items: center; margin-bottom: 16px;
      padding: 12px 16px; background: #fff; border-radius: 12px; border: 1px solid rgba(15,23,42,.13); }
    .settings .setting-label { font-size: .85rem; color: #4f6573; margin-right: 8px; }
    .statut { display: inline-block; padding: 2px 10px; border-radius: 999px; font-size: .78rem; font-weight: 500; }
    .statut--BROUILLON { background: #eef2f6; color: #4f6573; }
    .statut--VALIDEE { background: #e3f4ea; color: #1b6b3a; }
    .statut--EXPEDIEE { background: #e3eefb; color: #1d4f91; }
    .statut--ANNULEE { background: #fdeaea; color: #a3261e; }
    .detail { padding: 8px 16px; color: #4f6573; }
    .meta { margin-top: 8px; font-size: .8rem; color: #4f6573; }
  `,
  template: `
    <h1>ng-table — démo</h1>
    <p class="subtitle">Chaque réglage ci-dessous active une fonctionnalité de la lib.</p>

    <div class="settings">
      <span>
        <span class="setting-label">Lignes</span>
        <mat-button-toggle-group [value]="rowCount()" (change)="setRowCount($event.value)">
          <mat-button-toggle [value]="50">50</mat-button-toggle>
          <mat-button-toggle [value]="5000">5 000</mat-button-toggle>
          <mat-button-toggle [value]="50000">50 000</mat-button-toggle>
        </mat-button-toggle-group>
      </span>
      <mat-slide-toggle [checked]="paginated()" (change)="paginated.set($event.checked)">Pagination</mat-slide-toggle>
      <mat-slide-toggle [checked]="inlineFilters()" (change)="inlineFilters.set($event.checked)">Filtres inline</mat-slide-toggle>
      <mat-slide-toggle [checked]="selection()" (change)="selection.set($event.checked)">Sélection</mat-slide-toggle>
      <mat-slide-toggle [checked]="columnsMenu()" (change)="columnsMenu.set($event.checked)">Bouton Colonnes</mat-slide-toggle>
      <mat-slide-toggle [checked]="loading()" (change)="loading.set($event.checked)">Chargement</mat-slide-toggle>
      <mat-slide-toggle [checked]="compact()" (change)="compact.set($event.checked)">Densité compacte</mat-slide-toggle>
      <mat-slide-toggle [checked]="stickyHeader()" (change)="stickyHeader.set($event.checked)">En-tête fixe (60vh)</mat-slide-toggle>
      <span>
        <span class="setting-label">Export</span>
        <mat-button-toggle-group [value]="exportFormat()" (change)="exportFormat.set($event.value)">
          <mat-button-toggle value="csv">CSV</mat-button-toggle>
          <mat-button-toggle value="xlsx">Excel</mat-button-toggle>
        </mat-button-toggle-group>
      </span>
    </div>

    <ng-table
      [ariaLabel]="'Liste des commandes'"
      [columns]="columns()"
      [rows]="rows()"
      [rowKeyAccessor]="rowKey"
      [loading]="loading()"
      [inlineFilters]="inlineFilters()"
      [showActiveFiltersBar]="true"
      [globalSearchEnabled]="true"
      [rowSelectionEnabled]="selection()"
      [columnsMenuEnabled]="columnsMenu()"
      [detailRowTemplate]="detailTpl"
      [detailRowAccordion]="true"
      [viewsEnabled]="true"
      [viewsStorageKey]="'demo-commandes'"
      [exportEnabled]="true"
      [exportFilename]="'commandes'"
      [exportFormat]="exportFormat()"
      [density]="compact() ? 'compact' : 'default'"
      [stickyHeader]="stickyHeader()"
      [maxHeight]="stickyHeader() ? '60vh' : null"
      [pageTrackingEnabled]="paginated()"
      [pageIndex]="pageIndex()"
      [pageSize]="pageSize()"
      (filteredCountChange)="filteredTotal.set($event)"
      (pageIndexChange)="pageIndex.set($event)"
      (viewPaginationRestore)="pageIndex.set($event.pageIndex); pageSize.set($event.pageSize)"
      (selectionChange)="selectedCount.set($event.selectedKeys.length)"
    />

    @if (paginated()) {
      <mat-paginator
        [length]="filteredTotal()"
        [pageIndex]="pageIndex()"
        [pageSize]="pageSize()"
        [pageSizeOptions]="[10, 25, 50, 100]"
        (page)="onPage($event)"
      />
    }

    <p class="meta">
      {{ rows().length }} lignes au total@if (selection()) { · {{ selectedCount() }} sélectionnée(s)}
    </p>

    <ng-template #statutCell let-row>
      <span [class]="'statut statut--' + row.statut">{{ statutLabel(row.statut) }}</span>
    </ng-template>

    <ng-template #detailTpl let-row>
      <div class="detail">{{ row.reference }} — {{ row.description }}</div>
    </ng-template>
  `,
})
export class AppComponent {
  protected readonly rowCount = signal(50);
  protected readonly rows = computed(() => generateCommandes(this.rowCount()));
  protected readonly paginated = signal(true);
  protected readonly inlineFilters = signal(false);
  protected readonly selection = signal(false);
  protected readonly columnsMenu = signal(true);
  protected readonly loading = signal(false);
  protected readonly compact = signal(false);
  protected readonly stickyHeader = signal(false);
  protected readonly exportFormat = signal<NgTableExportFormat>('csv');
  protected readonly pageIndex = signal(0);
  protected readonly pageSize = signal(10);
  protected readonly filteredTotal = signal(0);
  protected readonly selectedCount = signal(0);

  protected readonly rowKey = (row: Commande): string => row.id;

  private readonly statutCell = viewChild<TemplateRef<unknown>>('statutCell');

  protected readonly columns = computed<NgTableColumn<Commande>[]>(() => [
    {
      id: 'reference',
      header: 'Référence',
      valueAccessor: (c) => c.reference,
      sortable: true,
      copy: true,
      pinned: 'left',
      filter: {type: 'text', operator: 'startsWith', placeholder: 'Commence par…'},
    },
    {
      id: 'client',
      header: 'Client',
      valueAccessor: (c) => c.client,
      sortable: true,
      resizable: true,
      filter: {type: 'text'},
    },
    {
      id: 'statut',
      header: 'Statut',
      valueAccessor: (c) => c.statut,
      sortable: true,
      cellTemplate: this.statutCell() as NgTableColumn<Commande>['cellTemplate'],
      searchable: (c) => STATUT_LABELS[c.statut],
      filter: {
        type: 'enum',
        options: Object.entries(STATUT_LABELS).map(([value, label]) => ({value, label})),
      },
    },
    {
      id: 'montant',
      header: 'Montant (€)',
      valueAccessor: (c) => c.montant,
      sortable: true,
      filter: {type: 'number', placeholder: '>1000, 100..500'},
    },
    {
      id: 'montantPlage',
      header: 'Montant (plage)',
      valueAccessor: (c) => c.montant,
      exportable: false,
      filter: {type: 'numberRange'},
    },
    {
      id: 'dateCommande',
      header: 'Date',
      valueAccessor: (c) => c.dateCommande,
      sortable: true,
      filter: {type: 'range'},
    },
    {
      id: 'urgent',
      header: 'Urgent',
      valueAccessor: (c) => (c.urgent ? 'Oui' : 'Non'),
      filter: {type: 'boolean'},
      filterPredicate: (c, value) => String(c.urgent) === value,
      exportValueAccessor: (c) => c.urgent,
    },
    {
      id: 'description',
      header: 'Description très détaillée de la commande',
      valueAccessor: (c) => c.description,
      resizable: true,
      widthPx: 260,
    },
  ]);

  protected statutLabel(statut: Commande['statut']): string {
    return STATUT_LABELS[statut];
  }

  protected setRowCount(count: number): void {
    this.rowCount.set(count);
    this.pageIndex.set(0);
  }

  protected onPage(event: PageEvent): void {
    this.pageIndex.set(event.pageIndex);
    this.pageSize.set(event.pageSize);
  }
}
