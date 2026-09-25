import {bootstrapApplication} from '@angular/platform-browser';
import {provideZonelessChangeDetection} from '@angular/core';
import {provideRouter, Routes} from '@angular/router';
import {provideNgTablePaginatorIntl} from '@sbourahla/ng-table';
import {AppComponent} from './app/app.component';

const routes: Routes = [
  {path: '', pathMatch: 'full', redirectTo: 'simple'},
  {path: 'simple', title: 'ng-table — simple', loadComponent: () => import('./app/simple-demo.component').then((m) => m.SimpleDemoComponent)},
  {path: 'avance', title: 'ng-table — avancé', loadComponent: () => import('./app/advanced-demo.component').then((m) => m.AdvancedDemoComponent)},
  {path: 'expert', title: 'ng-table — expert', loadComponent: () => import('./app/expert-demo.component').then((m) => m.ExpertDemoComponent)},
  {path: '**', redirectTo: 'simple'},
];

bootstrapApplication(AppComponent, {
  providers: [provideZonelessChangeDetection(), provideRouter(routes), provideNgTablePaginatorIntl()],
}).catch((error: unknown) => console.error(error));
