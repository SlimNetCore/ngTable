import {NgTableRemoteExportRequest, NgTableRemoteQuery, PivotDatasource, PivotServerResult} from '@sbourahla/ng-table';
import {Commande} from './demo-data';
import {CommandePatch, CommandesBackend, CommandesPage} from './fake-commandes-api';

/** URL du backend : `/api` est relayé vers http://localhost:8080 par `proxy.conf.json` (`npm start`). */
const SEARCH_URL = '/api/commandes/search';
const EXPORT_URL = '/api/commandes/export';
const PIVOT_URL = '/api/commandes/pivot';
const COMMANDES_URL = '/api/commandes';
const DOSSIERS_URL = '/api/dossiers';
const QUOTES_URL = '/api/quotes';
/** Message d'erreur quand aucun backend ne répond. */
export const UNREACHABLE = 'backend Spring Boot injoignable';

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

  /** `PATCH /api/commandes/{id}` : le serveur valide (montant positif, statut connu...) et renvoie la ligne enregistrée. */
  async update(id: string, patch: CommandePatch): Promise<Commande> {
    const response = await send(`${COMMANDES_URL}/${encodeURIComponent(id)}`, patch, 'PATCH');
    return (await response.json()) as Commande;
  }
}

/** Pivot calculé par la base (`GROUP BY` JPA) : la requête de `<ng-table-pivot>` part telle quelle. */
export const springPivot: PivotDatasource = async (request, {signal}) => {
  const response = await send(PIVOT_URL, request, 'POST', signal);
  return (await response.json()) as PivotServerResult;
};

/** Arborescence à plat (chaque ligne donne son `parent`), pour `[treeParent]`. */
export interface Dossier {
  id: string;
  name: string;
  size: number;
  parent: string | null;
}

export async function fetchDossiers(): Promise<Dossier[]> {
  return (await (await get(DOSSIERS_URL)).json()) as Dossier[];
}

/** Une cotation, telle que la page « Live » l'affiche. */
export interface Quote {
  id: number;
  symbol: string;
  sector: string;
  open: number;
  price: number;
  change: number;
  volume: number;
  bid: number;
  ask: number;
  updatedAt: string;
}

/** État courant du marché simulé par le serveur : à charger avant d'ouvrir le flux. */
export async function fetchQuotes(size: number): Promise<Quote[]> {
  return (await (await get(`${QUOTES_URL}?size=${size}`)).json()) as Quote[];
}

/**
 * Ouvre le flux de transactions (`EventSource`, Server-Sent Events). `onTransaction` reçoit
 * `{update: [...]}` à chaque paquet ; la fonction renvoyée ferme le flux.
 */
export function openQuoteStream(
  size: number,
  rate: number,
  onTransaction: (transaction: { update: Quote[] }) => void,
  onError: (error: Error) => void,
): () => void {
  const source = new EventSource(`${QUOTES_URL}/stream?size=${size}&rate=${rate}`);
  source.addEventListener('transaction', (event) => onTransaction(JSON.parse((event as MessageEvent<string>).data) as { update: Quote[] }));
  source.onerror = () => onError(new Error(UNREACHABLE));
  return () => source.close();
}

async function post<T>(query: NgTableRemoteQuery): Promise<T> {
  return (await (await send(SEARCH_URL, query)).json()) as T;
}

async function get(url: string): Promise<Response> {
  return handle(url, () => fetch(url));
}

async function send(url: string, body: unknown, method = 'POST', signal?: AbortSignal): Promise<Response> {
  return handle(url, () => fetch(url, {method, headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body), signal}));
}

async function handle(url: string, request: () => Promise<Response>): Promise<Response> {
  let response: Response;
  try {
    response = await request();
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error; // requête annulée par la table : pas une panne du serveur
    }
    throw new Error(UNREACHABLE);
  }
  if (response.status === 502 || response.status === 503 || response.status === 504) {
    throw new Error(UNREACHABLE); // réponse du proxy de `npm start`
  }
  if (response.status === 404) {
    // Le backend répond, mais ne connaît pas cet endpoint : il a été lancé avant la mise à jour.
    throw new Error(`le backend Spring Boot lancé n'est pas à jour (${url} introuvable). Arrêtez-le, puis relancez-le après git pull`);
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
