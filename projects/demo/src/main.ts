import {bootstrapApplication} from '@angular/platform-browser';
import {provideZonelessChangeDetection} from '@angular/core';
import {provideRouter} from '@angular/router';
import {provideNgTablePaginatorIntl} from '@sbourahla/ng-table';
import {AppComponent} from './app/app.component';

bootstrapApplication(AppComponent, {
  // Router sans route : il ne sert qu'à la synchronisation de l'état dans l'URL (ngTableUrlState).
  providers: [provideZonelessChangeDetection(), provideRouter([]), provideNgTablePaginatorIntl()],
}).catch((error: unknown) => console.error(error));
