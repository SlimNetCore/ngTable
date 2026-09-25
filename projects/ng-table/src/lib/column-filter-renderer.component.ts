import {CommonModule} from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  effect,
  input,
  output,
  signal,
} from '@angular/core';
import {MatButtonModule} from '@angular/material/button';
import {MatNativeDateModule, MatOptionSelectionChange} from '@angular/material/core';
import {MatDatepickerModule} from '@angular/material/datepicker';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatIconModule} from '@angular/material/icon';
import {MatInputModule} from '@angular/material/input';
import {MatSelectModule} from '@angular/material/select';
import {NG_TABLE_DEFAULT_LABELS, NgTableLabels} from './ng-table-labels';
import {SelectFilterComponent} from './select-filter.component';

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
  | 'enum';

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
    MatButtonModule,
    MatDatepickerModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatNativeDateModule,
    MatSelectModule,
    SelectFilterComponent,
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
  /** Emet la nouvelle valeur serialisee vers le parent. */
  readonly valueChange = output<string>();
  /** Demande au parent d'effacer le filtre. */
  readonly clear = output<void>();
  protected readonly panelFilterOptionValue = '__PANEL_FILTER_OPTION__';
  protected readonly panelFilter = signal('');
  protected readonly draftDateRange = signal<{ from: Date | null; to: Date | null }>({
    from: null,
    to: null,
  });
  /** Brouillon du type `date` (jour unique) — distinct de la période `range`. */
  protected readonly draftDate = signal<Date | null>(null);
  private previousType: ColumnFilterType | null = null;

  constructor() {
    effect(() => {
      const currentType = this.type();
      const currentValue = this.value();
      this.syncDraftDateRange(currentType, currentValue);
      this.syncDraftDate(currentType, currentValue);

      if (this.previousType !== null && this.previousType !== currentType) {
        this.panelFilter.set('');
      }

      this.previousType = currentType;
    });
  }

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

  onMatSelect(value: string | string[]): void {
    // Enum multi-select => serialisation CSV pour rester compatible avec le moteur de filtre parent.
    if (Array.isArray(value)) {
      this.valueChange.emit(value.filter((v) => !!v && v !== this.panelFilterOptionValue).join(','));
      return;
    }
    if (value === this.panelFilterOptionValue) {
      return;
    }
    this.valueChange.emit(value ?? '');
  }

  selectedValues(): string[] | string {
    // Deserialise CSV -> tableau pour le multi-select Angular Material.
    if (!this.isMultiSelect()) return this.value() ?? '';
    return (this.value() ?? '')
      .split(',')
      .map((v) => v.trim())
      .filter((v) => !!v && v !== this.panelFilterOptionValue);
  }

  onInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const value = input.value;

    this.valueChange.emit(value);
  }

  isMultiSelect(): boolean {
    return this.type() === 'enum';
  }

  onPanelFilterOptionSelection(event: MatOptionSelectionChange): void {
    if (!event?.isUserInput) return;
    // Keep this row as a non-selectable interactive header for panel filtering.
    event.source?.deselect?.();
  }

  onPanelFilterChange(value: string): void {
    this.panelFilter.set(value ?? '');
  }

  isPanelOptionVisible(label: string): boolean {
    const query = (this.panelFilter() ?? '').trim().toLowerCase();
    if (!query) return true;
    return (label ?? '').toLowerCase().includes(query);
  }

  onDraftDateRangeChange(bound: 'from' | 'to', value: Date | null): void {
    this.draftDateRange.set({
      ...this.draftDateRange(),
      [bound]: this.normalizeDate(value),
    });
  }

  booleanOptions(): { value: string; label: string }[] {
    const labels = this.labels();
    return [
      {value: 'true', label: labels.yes},
      {value: 'false', label: labels.no},
    ];
  }

  applyDateRange(): void {
    // Format canonique attendu par ng-table: "YYYY-MM-DD..YYYY-MM-DD".
    const ordered = this.getOrderedDraftDateRange();
    this.draftDateRange.set(ordered);
    this.valueChange.emit(
      this.serializeDateRange(this.toIsoDate(ordered.from), this.toIsoDate(ordered.to)),
    );
  }

  cancelDateRange(): void {
    this.syncDraftDateRange(this.type(), this.value());
  }

  syncDraftDateRange(type: ColumnFilterType = this.type(), value: string = this.value()): void {
    // Restaure l'etat de brouillon depuis la valeur serialisee remontee par le parent.
    if (!this.isDateRangeType(type)) {
      this.draftDateRange.set({from: null, to: null});
      return;
    }

    const parsed = this.parseDateRange(value);
    this.draftDateRange.set({
      from: this.isoToDate(parsed.from),
      to: this.isoToDate(parsed.to),
    });
  }

  /** Type `date` : un jour unique, committé immédiatement (action délibérée, pas de brouillon à valider). */
  onSingleDateChange(value: Date | null): void {
    const normalized = this.normalizeDate(value);
    this.draftDate.set(normalized);
    this.valueChange.emit(this.toIsoDate(normalized));
  }

  syncDraftDate(type: ColumnFilterType = this.type(), value: string = this.value()): void {
    if (!this.isSingleDateType(type)) {
      this.draftDate.set(null);
      return;
    }
    this.draftDate.set(this.isoToDate(this.normalizeIsoDate(value)));
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
      type !== 'enum'
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

  private getOrderedDraftDateRange(): { from: Date | null; to: Date | null } {
    const from = this.normalizeDate(this.draftDateRange().from);
    const to = this.normalizeDate(this.draftDateRange().to);

    if (from && to && from.getTime() > to.getTime()) {
      return {from: to, to: from};
    }

    return {from, to};
  }

  private isoToDate(value: string): Date | null {
    const raw = this.normalizeIsoDate(value);
    if (!raw) return null;

    const [year, month, day] = raw.split('-').map(Number);
    if (!year || !month || !day) return null;

    return new Date(year, month - 1, day);
  }

  private normalizeIsoDate(value: string): string {
    const raw = (value ?? '').trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : '';
  }

  private normalizeDate(value: Date | null): Date | null {
    if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
      return null;
    }

    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }

  private toIsoDate(value: Date | null): string {
    const normalized = this.normalizeDate(value);
    if (!normalized) {
      return '';
    }

    const year = normalized.getFullYear();
    const month = `${normalized.getMonth() + 1}`.padStart(2, '0');
    const day = `${normalized.getDate()}`.padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
