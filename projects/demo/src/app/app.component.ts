import {ChangeDetectionStrategy, Component} from '@angular/core';
import {RouterLink, RouterLinkActive, RouterOutlet} from '@angular/router';

/**
 * Coquille de la démo : trois niveaux d'usage de ng-table, un par route.
 * Importe `@sbourahla/ng-table` depuis les SOURCES (paths du tsconfig racine) :
 * une modification de la lib est visible immédiatement, sans rebuild.
 */
@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host { display: block; max-width: 1500px; margin: 0 auto; padding: 24px 16px; }
    header { display: flex; flex-wrap: wrap; gap: 12px 24px; align-items: center; justify-content: space-between; margin-bottom: 16px; }
    h1 { margin: 0; font-size: 1.6rem; }
    nav { display: flex; gap: 4px; padding: 4px; background: #fff; border: 1px solid rgba(15, 23, 42, .13); border-radius: 999px; }
    nav a { padding: 8px 18px; border-radius: 999px; color: #4f6573; text-decoration: none; font-weight: 500; }
    nav a small { display: block; font-size: .7rem; font-weight: 400; }
    nav a.active { background: #1d4f91; color: #fff; }
    nav a:focus-visible { outline: 2px solid #1d4f91; outline-offset: 2px; }
  `,
  template: `
    <header>
      <h1>ng-table — démo</h1>
      <nav aria-label="Mode de démonstration">
        @for (mode of modes; track mode.path) {
          <a [routerLink]="mode.path" routerLinkActive="active" ariaCurrentWhenActive="page">
            {{ mode.label }}<small>{{ mode.hint }}</small>
          </a>
        }
      </nav>
    </header>
    <router-outlet/>
  `,
})
export class AppComponent {
  protected readonly modes = [
    {path: '/simple', label: 'Simple', hint: 'le minimum'},
    {path: '/avance', label: 'Avancé', hint: 'toutes les options'},
    {path: '/expert', label: 'Expert', hint: 'serveur, contrôle, API'},
  ];
}
