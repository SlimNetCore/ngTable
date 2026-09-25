import {bootstrapApplication} from '@angular/platform-browser';
import {provideZonelessChangeDetection} from '@angular/core';
import {provideNgTablePaginatorIntl} from '@sbourahla/ng-table';
import {AppComponent} from './app/app.component';

bootstrapApplication(AppComponent, {
  providers: [provideZonelessChangeDetection(), provideNgTablePaginatorIntl()],
}).catch((error: unknown) => console.error(error));
