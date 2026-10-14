import {ChangeDetectionStrategy, Component, computed, DestroyRef, inject, NgZone, signal, TemplateRef, viewChild} from '@angular/core';
import {MatButtonModule} from '@angular/material/button';
import {MatButtonToggleModule} from '@angular/material/button-toggle';
import {MatIconModule} from '@angular/material/icon';
import {MatSlideToggleModule} from '@angular/material/slide-toggle';
import {NgTableColumn, NgTableComponent} from '@sbourahla/ng-table';

interface Quote {
  id: number;
  symbol: string;
  sector: string;
  open: number;
  price: number;
  change: number;
  volume: number;
  bid: number;
  ask: number;
  updatedAt: string;
}

const SECTORS = ['Énergie', 'Banque', 'Santé', 'Industrie', 'Technologie', 'Luxe', 'Télécoms', 'Transport'];
const SECTOR_OPTIONS = SECTORS.map((sector) => ({value: sector, label: sector}));
/** Fréquence d'envoi du flux simulé : 50 paquets par seconde. */
const TICK_MS = 20;

const round = (value: number, decimals = 2) => Math.round(value * 10 ** decimals) / 10 ** decimals;

function makeQuote(id: number): Quote {
  const open = round(5 + ((id * 7919) % 49_500) / 100);
  return {
    id,
    symbol: `${String.fromCharCode(65 + (id % 26))}${String.fromCharCode(65 + (Math.floor(id / 26) % 26))}${id.toString(36).toUpperCase().padStart(4, '0')}`,
    sector: SECTORS[id % SECTORS.length],
    open,
    price: open,
    change: 0,
    volume: (id * 104_729) % 50_000,
    bid: round(open - 0.01),
    ask: round(open + 0.01),
    updatedAt: '',
  };
}

/**
 * Mode live : un flux de cotations simulé pousse des milliers de mises à jour par
 * seconde dans la table, par `applyTransactionAsync` (regroupées par la table, un seul
 * rendu par lot). Les compteurs mesurent ce que le navigateur tient réellement.
 */
@Component({
  selector: 'app-live-demo',
  standalone: true,
  imports: [NgTableComponent, MatButtonModule, MatButtonToggleModule, MatIconModule, MatSlideToggleModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .controls { display: flex; flex-wrap: wrap; gap: 12px 20px; align-items: center; }
    .metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 8px; margin-top: 12px; }
    .metrics div { padding: 8px 10px; background: #f5f7fa; border-radius: 8px; }
    .metrics strong { display: block; font-size: 1.15rem; color: #0d1d26; font-variant-numeric: tabular-nums; }
    .metrics span { font-size: .75rem; color: #4f6573; }
    .metrics .bad strong { color: #a3261e; }
    .up { color: #15803d; font-variant-numeric: tabular-nums; }
    .down { color: #b91c1c; font-variant-numeric: tabular-nums; }
    .num { font-variant-numeric: tabular-nums; }
  `,
  template: `
    <p class="demo-intro">
      Un flux de cotations simulé envoie des mises à jour en continu, par <code>applyTransactionAsync()</code>. La table les
      regroupe, ne refiltre et ne retrie que les lignes modifiées, ne rend que les lignes visibles (défilement virtuel), et
      surligne les cellules qui changent. Triez par variation ou filtrez un secteur pendant le flux : l'ordre se met à jour en direct.
    </p>

    <div class="demo-card">
      <h2>Flux</h2>
      <div class="controls">
        <span>
          <span class="setting-label">Instruments</span>
          <mat-button-toggle-group [value]="size()" (change)="setSize($event.value)">
            <mat-button-toggle [value]="1000">1 000</mat-button-toggle>
            <mat-button-toggle [value]="10000">10 000</mat-button-toggle>
            <mat-button-toggle [value]="100000">100 000</mat-button-toggle>
          </mat-button-toggle-group>
        </span>
        <span>
          <span class="setting-label">Mises à jour / s</span>
          <mat-button-toggle-group [value]="rate()" (change)="rate.set($event.value)">
            <mat-button-toggle [value]="100">100</mat-button-toggle>
            <mat-button-toggle [value]="1000">1 000</mat-button-toggle>
            <mat-button-toggle [value]="10000">10 000</mat-button-toggle>
            <mat-button-toggle [value]="50000">50 000</mat-button-toggle>
          </mat-button-toggle-group>
        </span>
        <button (click)="toggleRunning()" mat-flat-button type="button">
          <mat-icon>{{ running() ? 'pause' : 'play_arrow' }}</mat-icon> {{ running() ? 'Pause' : 'Reprendre' }}
        </button>
        <mat-slide-toggle [checked]="flash()" (change)="flash.set($event.checked)">Surbrillance</mat-slide-toggle>
        <mat-slide-toggle [checked]="totals()" (change)="totals.set($event.checked)">Ligne de totaux</mat-slide-toggle>
        <span>
          <span class="setting-label">Colonnes</span>
          <mat-button-toggle-group [value]="wide()" (change)="wide.set($event.value)">
            <mat-button-toggle [value]="false">8</mat-button-toggle>
            <mat-button-toggle [value]="true">108 (affichage partiel)</mat-button-toggle>
          </mat-button-toggle-group>
        </span>
      </div>
      <div class="metrics">
        <div><strong>{{ appliedPerSecond().toLocaleString('fr-FR') }}</strong><span>mises à jour appliquées / s</span></div>
        <div [class.bad]="fps() < 50"><strong>{{ fps() }}</strong><span>images / s (navigateur)</span></div>
        <div><strong>{{ flushMs() }} ms</strong><span>par lot : pipeline + rendu</span></div>
        <div><strong>{{ renderedRows() }}</strong><span>lignes rendues sur {{ size().toLocaleString('fr-FR') }}</span></div>
      </div>
    </div>

    <ng-table
      [ariaLabel]="'Cotations en direct'"
      [columns]="columns()"
      [rows]="rows()"
      [rowKeyAccessor]="rowKey"
      [virtualScroll]="true"
      [virtualColumns]="wide()"
      [maxHeight]="'65vh'"
      [density]="'compact'"
      [flashCells]="flash()"
      [flashDurationMs]="800"
      [showTotals]="totals()"
      [globalSearchEnabled]="true"
      [multiSort]="true"
      [showActiveFiltersBar]="true"
      (asyncTransactionsFlushed)="onFlushed()"
    />

    <ng-template #changeCell let-row>
      <span [class]="row.change >= 0 ? 'up' : 'down'">{{ row.change >= 0 ? '+' : '' }}{{ row.change.toFixed(2) }} %</span>
    </ng-template>
  `,
})
export class LiveDemoComponent {
  private readonly table = viewChild.required<NgTableComponent<Quote>>(NgTableComponent);
  private readonly changeCell = viewChild<TemplateRef<unknown>>('changeCell');
  private readonly zone = inject(NgZone);

  protected readonly size = signal(10_000);
  protected readonly rate = signal(10_000);
  protected readonly running = signal(true);
  protected readonly flash = signal(true);
  protected readonly totals = signal(false);
  /** 100 colonnes d'indicateurs en plus : seules celles visibles sont rendues (`[virtualColumns]`). */
  protected readonly wide = signal(false);
  protected readonly rows = signal<Quote[]>(Array.from({length: 10_000}, (_, i) => makeQuote(i)));

  protected readonly appliedPerSecond = signal(0);
  protected readonly fps = signal(0);
  protected readonly flushMs = signal(0);
  protected readonly renderedRows = signal(0);

  protected readonly rowKey = (quote: Quote) => quote.id;

  /** État courant du flux (le « serveur » de cotations), indépendant de la table. */
  private quotes: Quote[] = [...this.rows()];
  private applied = 0;
  private seed = 1;

  protected readonly columns = computed<NgTableColumn<Quote>[]>(() => [
    {id: 'symbol', header: 'Symbole', valueAccessor: (q) => q.symbol, sortable: true, pinned: 'left', filter: {type: 'text', operator: 'startsWith'}},
    {id: 'sector', header: 'Secteur', valueAccessor: (q) => q.sector, sortable: true, filter: {type: 'enum', options: SECTOR_OPTIONS}},
    {id: 'price', header: 'Cours', valueAccessor: (q) => q.price, sortable: true, filter: {type: 'number'}},
    {
      id: 'change',
      header: 'Variation',
      valueAccessor: (q) => q.change,
      sortable: true,
      cellTemplate: this.changeCell() as NgTableColumn<Quote>['cellTemplate'],
      filter: {type: 'number', placeholder: '>2, <-2'},
      aggregate: 'avg',
    },
    {id: 'bid', header: 'Achat', valueAccessor: (q) => q.bid, sortable: true},
    {id: 'ask', header: 'Vente', valueAccessor: (q) => q.ask, sortable: true},
    {id: 'volume', header: 'Volume', valueAccessor: (q) => q.volume, sortable: true, aggregate: 'sum'},
    {id: 'updatedAt', header: 'Heure', valueAccessor: (q) => q.updatedAt, flashOnChange: false},
    ...(this.wide()
      ? Array.from({length: 100}, (_, k): NgTableColumn<Quote> => ({
          id: `ind${k}`,
          header: `Indic. ${k + 1}`,
          valueAccessor: (q) => round(q.price * (1 + (k - 50) / 1000)),
          widthPx: 100,
          sortable: true,
        }))
      : []),
  ]);

  constructor() {
    const destroyRef = inject(DestroyRef);
    // Flux et mesures hors de la détection de changements : seule la table réagit, par ses signaux.
    this.zone.runOutsideAngular(() => {
      const feed = setInterval(() => this.tick(), TICK_MS);
      let frames = 0;
      let rafId = 0;
      const countFrame = () => {
        frames++;
        rafId = requestAnimationFrame(countFrame);
      };
      rafId = requestAnimationFrame(countFrame);
      const meter = setInterval(() => {
        this.fps.set(frames);
        this.appliedPerSecond.set(this.applied);
        this.renderedRows.set(document.querySelectorAll('ng-table tr.data-row').length);
        frames = 0;
        this.applied = 0;
      }, 1000);
      destroyRef.onDestroy(() => {
        clearInterval(feed);
        clearInterval(meter);
        cancelAnimationFrame(rafId);
      });
    });
  }

  protected setSize(size: number): void {
    this.size.set(size);
    const rows = Array.from({length: size}, (_, i) => makeQuote(i));
    this.quotes = [...rows];
    this.rows.set(rows);
  }

  protected toggleRunning(): void {
    this.running.update((running) => !running);
  }

  protected onFlushed(): void {
    // Du moment où la table applique le lot jusqu'à l'image suivante : pipeline + rendu.
    const started = performance.now();
    requestAnimationFrame(() => this.flushMs.set(Math.round(performance.now() - started)));
  }

  /** Un paquet du flux : `rate / 50` cotations bougent. */
  private tick(): void {
    if (!this.running()) {
      return;
    }
    const count = Math.max(1, Math.round(this.rate() / (1000 / TICK_MS)));
    const time = new Date().toLocaleTimeString('fr-FR');
    const update: Quote[] = [];
    for (let k = 0; k < count; k++) {
      const quote = this.quotes[Math.floor(this.random() * this.quotes.length)];
      const price = round(Math.max(0.5, quote.price * (1 + (this.random() - 0.5) * 0.01)));
      const next: Quote = {
        ...quote,
        price,
        change: round(((price - quote.open) / quote.open) * 100),
        bid: round(price - 0.01),
        ask: round(price + 0.01),
        volume: quote.volume + Math.floor(this.random() * 500),
        updatedAt: time,
      };
      this.quotes[quote.id] = next;
      update.push(next);
    }
    this.applied += count;
    this.table().applyTransactionAsync({update});
  }

  /** Générateur rapide et déterministe. */
  private random(): number {
    this.seed = (this.seed * 16807) % 2147483647;
    return this.seed / 2147483647;
  }
}
