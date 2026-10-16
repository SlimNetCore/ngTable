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
  /** Six valeurs par commande : de quoi tracer un mini-graphique (sparkline). */
  tendance?: number[];
}

/** Mêmes valeurs que `CommandeDto.tendance` côté Spring Boot, tirées de l'identifiant (1, 2, 3…). */
export const tendanceOf = (id: number): number[] => Array.from({length: 6}, (_, month) => (((id + 2) * (month + 2) * 7919) % 90) + 10);

export const CLIENTS = ['Dupont SA', 'Martin SARL', 'Bernard & Fils', 'Petit Commerce', 'Leroy Industries', 'Moreau Logistique'];

export const STATUT_LABELS: Record<CommandeStatut, string> = {
  BROUILLON: 'Brouillon',
  VALIDEE: 'Validée',
  EXPEDIEE: 'Expédiée',
  ANNULEE: 'Annulée',
};

export const STATUT_OPTIONS = Object.entries(STATUT_LABELS).map(([value, label]) => ({value, label}));

const STATUTS = Object.keys(STATUT_LABELS) as CommandeStatut[];
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
      tendance: tendanceOf(i + 1),
    });
  }
  return rows;
}
