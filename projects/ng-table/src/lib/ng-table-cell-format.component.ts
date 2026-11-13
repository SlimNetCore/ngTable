import {ChangeDetectionStrategy, Component, computed, input, ViewEncapsulation} from '@angular/core';
import {
  badgeTone,
  colorScale,
  dataBar,
  effectiveRange,
  initials,
  NgTableCellFormat,
  NgTableValueRange,
  progressRatio,
  ratingParts,
} from './cell-format';

/**
 * Rendu d'une cellule déclarée par `NgTableColumn.cell` : pastille, barre de progression, note, lien, avatar,
 * barre de données, dégradé de couleur. Utilisable seul, dans un `cellTemplate` ou hors d'une table :
 *
 * ```html
 * <ng-table-cell-format [format]="{type: 'progress'}" [value]="72" text="72" />
 * ```
 */
@Component({
  selector: 'ng-table-cell-format',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: {'[class]': '"ngt-cell-format ngt-cell-format--" + format().type'},
  template: `
    @let f = format();
    @switch (f.type) {
      @case ('badge') {
        <span [attr.data-tone]="badge()" class="ngt-badge">{{ badgeLabel() }}</span>
      }
      @case ('progress') {
        @if (progress(); as p) {
          <span [attr.aria-label]="label() || shown()" [attr.aria-valuenow]="p.percent" aria-valuemax="100" aria-valuemin="0" class="ngt-progress" role="progressbar">
            <span [style.width.%]="p.percent" class="ngt-progress__fill"></span>
          </span>
          @if (p.showValue) {
            <span class="ngt-progress__value">{{ p.percent }} %</span>
          }
        } @else {
          {{ shown() }}
        }
      }
      @case ('rating') {
        @if (rating(); as r) {
          <span [attr.aria-label]="ratingText(r.value, r.max)" class="ngt-rating" role="img">
            @for (star of r.stars; track $index) {
              <span [attr.data-star]="star" aria-hidden="true" class="ngt-rating__star">★</span>
            }
          </span>
        } @else {
          {{ shown() }}
        }
      }
      @case ('link') {
        @if (link(); as l) {
          <a (click)="$event.stopPropagation()" [attr.rel]="l.external ? 'noopener noreferrer' : null" [attr.target]="l.external ? '_blank' : null"
             [href]="l.href" class="ngt-link">{{ shown() }}</a>
        } @else {
          {{ shown() }}
        }
      }
      @case ('avatar') {
        @if (shown() || avatarImage()) {
          <span aria-hidden="true" class="ngt-avatar">
            @if (avatarImage(); as src) {
              <img [src]="src" alt="" class="ngt-avatar__image"/>
            } @else {
              {{ avatarInitials() }}
            }
          </span>
        }
        <span class="ngt-avatar__text">{{ shown() }}</span>
      }
      @case ('dataBar') {
        @if (bar(); as b) {
          <span [attr.data-tone]="b.tone" [class.ngt-data-bar__fill--negative]="b.negative" [style.inset-inline-start.%]="b.start"
                [style.width.%]="b.width" aria-hidden="true" class="ngt-data-bar__fill"></span>
        }
        <span class="ngt-data-bar__value">{{ shown() }}</span>
      }
      @case ('colorScale') {
        <span [class.ngt-color-scale--negative]="scale()?.negative" [style.--ngt-scale-ratio]="scale()?.ratio ?? 0" class="ngt-color-scale">{{ shown() }}</span>
      }
    }
  `,
  styles: [
    `
    .ngt-cell-format {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
      max-width: 100%;
      vertical-align: middle;
    }

    /* Pastille : fond teinté, bordure et texte dans la teinte ; le texte porte l'information. */
    .ngt-badge {
      --ngt-tone: var(--ngt-text-muted, #5f7080);
      display: inline-block;
      max-width: 100%;
      padding: 2px 10px;
      border-radius: 999px;
      border: 1px solid color-mix(in srgb, var(--ngt-tone) 45%, transparent);
      background: color-mix(in srgb, var(--ngt-tone) 14%, transparent);
      color: color-mix(in srgb, var(--ngt-tone) 70%, var(--ngt-text, #14212b));
      font-size: 0.86em;
      font-weight: 600;
      line-height: 1.5;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .ngt-badge[data-tone='info'],
    .ngt-data-bar__fill[data-tone='info'] {
      --ngt-tone: var(--ngt-primary, #2f6fa8);
    }

    .ngt-badge[data-tone='success'],
    .ngt-data-bar__fill[data-tone='success'] {
      --ngt-tone: var(--ngt-success, #1f8a4c);
    }

    .ngt-badge[data-tone='warning'],
    .ngt-data-bar__fill[data-tone='warning'] {
      --ngt-tone: var(--ngt-warning, #b26a00);
    }

    .ngt-badge[data-tone='danger'],
    .ngt-data-bar__fill[data-tone='danger'] {
      --ngt-tone: var(--ngt-danger, #c0392b);
    }

    .ngt-cell-format--progress {
      width: 100%;
    }

    .ngt-progress {
      flex: 1 1 auto;
      min-width: 40px;
      height: 8px;
      border-radius: 999px;
      background: var(--ngt-border, rgba(20, 33, 43, 0.12));
      overflow: hidden;
    }

    .ngt-progress__fill {
      display: block;
      height: 100%;
      border-radius: inherit;
      background: var(--ngt-primary, #2f6fa8);
    }

    .ngt-progress__value {
      flex: 0 0 auto;
      min-width: 3.2em;
      text-align: end;
      font-variant-numeric: tabular-nums;
      color: var(--ngt-text-muted, #5f7080);
      font-size: 0.9em;
    }

    .ngt-rating {
      display: inline-flex;
      letter-spacing: 1px;
      line-height: 1;
    }

    .ngt-rating__star {
      color: var(--ngt-border-strong, rgba(20, 33, 43, 0.25));
    }

    .ngt-rating__star[data-star='full'] {
      color: var(--ngt-rating-color, var(--ngt-warning, #b26a00));
    }

    .ngt-rating__star[data-star='half'] {
      background: linear-gradient(to right, var(--ngt-rating-color, var(--ngt-warning, #b26a00)) 50%, var(--ngt-border-strong, rgba(20, 33, 43, 0.25)) 50%);
      -webkit-background-clip: text;
      background-clip: text;
      color: transparent;
    }

    :dir(rtl) .ngt-rating__star[data-star='half'] {
      background-image: linear-gradient(to left, var(--ngt-rating-color, var(--ngt-warning, #b26a00)) 50%, var(--ngt-border-strong, rgba(20, 33, 43, 0.25)) 50%);
    }

    .ngt-link {
      color: var(--ngt-primary, #2f6fa8);
      text-decoration: underline;
      text-underline-offset: 2px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .ngt-link:focus-visible {
      outline: 2px solid var(--ngt-primary, #2f6fa8);
      outline-offset: 2px;
      border-radius: 2px;
    }

    .ngt-avatar {
      flex: 0 0 auto;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      border-radius: 50%;
      background: var(--ngt-primary-soft, rgba(47, 111, 168, 0.14));
      /* Couleur du texte, pas l'accent : l'accent sur son fond pâle manque de contraste à cette taille (audit axe). */
      color: var(--ngt-text, #14212b);
      font-size: 0.78em;
      font-weight: 700;
      overflow: hidden;
    }

    .ngt-avatar__image {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .ngt-avatar__text {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    /* Barre de données : la barre est derrière le nombre, qui reste lisible et aligné à droite. */
    .ngt-cell-format--dataBar {
      position: relative;
      display: flex;
      width: 100%;
      justify-content: flex-end;
      padding: 2px 4px;
    }

    .ngt-data-bar__fill {
      --ngt-tone: var(--ngt-primary, #2f6fa8);
      position: absolute;
      top: 2px;
      bottom: 2px;
      border-radius: 3px;
      background: color-mix(in srgb, var(--ngt-tone) 30%, transparent);
      border-inline-end: 2px solid var(--ngt-tone);
    }

    .ngt-data-bar__fill--negative {
      --ngt-tone: var(--ngt-danger, #c0392b);
      border-inline-end: 0;
      border-inline-start: 2px solid var(--ngt-tone);
      /* Hachures : le signe ne dépend pas de la couleur seule (le nombre porte aussi son « - »). */
      background-image: repeating-linear-gradient(135deg, transparent 0 3px, color-mix(in srgb, var(--ngt-tone) 30%, transparent) 3px 6px);
    }

    .ngt-data-bar__value {
      position: relative;
      font-variant-numeric: tabular-nums;
    }

    .ngt-cell-format--colorScale {
      display: flex;
      width: 100%;
    }

    .ngt-color-scale {
      flex: 1 1 auto;
      padding: 2px 8px;
      border-radius: 4px;
      text-align: end;
      font-variant-numeric: tabular-nums;
      background: color-mix(in srgb, var(--ngt-scale-color, var(--ngt-success, #1f8a4c)) calc(var(--ngt-scale-ratio, 0) * 42%), transparent);
    }

    .ngt-color-scale--negative {
      --ngt-scale-color: var(--ngt-scale-negative-color, var(--ngt-danger, #c0392b));
    }

    @media (forced-colors: active) {
      .ngt-badge,
      .ngt-progress,
      .ngt-avatar {
        border: 1px solid CanvasText;
      }

      .ngt-progress__fill,
      .ngt-data-bar__fill {
        background: Highlight;
        forced-color-adjust: none;
      }
    }

    @media print {
      .ngt-badge,
      .ngt-color-scale,
      .ngt-data-bar__fill,
      .ngt-progress__fill {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
    }
    `,
  ],
})
// `any` : le composant sert des colonnes de n'importe quel type de ligne.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export class NgTableCellFormatComponent<T = any> {
  readonly format = input.required<NgTableCellFormat<T>>();
  /** Valeur de la cellule (`valueAccessor`). */
  readonly value = input<unknown>(null);
  /** La valeur en texte, telle qu'affichée. Défaut : la valeur convertie en texte. */
  readonly text = input<string | null>(null);
  /** La ligne : passée aux fonctions du format (`tone`, `href`, `image`). */
  readonly row = input<T | null>(null);
  /** Étendue des valeurs de la colonne, pour les barres de données et les dégradés sans bornes fixes. */
  readonly range = input<NgTableValueRange | null>(null);
  /** Nom accessible de la barre de progression (dans une table : l'en-tête de la colonne). */
  readonly label = input('');
  /** Nom accessible d'une note ; `{value}` et `{max}` sont remplacés. */
  readonly ratingLabel = input('{value} / {max}');

  protected readonly shown = computed(() => {
    const value = this.value();
    return this.text() ?? (value === null || value === undefined ? '' : String(value));
  });

  protected readonly badge = computed(() => {
    const format = this.format();
    return format.type === 'badge' ? badgeTone(format, this.value(), this.row() as T) : 'neutral';
  });

  protected readonly badgeLabel = computed(() => {
    const format = this.format();
    return format.type === 'badge' && format.label ? format.label(this.value(), this.row() as T) : this.shown();
  });

  protected readonly progress = computed(() => {
    const format = this.format();
    const ratio = format.type === 'progress' ? progressRatio(this.value(), format.max) : null;
    return ratio === null || format.type !== 'progress' ? null : {percent: Math.round(ratio * 100), showValue: format.showValue !== false};
  });

  protected readonly rating = computed(() => {
    const format = this.format();
    const parts = format.type === 'rating' ? ratingParts(this.value(), format.max) : null;
    if (!parts) {
      return null;
    }
    const stars: ('full' | 'half' | 'empty')[] = [
      ...Array.from({length: parts.full}, () => 'full' as const),
      ...(parts.half ? (['half'] as const) : []),
      ...Array.from({length: parts.empty}, () => 'empty' as const),
    ];
    return {stars, value: parts.value, max: parts.max};
  });

  protected ratingText(value: number, max: number): string {
    return this.ratingLabel().replace('{value}', `${value}`).replace('{max}', `${max}`);
  }

  protected readonly link = computed(() => {
    const format = this.format();
    const href = format.type === 'link' ? format.href(this.row() as T, this.value()) : null;
    return href && format.type === 'link' ? {href, external: !!format.external} : null;
  });

  protected readonly avatarImage = computed(() => {
    const format = this.format();
    return format.type === 'avatar' ? (format.image?.(this.row() as T) ?? null) : null;
  });

  protected readonly avatarInitials = computed(() => initials(this.shown()));

  protected readonly bar = computed(() => {
    const format = this.format();
    if (format.type !== 'dataBar') {
      return null;
    }
    const geometry = dataBar(this.value(), effectiveRange(format, this.range()));
    return geometry ? {start: geometry.start * 100, width: geometry.width * 100, negative: geometry.negative, tone: format.tone ?? null} : null;
  });

  protected readonly scale = computed(() => {
    const format = this.format();
    return format.type === 'colorScale' ? colorScale(this.value(), effectiveRange(format, this.range()), format.diverging) : null;
  });
}
