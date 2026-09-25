import {MatPaginatorIntl} from '@angular/material/paginator';
import {describe, expect, it} from 'vitest';
import {NgTablePaginatorIntl, provideNgTablePaginatorIntl} from './ng-table-paginator-intl';

describe('NgTablePaginatorIntl', () => {
  it('traduit les libellés statiques en français', () => {
    const intl = new NgTablePaginatorIntl();

    expect(intl.itemsPerPageLabel).toBe('Éléments par page');
    expect(intl.nextPageLabel).toBe('Page suivante');
    expect(intl.previousPageLabel).toBe('Page précédente');
    expect(intl.firstPageLabel).toBe('Première page');
    expect(intl.lastPageLabel).toBe('Dernière page');
  });

  it('formate la plage affichée en français', () => {
    const intl = new NgTablePaginatorIntl();

    expect(intl.getRangeLabel(0, 10, 44)).toBe('1 – 10 sur 44');
    expect(intl.getRangeLabel(4, 10, 44)).toBe('41 – 44 sur 44'); // dernière page partielle
    expect(intl.getRangeLabel(0, 10, 0)).toBe('0 sur 0'); // liste vide
    expect(intl.getRangeLabel(0, 0, 5)).toBe('0 sur 5'); // pageSize non défini
  });

  it('reste surchargeable : une sous-classe peut ne changer qu’un texte', () => {
    class CustomIntl extends NgTablePaginatorIntl {
      override itemsPerPageLabel = 'Lignes par page';
    }
    const intl = new CustomIntl();

    expect(intl.itemsPerPageLabel).toBe('Lignes par page');
    expect(intl.nextPageLabel).toBe('Page suivante'); // hérité, inchangé
  });

  it('provideNgTablePaginatorIntl() fournit NgTablePaginatorIntl à la place de MatPaginatorIntl', () => {
    const provider = provideNgTablePaginatorIntl() as {provide: unknown; useClass: unknown};

    expect(provider.provide).toBe(MatPaginatorIntl);
    expect(provider.useClass).toBe(NgTablePaginatorIntl);
  });
});
