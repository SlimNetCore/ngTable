import {NgTableRemoteQuery} from '@sbourahla/ng-table';
import {Commande, generateCommandes, STATUT_LABELS} from './demo-data';

export interface CommandesPage {
  rows: Commande[];
  total: number;
}

const normalize = (value: unknown) => `${value ?? ''}`.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** Bornes `min..max` (chacune optionnelle) d'un filtre de plage. */
function range(value: string): [string, string] {
  const [min = '', max = ''] = value.split('..', 2);
  return [min.trim(), max.trim()];
}

/**
 * Faux serveur, pour le mode expert : il reçoit exactement ce qu'émet
 * `(remoteQueryChange)` et renvoie une page de résultats après une latence réseau
 * simulée. C'est ce que ferait votre API : filtrer, trier, paginer côté serveur.
 */
export class FakeCommandesApi {
  private readonly data = generateCommandes(2000);

  query(query: NgTableRemoteQuery, latencyMs = 450): Promise<CommandesPage> {
    return new Promise((resolve) => setTimeout(() => resolve(this.run(query)), latencyMs));
  }

  /** Nombre de lignes qu'exporterait le serveur pour cette requête (toutes pages confondues). */
  count(query: NgTableRemoteQuery): number {
    return this.filter(query).length;
  }

  private run(query: NgTableRemoteQuery): CommandesPage {
    const filtered = this.filter(query);
    const sorts = query.sorts?.length ? query.sorts : query.sort.columnId ? [query.sort] : [];
    const sorted = [...filtered].sort((a, b) => {
      for (const sort of sorts) {
        const left = a[sort.columnId as keyof Commande];
        const right = b[sort.columnId as keyof Commande];
        const result = left < right ? -1 : left > right ? 1 : 0;
        if (result !== 0) {
          return sort.direction === 'desc' ? -result : result;
        }
      }
      return 0;
    });
    const {index, size} = query.page;
    return {rows: size > 0 ? sorted.slice(index * size, (index + 1) * size) : sorted, total: filtered.length};
  }

  private filter(query: NgTableRemoteQuery): Commande[] {
    const f = query.filters;
    const terms = normalize(query.search).split(/\s+/).filter(Boolean);
    return this.data.filter((c) => {
      if (f['reference'] && !normalize(c.reference).includes(normalize(f['reference']))) {
        return false;
      }
      if (f['client'] && !f['client'].split(',').includes(c.client)) {
        return false;
      }
      if (f['statut'] && !f['statut'].split(',').includes(c.statut)) {
        return false;
      }
      if (f['montant']) {
        const [min, max] = range(f['montant']);
        if ((min && c.montant < Number(min)) || (max && c.montant > Number(max))) {
          return false;
        }
      }
      if (f['dateCommande']) {
        const [from, to] = range(f['dateCommande']);
        if ((from && c.dateCommande < from) || (to && c.dateCommande > to)) {
          return false;
        }
      }
      if (f['urgent'] && String(c.urgent) !== f['urgent']) {
        return false;
      }
      if (terms.length > 0) {
        const haystack = normalize([c.reference, c.client, STATUT_LABELS[c.statut], c.description].join(' '));
        return terms.every((term) => haystack.includes(term));
      }
      return true;
    });
  }
}
