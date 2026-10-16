// Notes de version et journal des modifications, pour le workflow de publication.
//   node scripts/release-notes.mjs notes <version>   écrit sur la sortie standard les notes de la version
//                                                    (section « ## [x.y.z] », à défaut « ## [Non publié] »)
//   node scripts/release-notes.mjs stamp <version>   date la section « Non publié » : elle devient « ## [x.y.z] — date »
//                                                    et une section « Non publié » vide est recréée au-dessus
import {readFileSync, writeFileSync} from 'node:fs';

const [command, version] = process.argv.slice(2);
if (!['notes', 'stamp'].includes(command) || !version) {
  console.error('Usage : node scripts/release-notes.mjs notes|stamp <version>');
  process.exit(2);
}

const file = 'CHANGELOG.md';
const text = readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
const lines = text.split('\n');
const headingIndex = (predicate) => lines.findIndex((line) => /^## \[/.test(line) && predicate(line));
const sectionOf = (start) => {
  const end = lines.findIndex((line, index) => index > start && /^## \[/.test(line));
  return lines.slice(start + 1, end === -1 ? lines.length : end).join('\n').trim();
};

const released = headingIndex((line) => line.startsWith(`## [${version}]`));
const pending = headingIndex((line) => line.startsWith('## [Non publié]'));

if (command === 'notes') {
  const start = released !== -1 ? released : pending;
  process.stdout.write(start === -1 ? '' : sectionOf(start) + '\n');
} else if (released !== -1) {
  console.log(`CHANGELOG : la version ${version} y figure déjà, rien à dater.`);
} else if (pending === -1 || !sectionOf(pending)) {
  console.log('CHANGELOG : section « Non publié » absente ou vide, rien à dater.');
} else {
  const date = new Date().toISOString().slice(0, 10);
  lines.splice(pending + 1, 0, '', `## [${version}] — ${date}`);
  writeFileSync(file, lines.join('\n'));
  console.log(`CHANGELOG : « Non publié » daté ${version} — ${date}.`);
}
