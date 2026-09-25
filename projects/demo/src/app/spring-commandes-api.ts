import {NgTableRemoteQuery} from '@sbourahla/ng-table';
import {CommandesBackend, CommandesPage} from './fake-commandes-api';

/** URL du backend : `/api` est relayé vers http://localhost:8080 par `proxy.conf.json` (`npm start`). */
const SEARCH_URL = '/api/commandes/search';

/**
 * Vrai serveur : le backend Spring Boot de `examples/spring-boot-backend`. Il reçoit
 * exactement ce qu'émet `(remoteQueryChange)` et renvoie `{rows, total, groupSummaries}`.
 */
export class SpringCommandesApi implements CommandesBackend {
  async query(query: NgTableRemoteQuery): Promise<CommandesPage> {
    const started = performance.now();
    const page = await post<Omit<CommandesPage, 'serverMs'>>(query);
    // Aller-retour HTTP complet (le serveur ne renvoie pas son propre temps de calcul).
    return {...page, serverMs: performance.now() - started};
  }

  async count(query: NgTableRemoteQuery): Promise<number> {
    // Même requête, une seule ligne demandée : seul `total` nous intéresse.
    const page = await post<{total: number}>({...query, collapsedGroups: [], page: {index: 0, size: 1}});
    return page.total;
  }
}

async function post<T>(query: NgTableRemoteQuery): Promise<T> {
  let response: Response;
  try {
    response = await fetch(SEARCH_URL, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(query)});
  } catch {
    throw new Error('backend Spring Boot injoignable');
  }
  if (response.status === 502 || response.status === 503 || response.status === 504) {
    throw new Error('backend Spring Boot injoignable'); // réponse du proxy de `npm start`
  }
  if (!response.ok) {
    const message = await response.text();
    throw new Error(response.status === 400 ? message : `HTTP ${response.status}`);
  }
  return (await response.json()) as T;
}
