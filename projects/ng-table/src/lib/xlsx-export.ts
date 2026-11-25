/**
 * Écriture des classeurs Excel, regroupée dans un module chargé à la demande : la table ne l'importe qu'au premier
 * export en `.xlsx` (`import('./xlsx-export')`). Une application qui n'exporte jamais en Excel ne le télécharge pas.
 */
export {toXlsx} from './export-writers';
export {toStyledXlsx} from './xlsx-styled';
