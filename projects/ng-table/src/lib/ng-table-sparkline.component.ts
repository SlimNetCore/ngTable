import {ChangeDetectionStrategy, Component, computed, input} from '@angular/core';
import {buildSparkline, SparklineType, sparklineValues} from './sparkline';

/**
 * Mini-graphique en SVG : courbe, zone ou barres. Utilisé par les colonnes `sparkline` de
 * `ng-table`, et utilisable seul (dans un `cellTemplate`, une carte…).
 *
 * ```html
 * <ng-table-sparkline [values]="[3, 5, 4, 8, 6]" type="area" />
 * ```
 */
@Component({
  selector: 'ng-table-sparkline',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (shape(); as s) {
      <svg [attr.aria-label]="label()" [attr.height]="s.height" [attr.viewBox]="'0 0 ' + s.width + ' ' + s.height"
           [attr.width]="s.width" class="ngt-sparkline" role="img">
        <title>{{ label() }}</title>
        @if (s.area) {
          <path [attr.d]="s.area" class="ngt-sparkline__area"/>
        }
        @if (s.line) {
          <path [attr.d]="s.line" class="ngt-sparkline__line"/>
        }
        @for (bar of s.bars; track $index) {
          <rect [attr.height]="bar.height" [attr.width]="bar.width" [attr.x]="bar.x" [attr.y]="bar.y"
                [class.ngt-sparkline__bar--negative]="bar.negative" class="ngt-sparkline__bar"/>
        }
        @if (s.lastPoint; as point) {
          <circle [attr.cx]="point.x" [attr.cy]="point.y" class="ngt-sparkline__dot" r="2.5"/>
        }
      </svg>
    }
  `,
  styles: `
    :host {
      display: inline-flex;
      vertical-align: middle;
      color: var(--ngt-sparkline-color, var(--app-primary, #3a7ca5));
    }

    .ngt-sparkline__line {
      fill: none;
      stroke: currentColor;
      stroke-width: 1.5;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    .ngt-sparkline__area {
      fill: currentColor;
      opacity: 0.18;
    }

    .ngt-sparkline__bar {
      fill: currentColor;
    }

    .ngt-sparkline__bar--negative {
      fill: var(--mat-sys-error, #b3261e);
    }

    .ngt-sparkline__dot {
      fill: currentColor;
    }
  `,
  host: {'[style.--ngt-sparkline-color]': 'color()'},
})
export class NgTableSparklineComponent {
  /** La série de nombres à tracer. */
  readonly values = input<readonly unknown[] | unknown>([]);
  readonly type = input<SparklineType>('line');
  readonly width = input(96);
  readonly height = input(24);
  /** Couleur CSS du tracé ; par défaut la couleur principale. */
  readonly color = input<string | null>(null);
  /** Description pour les lecteurs d'écran ; par défaut : les valeurs. */
  readonly ariaLabel = input<string | null>(null);

  private readonly series = computed(() => sparklineValues(this.values()));
  protected readonly shape = computed(() => buildSparkline(this.series(), this.type(), this.width(), this.height()));
  protected readonly label = computed(() => this.ariaLabel() ?? this.series().join(', '));
}
