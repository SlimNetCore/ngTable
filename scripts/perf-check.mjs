/**
 * Garde-fou de performance : rejoue la mesure du cache de colonnes (`column-store.performance.spec.ts`) et vérifie
 * des RAPPORTS entre deux temps de la même exécution, pas des temps absolus. Un rapport ne dépend presque pas de la
 * machine : « inverser un tri coûte moins de la moitié du premier tri » reste vrai sur un portable comme sur un
 * serveur d'intégration continue, alors qu'un seuil en millisecondes casserait au premier serveur lent.
 *
 * Usage : `node scripts/perf-check.mjs` (ou `npm run perf:check`). Code de sortie 1 si un budget est dépassé.
 * Les budgets sont dans `scripts/perf-budget.json`, larges par rapport aux mesures (bruit des machines partagées).
 */
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const budget = JSON.parse(readFileSync(join(root, 'scripts', 'perf-budget.json'), 'utf8'));

/** Lit les lignes `[perf] libellé : X ms sans cache, Y ms avec` de la sortie des tests. */
export function parseMeasures(output) {
  const measures = new Map();
  for (const line of output.split(/\r?\n/)) {
    const match = /\[perf\] (.+) : (\d+(?:\.\d+)?) ms sans cache, (\d+(?:\.\d+)?) ms avec/.exec(line);
    if (match) {
      measures.set(match[1].trim(), {without: Number(match[2]), with: Number(match[3])});
    }
  }
  return measures;
}

/** Vérifie chaque budget ; renvoie une ligne de rapport par budget et le nombre de dépassements. */
export function checkBudgets(measures, budgets) {
  const lines = [];
  let failures = 0;
  for (const entry of budgets) {
    const numerator = measures.get(entry.numerator.label)?.[entry.numerator.series];
    const denominator = measures.get(entry.denominator.label)?.[entry.denominator.series];
    if (numerator === undefined || denominator === undefined) {
      lines.push(`ÉCHEC  ${entry.name} : mesure introuvable (libellé changé dans le test ?)`);
      failures++;
      continue;
    }
    // Sous quelques millisecondes, l'horloge et le ramasse-miettes pèsent plus que le code mesuré.
    const ratio = numerator / Math.max(denominator, 1);
    const ok = ratio <= entry.maxRatio || numerator <= (entry.ignoreBelowMs ?? 0);
    lines.push(`${ok ? 'ok    ' : 'ÉCHEC '} ${entry.name} : ${numerator} ms / ${denominator} ms = ${ratio.toFixed(2)} (budget ${entry.maxRatio})`);
    failures += ok ? 0 : 1;
  }
  return {lines, failures};
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const run = spawnSync('npx', ['ng', 'test', 'ng-table', '--watch=false', '--include=**/column-store.performance.spec.ts'], {
    cwd: root,
    encoding: 'utf8',
    shell: true,
    env: {...process.env, PERF_ROWS: String(budget.rows)},
  });
  const output = `${run.stdout ?? ''}${run.stderr ?? ''}`;
  if (run.status !== 0) {
    console.error(output);
    console.error('perf-check : la mesure elle-même a échoué.');
    process.exit(1);
  }
  const {lines, failures} = checkBudgets(parseMeasures(output), budget.budgets);
  console.log(`Budgets de performance (${budget.rows.toLocaleString('fr-FR')} lignes, rapports dans une même exécution) :`);
  for (const line of lines) {
    console.log(`  ${line}`);
  }
  if (failures > 0) {
    console.error(`perf-check : ${failures} budget(s) dépassé(s).`);
    process.exit(1);
  }
}
