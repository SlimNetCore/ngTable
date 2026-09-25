import {BaseHarnessFilters, ComponentHarness, HarnessPredicate} from '@angular/cdk/testing';
import {MatPaginatorHarness} from '@angular/material/paginator/testing';

/** Filtres de `NgTableHarness.with()`. */
export interface NgTableHarnessFilters extends BaseHarnessFilters {
  /** `aria-label` du `<table>` (voir `[ariaLabel]`). */
  ariaLabel?: string | RegExp;
}

/** Direction de tri d'une colonne, lue depuis `aria-sort` (tri principal uniquement). */
export type NgTableHarnessSortDirection = 'asc' | 'desc' | '';

/** Une cellule d'en-tête de `<ng-table>`. */
export class NgTableHeaderCellHarness extends ComponentHarness {
  static hostSelector = 'tr.mat-mdc-header-row th.mat-mdc-header-cell';

  private readonly label = this.locatorForOptional('.header-label');
  private readonly sortButton = this.locatorForOptional('.header-button');

  /** Libellé de la colonne (`''` pour la colonne de sélection). */
  async getText(): Promise<string> {
    const label = await this.label();
    return label ? (await label.text()).trim() : '';
  }

  async isSelectionColumn(): Promise<boolean> {
    return (await this.host()).hasClass('selection-header-cell');
  }

  /** Direction du tri principal sur cette colonne (`''` si elle ne l'est pas). */
  async getSortDirection(): Promise<NgTableHarnessSortDirection> {
    const ariaSort = await (await this.host()).getAttribute('aria-sort');
    return ariaSort === 'ascending' ? 'asc' : ariaSort === 'descending' ? 'desc' : '';
  }

  /** Clic de tri ; `additive` = Maj+clic (niveau supplémentaire avec `[multiSort]`). */
  async sort(additive = false): Promise<void> {
    const button = await this.sortButton();
    if (!button) {
      throw new Error('NgTableHarness : cette colonne n’a pas de bouton de tri.');
    }
    await (additive ? button.click({shift: true}) : button.click());
  }
}

/** Une ligne de données de `<ng-table>`. */
export class NgTableRowHarness extends ComponentHarness {
  static hostSelector = 'tr.data-row';

  private readonly cellTexts = this.locatorForAll('td.mat-mdc-cell:not(.selection-cell) .cell-text');
  private readonly checkbox = this.locatorForOptional('td.selection-cell input[type="checkbox"]');

  /** Textes des cellules, dans l'ordre des colonnes (hors case de sélection). */
  async getCellTexts(): Promise<string[]> {
    const cells = await this.cellTexts();
    return Promise.all(cells.map(async (cell) => (await cell.text()).trim()));
  }

  async click(): Promise<void> {
    await (await this.host()).click();
  }

  async toggleSelection(): Promise<void> {
    await (await this.requireCheckbox()).click();
  }

  async isSelected(): Promise<boolean> {
    return (await this.requireCheckbox()).getProperty<boolean>('checked');
  }

  private async requireCheckbox() {
    const checkbox = await this.checkbox();
    if (!checkbox) {
      throw new Error('NgTableHarness : pas de case de sélection (`[rowSelectionEnabled]="true"`).');
    }
    return checkbox;
  }
}

/**
 * Harness de test pour `<ng-table>` (Angular CDK component harness).
 *
 * Passe par ce que voit l'utilisateur (libellés d'en-tête, textes des cellules,
 * attributs ARIA) plutôt que par l'état interne du composant : les tests restent
 * valides quand le composant évolue.
 *
 * ```ts
 * const table = await TestbedHarnessEnvironment.loader(fixture).getHarness(NgTableHarness);
 * await table.sortBy('Montant');
 * expect(await table.getColumnTexts('Client')).toEqual(['Dupont', 'Martin']);
 * ```
 */
export class NgTableHarness extends ComponentHarness {
  static hostSelector = 'ng-table';

  private readonly table = this.locatorFor('table.ng-table');
  private readonly searchInput = this.locatorForOptional('input.global-search__input');
  private readonly liveRegion = this.locatorFor('.ngt-live-region');
  private readonly noDataCell = this.locatorForOptional('.no-data-cell');
  private readonly loadingOverlay = this.locatorForOptional('.ngt-loading-overlay');

  /** Lignes de données affichées (page courante). */
  readonly getRows = this.locatorForAll(NgTableRowHarness);
  /** Cellules d'en-tête, dans l'ordre d'affichage (colonne de sélection comprise). */
  readonly getHeaderCells = this.locatorForAll(NgTableHeaderCellHarness);
  /** Paginateur intégré (`[paginator]="true"`), sinon `null`. */
  readonly getPaginator = this.locatorForOptional(MatPaginatorHarness);

  static with(options: NgTableHarnessFilters = {}): HarnessPredicate<NgTableHarness> {
    return new HarnessPredicate(NgTableHarness, options).addOption('ariaLabel', options.ariaLabel, async (harness, label) =>
      HarnessPredicate.stringMatches(await harness.getAriaLabel(), label),
    );
  }

  async getAriaLabel(): Promise<string | null> {
    return (await this.table()).getAttribute('aria-label');
  }

  async getRowCount(): Promise<number> {
    return (await this.getRows()).length;
  }

  /** Libellés des colonnes, dans l'ordre d'affichage (hors colonne de sélection). */
  async getHeaderTexts(): Promise<string[]> {
    return (await this.dataHeaderCells()).map((entry) => entry.text);
  }

  /** Textes des cellules, ligne par ligne. */
  async getCellTexts(): Promise<string[][]> {
    const rows = await this.getRows();
    return Promise.all(rows.map((row) => row.getCellTexts()));
  }

  /** Textes d'une colonne, identifiée par son libellé d'en-tête. */
  async getColumnTexts(header: string): Promise<string[]> {
    const index = (await this.getHeaderTexts()).indexOf(header);
    if (index === -1) {
      throw new Error(`NgTableHarness : aucune colonne « ${header} ».`);
    }
    return (await this.getCellTexts()).map((row) => row[index]);
  }

  /**
   * Trie par cette colonne : croissant, puis décroissant, puis sans tri à chaque appel.
   * `additive: true` = Maj+clic, qui ajoute un niveau de tri avec `[multiSort]`.
   */
  async sortBy(header: string, options: { additive?: boolean } = {}): Promise<void> {
    await (await this.headerCell(header)).sort(options.additive);
  }

  async getSortDirection(header: string): Promise<NgTableHarnessSortDirection> {
    return (await this.headerCell(header)).getSortDirection();
  }

  /** Saisit une recherche globale et l'applique aussitôt (Entrée), sans attendre le debounce. */
  async search(text: string): Promise<void> {
    const input = await this.requireSearchInput();
    await input.clear();
    if (text) {
      await input.sendKeys(text);
    }
    await input.dispatchEvent('keydown', {key: 'Enter'});
  }

  async getSearchValue(): Promise<string> {
    return (await this.requireSearchInput()).getProperty<string>('value');
  }

  /** Message affiché quand aucune ligne n'est affichée, sinon `null`. */
  async getEmptyText(): Promise<string | null> {
    const cell = await this.noDataCell();
    return cell ? (await cell.text()).trim() : null;
  }

  async isLoading(): Promise<boolean> {
    return (await this.loadingOverlay()) !== null;
  }

  /** Dernière annonce de la région `aria-live` (tri, nombre de lignes). */
  async getLiveAnnouncement(): Promise<string> {
    return (await (await this.liveRegion()).text()).trim();
  }

  private async dataHeaderCells(): Promise<{ cell: NgTableHeaderCellHarness; text: string }[]> {
    const result: { cell: NgTableHeaderCellHarness; text: string }[] = [];
    for (const cell of await this.getHeaderCells()) {
      if (!(await cell.isSelectionColumn())) {
        result.push({cell, text: await cell.getText()});
      }
    }
    return result;
  }

  private async headerCell(header: string): Promise<NgTableHeaderCellHarness> {
    const match = (await this.dataHeaderCells()).find((entry) => entry.text === header);
    if (!match) {
      throw new Error(`NgTableHarness : aucune colonne « ${header} ».`);
    }
    return match.cell;
  }

  private async requireSearchInput() {
    const input = await this.searchInput();
    if (!input) {
      throw new Error('NgTableHarness : pas de recherche globale (`[globalSearchEnabled]="true"`).');
    }
    return input;
  }
}
