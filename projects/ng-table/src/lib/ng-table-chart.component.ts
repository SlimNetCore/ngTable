import {ChangeDetectionStrategy, Component, computed, effect, input, output, signal, ViewEncapsulation} from '@angular/core';
import {NgTableTheme} from './theme';
import {isFullRange, panRange, rangeFromBrush, ViewRange, zoomRange} from './chart-zoom';
import {buildChartLayout, formatAxisNumber, NgTableChartData, NgTableChartType} from './chart';

export interface ZoomLabels {
  toolbar: string;
  zoomIn: string;
  zoomOut: string;
  left: string;
  right: string;
  reset: string;
  decimated: string;
}

const ZOOM_LABELS_FR: ZoomLabels = {
  toolbar: 'Zoom du graphique',
  zoomIn: 'Zoomer',
  zoomOut: 'Dézoomer',
  left: 'Vers la gauche',
  right: 'Vers la droite',
  reset: 'Tout',
  decimated: 'Points écartés pour rester lisible : zoomez pour tout voir',
};

/**
 * Graphique en SVG, sans dépendance : barres, courbes, zones, secteurs ou anneau. S'alimente
 * d'une plage de cellules de `ng-table` (`rangeChartData()`), ou de vos propres séries.
 *
 * ```html
 * <ng-table #table [rangeSelection]="true" ... />
 * <ng-table-chart [data]="table.rangeChartData()" type="bar" title="Montants" />
 * ```
 *
 * Les couleurs viennent des variables CSS `--ngt-chart-1` à `--ngt-chart-8`. Chaque forme a une
 * infobulle (`<title>`), et un tableau masqué reprend les données pour les lecteurs d'écran.
 */
@Component({
  selector: 'ng-table-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  template: `
    @if (data(); as chart) {
      <figure class="ngt-chart">
        @if (title()) {
          <figcaption class="ngt-chart__title">{{ title() }}</figcaption>
        }
        @if (canZoom()) {
          <div class="ngt-chart__toolbar" role="toolbar" [attr.aria-label]="zoomLabels().toolbar">
            <button (click)="zoomBy(0.5)" [attr.aria-label]="zoomLabels().zoomIn" [title]="zoomLabels().zoomIn" type="button">+</button>
            <button (click)="zoomBy(2)" [attr.aria-label]="zoomLabels().zoomOut" [disabled]="!zoomed()" [title]="zoomLabels().zoomOut" type="button">−</button>
            <button (click)="pan(-0.25)" [attr.aria-label]="zoomLabels().left" [disabled]="!zoomed()" [title]="zoomLabels().left" type="button">◀</button>
            <button (click)="pan(0.25)" [attr.aria-label]="zoomLabels().right" [disabled]="!zoomed()" [title]="zoomLabels().right" type="button">▶</button>
            <button (click)="resetZoom()" [disabled]="!zoomed()" type="button">{{ zoomLabels().reset }}</button>
            <span class="ngt-chart__window">{{ layout().window.start + 1 }}–{{ layout().window.end }} / {{ layout().total }}</span>
            @if (layout().decimated) {
              <span class="ngt-chart__window" [title]="zoomLabels().decimated">≈</span>
            }
          </div>
        }
        <svg (dblclick)="resetZoom()" (keydown)="onKeydown($event)" (pointerdown)="onPointerDown($event)" (pointermove)="onPointerMove($event)"
             (pointerup)="onPointerUp($event)" (wheel)="onWheel($event)" [attr.aria-label]="summary()"
             [attr.tabindex]="canZoom() ? 0 : null" [attr.viewBox]="'0 0 ' + layout().width + ' ' + layout().height"
             [class.ngt-chart__svg--zoomable]="canZoom()" class="ngt-chart__svg" role="img">
          @for (tick of layout().yTicks; track tick.value) {
            <line [attr.x1]="layout().plot.left" [attr.x2]="layout().plot.right" [attr.y1]="tick.y" [attr.y2]="tick.y"
                  class="ngt-chart__grid"/>
            <text [attr.x]="layout().plot.left - 6" [attr.y]="tick.y + 4" class="ngt-chart__axis-label" text-anchor="end">
              {{ axisNumber(tick.value) }}
            </text>
          }
          @for (label of layout().xLabels; track label.x) {
            <text [attr.x]="label.x" [attr.y]="layout().plot.bottom + 18" class="ngt-chart__axis-label" text-anchor="middle">
              {{ shorten(label.text) }}
            </text>
          }

          @for (bar of layout().bars; track $index) {
            <rect [attr.height]="bar.height" [attr.width]="bar.width" [attr.x]="bar.x" [attr.y]="bar.y"
                  [class.ngt-chart__shape--dim]="dimmed(bar.series)" [style.fill]="color(bar.series)" class="ngt-chart__shape"
                  rx="2">
              <title>{{ chart.series[bar.series].name }} — {{ chart.categories[bar.category] }} : {{ number(bar.value) }}</title>
            </rect>
          }

          @for (line of layout().lines; track line.series) {
            @if (line.area) {
              <path [attr.d]="line.area" [style.fill]="color(line.series)" class="ngt-chart__area"/>
            }
            <path [attr.d]="line.path" [class.ngt-chart__shape--dim]="dimmed(line.series)" [style.stroke]="color(line.series)"
                  class="ngt-chart__line"/>
            @for (point of line.points; track point.category) {
              <circle [attr.cx]="point.x" [attr.cy]="point.y" [style.fill]="color(line.series)" class="ngt-chart__point" r="3.5">
                <title>{{ chart.series[line.series].name }} — {{ chart.categories[point.category] }} : {{ number(point.value) }}</title>
              </circle>
            }
          }

          @for (slice of layout().slices; track slice.index) {
            <path [attr.d]="slice.path" [style.fill]="color(slice.index)" class="ngt-chart__shape ngt-chart__slice" fill-rule="evenodd">
              <title>{{ chart.categories[slice.index] }} : {{ number(slice.value) }} ({{ percent(slice.share) }})</title>
            </path>
          }

          @if (brush(); as selection) {
            <rect [attr.height]="layout().plot.bottom - layout().plot.top" [attr.width]="selection.width" [attr.x]="selection.x"
                  [attr.y]="layout().plot.top" class="ngt-chart__brush"/>
          }

          @if (!isPie()) {
            <line [attr.x1]="layout().plot.left" [attr.x2]="layout().plot.right" [attr.y1]="layout().zeroY" [attr.y2]="layout().zeroY"
                  class="ngt-chart__axis"/>
          }
        </svg>

        <ul class="ngt-chart__legend">
          @for (item of legend(); track $index) {
            <li (mouseenter)="highlight.set($index)" (mouseleave)="highlight.set(null)" class="ngt-chart__legend-item">
              <span [style.background]="color($index)" class="ngt-chart__swatch"></span>{{ item }}
            </li>
          }
        </ul>

        <table class="ngt-chart__data">
          <caption>{{ title() || summary() }}</caption>
          <thead>
            <tr>
              <th scope="col"></th>
              @for (series of chart.series; track $index) {
                <th scope="col">{{ series.name }}</th>
              }
            </tr>
          </thead>
          <tbody>
            @for (category of chart.categories; track $index; let row = $index) {
              <tr>
                <th scope="row">{{ category }}</th>
                @for (series of chart.series; track $index) {
                  <td>{{ series.values[row] === null ? '' : number(series.values[row]!) }}</td>
                }
              </tr>
            }
          </tbody>
        </table>
      </figure>
    }
  `,
  host: {'[attr.data-ngt-theme]': 'theme()'},
  styleUrl: './theme.css',
  styles: [
    `
    ng-table-chart {
      display: block;
      --ngt-chart-1: #3a7ca5;
      --ngt-chart-2: #e07a3f;
      --ngt-chart-3: #5fa36b;
      --ngt-chart-4: #b5527e;
      --ngt-chart-5: #8a6fd1;
      --ngt-chart-6: #d1a83f;
      --ngt-chart-7: #3fa7a0;
      --ngt-chart-8: #8c8c8c;
    }

    .ngt-chart {
      position: relative;
      margin: 0;
    }

    .ngt-chart__title {
      margin-bottom: 4px;
      font-weight: 600;
    }

    .ngt-chart__svg {
      display: block;
      width: 100%;
      height: auto;
      overflow: visible;
    }

    .ngt-chart__grid {
      stroke: var(--ngt-border, var(--app-border, rgba(15, 23, 42, 0.13)));
      stroke-width: 1;
    }

    .ngt-chart__axis {
      stroke: var(--ngt-text-muted, var(--app-text-muted, #475569));
      stroke-width: 1;
    }

    .ngt-chart__axis-label {
      fill: var(--ngt-text-muted, var(--app-text-muted, #475569));
      font-size: 11px;
    }

    .ngt-chart__shape {
      transition: opacity 120ms;
    }

    .ngt-chart__shape:hover {
      opacity: 0.8;
    }

    .ngt-chart__shape--dim {
      opacity: 0.25;
    }

    .ngt-chart__slice {
      stroke: var(--ngt-surface, var(--app-surface, #fff));
      stroke-width: 1.5;
    }

    .ngt-chart__line {
      fill: none;
      stroke-width: 2.5;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    .ngt-chart__area {
      opacity: 0.16;
    }

    .ngt-chart__point {
      stroke: var(--ngt-surface, var(--app-surface, #fff));
      stroke-width: 1.5;
    }

    .ngt-chart__legend {
      display: flex;
      flex-wrap: wrap;
      gap: 4px 16px;
      margin: 8px 0 0;
      padding: 0;
      font-size: 0.8125rem;
      list-style: none;
    }

    .ngt-chart__legend-item {
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }

    .ngt-chart__swatch {
      width: 10px;
      height: 10px;
      border-radius: 2px;
    }

    .ngt-chart__toolbar {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      align-items: center;
      margin-bottom: 4px;
    }

    .ngt-chart__toolbar button {
      min-width: 28px;
      padding: 2px 8px;
      border: 1px solid var(--ngt-border, var(--app-border, rgba(15, 23, 42, 0.25)));
      border-radius: 6px;
      background: var(--ngt-surface, var(--app-surface, #fff));
      color: inherit;
      font: inherit;
      cursor: pointer;
    }

    .ngt-chart__toolbar button:disabled {
      opacity: 0.4;
      cursor: default;
    }

    .ngt-chart__window {
      margin-left: 6px;
      color: var(--ngt-text-muted, var(--app-text-muted, #475569));
      font-size: 0.75rem;
    }

    .ngt-chart__svg--zoomable {
      cursor: crosshair;
      touch-action: pan-y;
    }

    .ngt-chart__brush {
      fill: var(--ngt-primary, var(--app-primary, #3a7ca5));
      fill-opacity: 0.18;
      stroke: var(--ngt-primary, var(--app-primary, #3a7ca5));
      pointer-events: none;
    }

    .ngt-chart__data {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip: rect(0 0 0 0);
      white-space: nowrap;
    }
  `,
  ],
})
export class NgTableChartComponent {
  readonly data = input<NgTableChartData | null>(null);
  /** `'dark'`, `'light'`, `'auto'`, ou `null` (jetons de l'application). */
  readonly theme = input<NgTableTheme | null>(null);
  readonly type = input<NgTableChartType>('bar');
  readonly title = input('');
  /** Hauteur du cadre ; la largeur suit le conteneur (le tracé se met à l'échelle). */
  readonly height = input(320);

  /** Zoom : sélection à la souris, Ctrl + molette, boutons ou clavier (+, −, flèches, Origine). Barres, courbes et zones. */
  readonly zoomable = input(true);
  /** Points ou barres dessinés au plus par série ; au-delà, les pics et creux sont gardés et le reste écarté. */
  readonly maxPoints = input(600);
  /** Textes de la barre de zoom. */
  readonly zoomTexts = input<Partial<ZoomLabels>>({});
  /** La fenêtre visible a changé (`null` : tout le graphique). */
  readonly zoomChange = output<ViewRange | null>();

  protected readonly range = signal<ViewRange | null>(null);
  protected readonly brush = signal<{ x: number; width: number } | null>(null);
  private brushStart: number | null = null;

  protected readonly zoomLabels = computed(() => ({...ZOOM_LABELS_FR, ...this.zoomTexts()}));
  protected readonly canZoom = computed(() => this.zoomable() && !this.isPie() && (this.data()?.categories.length ?? 0) > 2);
  protected readonly zoomed = computed(() => !isFullRange(this.range(), this.data()?.categories.length ?? 0));

  constructor() {
    // De nouvelles données repartent de la vue complète.
    effect(() => {
      this.data();
      this.range.set(null);
    });
  }

  private total(): number {
    return this.data()?.categories.length ?? 0;
  }

  private setRange(range: ViewRange | null): void {
    const next = range && isFullRange(range, this.total()) ? null : range;
    this.range.set(next);
    this.zoomChange.emit(next);
  }

  /** Zoome (`factor` < 1) ou éloigne (> 1) autour du centre, ou du point `anchor` (0 à 1). */
  zoomBy(factor: number, anchor = 0.5): void {
    if (this.canZoom()) {
      this.setRange(zoomRange(this.range(), this.total(), factor, anchor));
    }
  }

  /** Décale la fenêtre d'une fraction de sa largeur. */
  pan(fraction: number): void {
    if (this.canZoom() && this.zoomed()) {
      const window = this.layout().window;
      this.setRange(panRange(this.range(), this.total(), Math.round((window.end - window.start) * fraction) || Math.sign(fraction)));
    }
  }

  resetZoom(): void {
    if (this.zoomed()) {
      this.setRange(null);
    }
  }

  /** Abscisse du pointeur dans le repère du tracé (le SVG est mis à l'échelle par `viewBox`). */
  private plotX(event: MouseEvent): number {
    const svg = event.currentTarget as SVGSVGElement;
    const rect = svg.getBoundingClientRect();
    return rect.width > 0 ? ((event.clientX - rect.left) * this.layout().width) / rect.width : 0;
  }

  protected onPointerDown(event: PointerEvent): void {
    const x = this.plotX(event);
    const {plot} = this.layout();
    if (this.canZoom() && event.button === 0 && x >= plot.left && x <= plot.right) {
      this.brushStart = x;
      (event.currentTarget as SVGSVGElement).setPointerCapture?.(event.pointerId);
    }
  }

  protected onPointerMove(event: PointerEvent): void {
    if (this.brushStart !== null) {
      const x = this.plotX(event);
      this.brush.set({x: Math.min(this.brushStart, x), width: Math.abs(x - this.brushStart)});
    }
  }

  protected onPointerUp(event: PointerEvent): void {
    const start = this.brushStart;
    this.brushStart = null;
    this.brush.set(null);
    if (start === null) {
      return;
    }
    const end = this.plotX(event);
    if (Math.abs(end - start) > 6) {
      this.setRange(rangeFromBrush(start, end, this.layout().plot, this.range(), this.total()));
    }
  }

  protected onWheel(event: WheelEvent): void {
    if (!this.canZoom() || !(event.ctrlKey || event.metaKey)) {
      return; // sans Ctrl, la molette fait défiler la page
    }
    event.preventDefault();
    const {plot} = this.layout();
    const anchor = Math.min(1, Math.max(0, (this.plotX(event) - plot.left) / (plot.right - plot.left)));
    this.zoomBy(event.deltaY < 0 ? 0.7 : 1 / 0.7, anchor);
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (!this.canZoom()) {
      return;
    }
    const handled = ['+', '=', '-', '_', 'ArrowLeft', 'ArrowRight', 'Home', 'Escape'];
    if (!handled.includes(event.key)) {
      return;
    }
    event.preventDefault();
    if (event.key === '+' || event.key === '=') {
      this.zoomBy(0.5);
    } else if (event.key === '-' || event.key === '_') {
      this.zoomBy(2);
    } else if (event.key === 'ArrowLeft') {
      this.pan(-0.25);
    } else if (event.key === 'ArrowRight') {
      this.pan(0.25);
    } else {
      this.resetZoom();
    }
  }

  /** Série survolée dans la légende : les autres s'estompent. */
  protected readonly highlight = signal<number | null>(null);

  protected readonly isPie = computed(() => this.type() === 'pie' || this.type() === 'donut');

  protected readonly layout = computed(() =>
    buildChartLayout(this.data() ?? {categories: [], series: []}, this.type(), Math.max(120, this.height()), {
      range: this.range(),
      maxPoints: this.maxPoints(),
    }),
  );

  /** Légende : les séries, ou les catégories pour un secteur. */
  protected readonly legend = computed(() => {
    const data = this.data();
    return !data ? [] : this.isPie() ? data.categories : data.series.map((series) => series.name);
  });

  protected readonly summary = computed(() => {
    const data = this.data();
    if (!data) {
      return '';
    }
    const names = data.series.map((series) => series.name).join(', ');
    return `${this.title() || this.type()} : ${names} — ${data.categories.length}`;
  });

  private readonly numberFormat = new Intl.NumberFormat(undefined, {maximumFractionDigits: 2});
  private readonly percentFormat = new Intl.NumberFormat(undefined, {style: 'percent', maximumFractionDigits: 1});

  protected color(index: number): string {
    return `var(--ngt-chart-${(index % 8) + 1})`;
  }

  protected dimmed(series: number): boolean {
    const highlighted = this.highlight();
    return highlighted !== null && highlighted !== series;
  }

  protected axisNumber(value: number): string {
    return formatAxisNumber(value);
  }

  protected number(value: number): string {
    return this.numberFormat.format(value);
  }

  protected percent(share: number): string {
    return this.percentFormat.format(share);
  }

  protected shorten(text: string): string {
    return text.length > 12 ? `${text.slice(0, 11)}…` : text;
  }
}
