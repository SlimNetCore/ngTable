import {CommonModule} from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from '@angular/core';
import {NgTableIconComponent} from './ng-table-icon.component';
import {NG_TABLE_DEFAULT_LABELS, NgTableLabels} from './ng-table-labels';
import {NgTableSetFilterComponent} from './ng-table-set-filter.component';
import type {SetFilterValue} from './set-filter';
import {NgTableSelectComponent} from './ng-table-select.component';

export type ColumnFilterType =
  | 'text'
  | 'search'
  | 'email'
  | 'password'
  | 'tel'
  | 'url'
  /**
   * Nombre, saisie libre avec opérateurs : `42`, `>100`, `<=50`, `!=0`, `10..50`.
   * Rendu en champ texte (`inputmode="decimal"`) : un `type="number"` natif
   * refuserait les caractères `>`, `<`, `=` et `..`.
   */
  | 'number'
  /** Plage numérique : deux champs min/max, valeur sérialisée `"min..max"` (bornes incluses, une borne peut être vide). */
  | 'numberRange'
  /** Date simple : un seul jour, valeur sérialisée `"YYYY-MM-DD"`. */
  | 'date'
  /** Période : deux bornes, valeur sérialisée `"YYYY-MM-DD..YYYY-MM-DD"` (bornes incluses, une borne peut être vide). */
  | 'range'
  | 'datetime-local'
  | 'time'
  | 'month'
  | 'week'
  | 'boolean'
  | 'enum'
  /**
   * Ensemble de valeurs : une case par valeur distincte de la colonne (avec son effectif), recherche et « tout sélectionner ».
   * Valeur sérialisée : tableau JSON des clés cochées, vide quand tout l'est.
   */
  | 'set';

/**
 * Renderer standard de filtre de colonne.
 *
 * Ce composant est volontairement "presentational":
 * - il recoit la valeur courante (`value`) depuis le parent
 * - il emet la nouvelle valeur via `valueChange`
 * - il ne filtre pas lui-meme les lignes
 *
 * Relation avec `NgTableComponent`:
 * - ng-table l'instancie quand une colonne declare `filter` sans composant custom
 * - ng-table ecoute `valueChange` et met a jour `columnFilters`
 * - ng-table applique ensuite le filtrage local dans son pipeline `displayedRows`
 *
 * Usage interne uniquement — non exporté par `public-api.ts`.
 */
@Component({
  selector: 'ng-table-column-filter',
  standalone: true,
  imports: [
    CommonModule,
    NgTableIconComponent,
    NgTableSelectComponent,
    NgTableSetFilterComponent,
  ],
  templateUrl: './column-filter-renderer.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './column-filter-renderer.component.css',
})
export class ColumnFilterRendererComponent {
  /** Type d'UI de filtre a rendre. */
  readonly type = input<ColumnFilterType>('text');
  /** Valeur serialisee courante du filtre (source de verite: parent). */
  readonly value = input('');
  readonly placeholder = input('');
  /** Libellé de la colonne, affiché tel quel (texte déjà résolu — plus une clé i18n). */
  readonly label = input('');
  /** Textes affichés par le composant, hérités de `NgTableComponent`. */
  readonly labels = input<NgTableLabels>(NG_TABLE_DEFAULT_LABELS);
  /** Options pour les types enum/boolean. */
  readonly options = input<{ value: string; label: string }[]>([]);
  /** Valeurs distinctes de la colonne, pour le type set. */
  readonly setValues = input<readonly SetFilterValue[]>([]);
  readonly setTruncated = input(false);
  /** Emet la nouvelle valeur serialisee vers le parent. */
  readonly valueChange = output<string>();
  /** Demande au parent d'effacer le filtre. */
  readonly clear = output<void>();
  isSelectType(): boolean {
    const type = this.type();
    return type === 'boolean' || type === 'enum';
  }

  inputType(): string {
    const type = this.type();
    // `number` accepte des opérateurs (`>100`, `10..50`) qu'un `type="number"` refuserait.
    if (this.isNativeInputType(type) && type !== 'number') {
      return type;
    }

    return 'text';
  }

  /** Clavier numérique sur mobile pour `number`, sans les restrictions de `type="number"`. */
  inputMode(): string | null {
    return this.type() === 'number' ? 'decimal' : null;
  }

  /** Bornes courantes d'un filtre `numberRange` (`"min..max"`). */
  numberRangeBounds(): { min: string; max: string } {
    const [min = '', max = ''] = (this.value() ?? '').split('..', 2);
    return {min: min.trim(), max: max.trim()};
  }

  onNumberRangeInput(bound: 'min' | 'max', value: string): void {
    const bounds = {...this.numberRangeBounds(), [bound]: value.trim()};
    this.valueChange.emit(bounds.min || bounds.max ? `${bounds.min}..${bounds.max}` : '');
  }

  isActive(): boolean {
    return !!this.value()?.toString().trim();
  }

  showsTrailingIcon(): boolean {
    return this.isSelectType();
  }

  trailingIcon(): string {
    if (this.isSelectType()) return 'expand_more';
    return '';
  }

  /** `labels().filterBy` avec `{field}` remplacé par le libellé de la colonne. */
  filterByPlaceholder(): string {
    return this.labels().filterBy.replace('{field}', this.label());
  }

  /** Valeur choisie dans la liste : l'énuméré (multiple) est sérialisé en CSV pour rester compatible avec le moteur de filtre. */
  onSelect(value: string | string[]): void {
    this.valueChange.emit(Array.isArray(value) ? value.filter((v) => !!v).join(',') : (value ?? ''));
  }

  selectedValues(): string[] | string {
    if (!this.isMultiSelect()) return this.value() ?? '';
    return (this.value() ?? '')
      .split(',')
      .map((v) => v.trim())
      .filter((v) => !!v);
  }

  onInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const value = input.value;

    this.valueChange.emit(value);
  }

  isMultiSelect(): boolean {
    return this.type() === 'enum';
  }

  booleanOptions(): { value: string; label: string }[] {
    const labels = this.labels();
    return [
      {value: 'true', label: labels.yes},
      {value: 'false', label: labels.no},
    ];
  }

  /** Valeur du champ `date` (`YYYY-MM-DD`, ou vide si la valeur reçue n'a pas ce format). */
  singleDate(): string {
    return this.normalizeIsoDate(this.value());
  }

  /** Bornes courantes d'une période (`"YYYY-MM-DD..YYYY-MM-DD"`). */
  dateRangeBounds(): { from: string; to: string } {
    return this.parseDateRange(this.value());
  }

  /** Type `date` : un jour unique, appliqué dès que la saisie est une date complète (ou vidée). */
  onSingleDateChange(value: string): void {
    this.valueChange.emit(this.normalizeIsoDate(value));
  }

  /** Type `range` : applique la période dès qu'une borne change ; deux bornes inversées sont remises dans l'ordre. */
  onDateRangeChange(bound: 'from' | 'to', value: string): void {
    const next = {...this.dateRangeBounds(), [bound]: this.normalizeIsoDate(value)};
    const ordered = next.from && next.to && next.from > next.to ? {from: next.to, to: next.from} : next;
    this.valueChange.emit(this.serializeDateRange(ordered.from, ordered.to));
  }
  isSingleDateType(type: ColumnFilterType = this.type()): boolean {
    return type === 'date';
  }

  isDateRangeType(type: ColumnFilterType = this.type()): boolean {
    return type === 'range';
  }

  private isNativeInputType(type: ColumnFilterType = this.type()): boolean {
    return (
      !this.isDateRangeType(type) &&
      !this.isSingleDateType(type) &&
      type !== 'numberRange' &&
      type !== 'boolean' &&
      type !== 'enum' &&
      type !== 'set'
    );
  }

  private parseDateRange(value: string): { from: string; to: string } {
    const raw = (value ?? '').trim();
    if (!raw) return {from: '', to: ''};

    if (raw.includes('..')) {
      const [fromRaw = '', toRaw = ''] = raw.split('..', 2);
      return {
        from: this.normalizeIsoDate(fromRaw),
        to: this.normalizeIsoDate(toRaw),
      };
    }

    const normalized = this.normalizeIsoDate(raw);
    return {from: normalized, to: normalized};
  }

  private serializeDateRange(from: string, to: string): string {
    if (!from && !to) return '';
    return `${from}..${to}`;
  }

  private normalizeIsoDate(value: string): string {
    const raw = (value ?? '').trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : '';
  }
}
