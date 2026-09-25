import {NgTableGroupSummary, NgTableRemoteQuery} from '@sbourahla/ng-table';
import {CLIENTS, Commande, CommandeStatut, STATUT_LABELS} from './demo-data';

export interface CommandesPage {
  rows: Commande[];
  total: number;
  /** Regroupement demandé : tous les groupes, dans l'ordre, avec compte et somme des montants. */
  groupSummaries: NgTableGroupSummary[] | null;
  /** Temps de calcul du « serveur » (filtre + tri + résumés + page), hors latence réseau simulée. */
  serverMs: number;
}

/** Ce que la démo attend d'un serveur : le faux (dans le navigateur) ou le vrai (Spring Boot). */
export interface CommandesBackend {
  query(query: NgTableRemoteQuery): Promise<CommandesPage>;
  /** Nombre de lignes qu'exporterait le serveur pour cette requête (toutes pages confondues). */
  count(query: NgTableRemoteQuery): Promise<number>;
}

const STATUTS = Object.keys(STATUT_LABELS) as CommandeStatut[];
const DESCRIPTIONS = [
  'Livraison standard',
  'Commande groupée pour plusieurs entrepôts, avec une remise négociée sur les volumes du trimestre et une livraison fractionnée',
  'Réassort',
  'Commande urgente passée en fin de journée, à traiter en priorité par l’équipe logistique',
];

const normalize = (value: unknown) => `${value ?? ''}`.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** Rang alphabétique de chaque valeur d'une petite liste (tri sans comparer de chaînes). */
function ranks(values: readonly string[]): number[] {
  const sorted = [...values].sort((a, b) => a.localeCompare(b, 'fr'));
  return values.map((value) => sorted.indexOf(value));
}

const CLIENT_RANK = ranks(CLIENTS);
const STATUT_RANK = ranks(STATUTS);
const DESCRIPTION_RANK = ranks(DESCRIPTIONS);
const NORMALIZED_CLIENTS = CLIENTS.map(normalize);
const NORMALIZED_STATUTS = STATUTS.map((statut) => normalize(STATUT_LABELS[statut]));
const NORMALIZED_DESCRIPTIONS = DESCRIPTIONS.map(normalize);

// Les champs d'une commande se calculent depuis son index : le « serveur » n'a rien à
// stocker par ligne, même pour 1 000 000 de commandes (mêmes formules que `generateCommandes`).
const montantOf = (i: number) => Math.round(((i * 7919) % 100000) + 50) / 10;
const monthOf = (i: number) => (i % 12) + 1;
const dayOf = (i: number) => (i % 28) + 1;
const dateOf = (i: number) => `2026-${String(monthOf(i)).padStart(2, '0')}-${String(dayOf(i)).padStart(2, '0')}`;
const referenceOf = (i: number) => `CMD-${String(i + 1).padStart(7, '0')}`;

/** Clé de tri numérique d'une colonne pour la commande `i` (évite les comparaisons de chaînes). */
function sortKey(column: string, i: number): number {
  switch (column) {
    case 'client':
      return CLIENT_RANK[i % CLIENTS.length];
    case 'statut':
      return STATUT_RANK[i % STATUTS.length];
    case 'montant':
      return montantOf(i);
    case 'dateCommande':
      return monthOf(i) * 100 + dayOf(i);
    case 'urgent':
      return i % 5 === 0 ? 1 : 0;
    case 'description':
      return DESCRIPTION_RANK[i % DESCRIPTIONS.length];
    default:
      return i; // référence : l'ordre des index
  }
}

/** Valeur de regroupement (texte, comme `NgTableGroupSummary.key`) de la commande `i`. */
function groupKey(column: string, i: number): string {
  switch (column) {
    case 'client':
      return CLIENTS[i % CLIENTS.length];
    case 'statut':
      return STATUTS[i % STATUTS.length];
    case 'dateCommande':
      return dateOf(i);
    case 'urgent':
      return String(i % 5 === 0);
    case 'montant':
      return String(montantOf(i));
    case 'description':
      return DESCRIPTIONS[i % DESCRIPTIONS.length];
    default:
      return referenceOf(i);
  }
}

/** Bornes `min..max` (chacune optionnelle) d'un filtre de plage. */
function range(value: string): [string, string] {
  const [min = '', max = ''] = value.split('..', 2);
  return [min.trim(), max.trim()];
}

interface QueryResult {
  /** Index des commandes correspondantes, triés, groupes repliés exclus. */
  indices: Uint32Array;
  groupSummaries: NgTableGroupSummary[] | null;
}

/**
 * Faux serveur pour le mode expert, qui fonctionne comme une base de données : il
 * reçoit exactement ce qu'émet `(remoteQueryChange)`, filtre, trie, regroupe et
 * renvoie une page, après une latence réseau simulée. Le résultat trié d'une requête
 * est mis en cache : changer de page ne recalcule rien (comme un curseur côté serveur).
 */
export class FakeCommandesApi implements CommandesBackend {
  private readonly cache = new Map<string, QueryResult>();

  constructor(readonly size = 2000) {}

  query(query: NgTableRemoteQuery, latencyMs = 150): Promise<CommandesPage> {
    const started = performance.now();
    const result = this.resolve(query);
    const {index, size} = query.page;
    const pageIndices = size > 0 ? result.indices.subarray(index * size, (index + 1) * size) : result.indices;
    const page: CommandesPage = {
      rows: Array.from(pageIndices, (i) => this.commande(i)),
      total: result.indices.length,
      groupSummaries: result.groupSummaries,
      serverMs: performance.now() - started,
    };
    return new Promise((resolve) => setTimeout(() => resolve(page), latencyMs));
  }

  /** Nombre de lignes qu'exporterait le serveur pour cette requête (toutes pages confondues). */
  count(query: NgTableRemoteQuery): Promise<number> {
    return Promise.resolve(this.resolve({...query, collapsedGroups: []}).indices.length);
  }

  private commande(i: number): Commande {
    return {
      id: `${i + 1}`,
      reference: referenceOf(i),
      client: CLIENTS[i % CLIENTS.length],
      statut: STATUTS[i % STATUTS.length],
      montant: montantOf(i),
      dateCommande: dateOf(i),
      urgent: i % 5 === 0,
      description: DESCRIPTIONS[i % DESCRIPTIONS.length],
    };
  }

  private resolve(query: NgTableRemoteQuery): QueryResult {
    const signature = JSON.stringify([query.filters, query.search, query.sorts ?? query.sort, query.groupBy, query.collapsedGroups]);
    let result = this.cache.get(signature);
    if (!result) {
      result = this.compute(query);
      if (this.cache.size > 20) {
        this.cache.clear();
      }
      this.cache.set(signature, result);
    }
    return result;
  }

  private compute(query: NgTableRemoteQuery): QueryResult {
    const matches = this.filter(query);

    // Tri : d'abord par la colonne de regroupement (dans le sens demandé sur elle), puis par les tris.
    const requested = query.sorts?.length ? query.sorts : query.sort.columnId ? [query.sort] : [];
    const groupBy = query.groupBy ?? null;
    const sorts = groupBy
      ? [requested.find((sort) => sort.columnId === groupBy) ?? {columnId: groupBy, direction: 'asc' as const},
        ...requested.filter((sort) => sort.columnId !== groupBy)]
      : requested;
    let sorted = matches;
    if (sorts.length > 0) {
      // Clés précalculées en tableaux typés : le tri ne fait que comparer des nombres.
      const keys = sorts.map((sort) => Float64Array.from(matches, (i) => sortKey(sort.columnId, i)));
      const factors = sorts.map((sort) => (sort.direction === 'desc' ? -1 : 1));
      const order = new Uint32Array(matches.length).map((_, position) => position);
      order.sort((a, b) => {
        for (let level = 0; level < keys.length; level++) {
          const diff = keys[level][a] - keys[level][b];
          if (diff !== 0) {
            return diff * factors[level];
          }
        }
        return a - b;
      });
      sorted = Uint32Array.from(order, (position) => matches[position]);
    }

    if (!groupBy) {
      return {indices: sorted, groupSummaries: null};
    }

    // Résumés de TOUS les groupes (repliés compris), dans l'ordre du tri : un GROUP BY.
    const summaries = new Map<string, { key: string; count: number; aggregates: { montant: number } }>();
    for (const i of sorted) {
      const key = groupKey(groupBy, i);
      let summary = summaries.get(key);
      if (!summary) {
        summary = {key, count: 0, aggregates: {montant: 0}};
        summaries.set(key, summary);
      }
      summary.count++;
      summary.aggregates.montant += montantOf(i);
    }
    const collapsed = new Set(query.collapsedGroups ?? []);
    const indices = collapsed.size > 0 ? sorted.filter((i) => !collapsed.has(groupKey(groupBy, i))) : sorted;
    return {indices, groupSummaries: [...summaries.values()]};
  }

  private filter(query: NgTableRemoteQuery): Uint32Array {
    const f = query.filters;
    const reference = f['reference'] ? normalize(f['reference']) : '';
    const clients = f['client'] ? new Set(f['client'].split(',')) : null;
    const statuts = f['statut'] ? new Set(f['statut'].split(',')) : null;
    const [montantMin, montantMax] = f['montant'] ? range(f['montant']).map((v) => (v ? Number(v) : null)) : [null, null];
    const [dateFrom, dateTo] = f['dateCommande'] ? range(f['dateCommande']) : ['', ''];
    const urgent = f['urgent'] || '';
    const terms = normalize(query.search).split(/\s+/).filter(Boolean);

    const result = new Uint32Array(this.size);
    let count = 0;
    for (let i = 0; i < this.size; i++) {
      if (reference && !normalize(referenceOf(i)).includes(reference)) continue;
      if (clients && !clients.has(CLIENTS[i % CLIENTS.length])) continue;
      if (statuts && !statuts.has(STATUTS[i % STATUTS.length])) continue;
      if (montantMin !== null && montantOf(i) < montantMin) continue;
      if (montantMax !== null && montantOf(i) > montantMax) continue;
      if (dateFrom && dateOf(i) < dateFrom) continue;
      if (dateTo && dateOf(i) > dateTo) continue;
      if (urgent && String(i % 5 === 0) !== urgent) continue;
      if (terms.length > 0) {
        const haystack = `${normalize(referenceOf(i))} ${NORMALIZED_CLIENTS[i % CLIENTS.length]} ${NORMALIZED_STATUTS[i % STATUTS.length]} ${NORMALIZED_DESCRIPTIONS[i % DESCRIPTIONS.length]}`;
        if (!terms.every((term) => haystack.includes(term))) continue;
      }
      result[count++] = i;
    }
    return result.slice(0, count);
  }
}
