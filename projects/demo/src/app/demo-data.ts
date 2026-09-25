export type CommandeStatut = 'BROUILLON' | 'VALIDEE' | 'EXPEDIEE' | 'ANNULEE';

export interface Commande {
  id: string;
  reference: string;
  client: string;
  statut: CommandeStatut;
  montant: number;
  dateCommande: string;
  urgent: boolean;
  description: string;
}

const CLIENTS = ['Dupont SA', 'Martin SARL', 'Bernard & Fils', 'Petit Commerce', 'Leroy Industries', 'Moreau Logistique'];
const STATUTS: CommandeStatut[] = ['BROUILLON', 'VALIDEE', 'EXPEDIEE', 'ANNULEE'];
const DESCRIPTIONS = [
  'Livraison standard',
  'Commande groupée pour plusieurs entrepôts, avec une remise négociée sur les volumes du trimestre et une livraison fractionnée',
  'Réassort',
  'Commande urgente passée en fin de journée, à traiter en priorité par l’équipe logistique',
];

/** Jeu de données déterministe (même résultat à chaque appel), pour des démos reproductibles. */
export function generateCommandes(count: number): Commande[] {
  const rows: Commande[] = [];
  for (let i = 0; i < count; i++) {
    const day = (i % 28) + 1;
    const month = (i % 12) + 1;
    rows.push({
      id: `${i + 1}`,
      reference: `CMD-${String(i + 1).padStart(6, '0')}`,
      client: CLIENTS[i % CLIENTS.length],
      statut: STATUTS[i % STATUTS.length],
      montant: Math.round(((i * 7919) % 100000) + 50) / 10,
      dateCommande: `2026-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
      urgent: i % 5 === 0,
      description: DESCRIPTIONS[i % DESCRIPTIONS.length],
    });
  }
  return rows;
}
