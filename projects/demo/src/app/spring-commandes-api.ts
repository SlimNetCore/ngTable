import {NgTableRemoteExportRequest, NgTableRemoteQuery} from '@sbourahla/ng-table';
import {CommandesBackend, CommandesPage} from './fake-commandes-api';

/** URL du backend : `/api` est relayé vers http://localhost:8080 par `proxy.conf.json` (`npm start`). */
const SEARCH_URL = '/api/commandes/search';
const EXPORT_URL = '/api/commandes/export';

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

  /**
   * Le serveur génère le fichier (toutes les lignes de la requête, colonnes affichées) ;
   * le navigateur le télécharge sous le nom donné par `Content-Disposition`.
   */
  async export(request: NgTableRemoteExportRequest): Promise<string> {
    const response = await send(EXPORT_URL, request);
    const file = await response.blob();
    const filename = /filename="?([^";]+)"?/.exec(response.headers.get('Content-Disposition') ?? '')?.[1]
      ?? `${request.filename}.${request.format}`;
    download(file, filename);
    return `Export Spring Boot : ${filename} téléchargé (${response.headers.get('X-Export-Rows') ?? '?'} ligne(s)).`;
  }
}

async function post<T>(query: NgTableRemoteQuery): Promise<T> {
  return (await (await send(SEARCH_URL, query)).json()) as T;
}

async function send(url: string, body: unknown): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(url, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)});
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
  return response;
}

function download(file: Blob, filename: string): void {
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
