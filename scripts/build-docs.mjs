// Site de documentation statique de ng-table, généré depuis README.md, CHANGELOG.md et ROADMAP.md, sans dépendance.
//
//   node scripts/build-docs.mjs [dossier de sortie]      défaut : dist/docs
//
// Le README est découpé en pages : une par section de niveau 2, et une par étape du tutoriel. Le site a une barre latérale
// groupée, un sommaire par page, une recherche plein texte (index JSON chargé à la demande), la coloration du code, un
// thème clair / sombre et une page précédente / suivante.
import {copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {escapeHtml, plainText, renderMarkdown, slugify} from './docs/markdown.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, process.argv[2] ?? 'dist/docs');
const read = (name) => readFileSync(join(root, name), 'utf8').replace(/^﻿/, '').replace(/\r\n/g, '\n');
const pkg = JSON.parse(readFileSync(join(root, 'projects/ng-table/package.json'), 'utf8'));
const repository = (pkg.homepage ?? '').replace(/#readme$/, '') || 'https://github.com/SlimNetCore/ngTable';

/** Titre sans emoji ni symbole de tête. */
const cleanTitle = (title) => plainText(title.replace(/^[^\p{L}\p{N}`]+/u, ''));

/** Remonte ou descend les niveaux de titres d'un Markdown, hors blocs de code. */
function shiftHeadings(markdown, delta) {
  let fence = null;
  return markdown
    .split('\n')
    .map((line) => {
      const marks = /^\s*(`{3,}|~{3,})/.exec(line);
      if (marks) {
        fence = fence === null ? marks[1][0] : marks[1][0] === fence ? null : fence;
        return line;
      }
      if (fence) return line;
      const heading = /^(#{1,6})(\s.*)$/.exec(line);
      return heading ? `${'#'.repeat(Math.min(6, Math.max(1, heading[1].length + delta)))}${heading[2]}` : line;
    })
    .join('\n');
}

/** Découpe un Markdown en {title, body} selon les titres du niveau donné (hors blocs de code). */
function splitSections(markdown, level) {
  const marker = new RegExp(`^${'#'.repeat(level)}\\s+(.*)$`);
  const lines = markdown.split('\n');
  const sections = [{title: null, lines: []}];
  let fence = null;
  for (const line of lines) {
    const marks = /^\s*(`{3,}|~{3,})/.exec(line);
    if (marks) fence = fence === null ? marks[1][0] : marks[1][0] === fence ? null : fence;
    const match = fence ? null : marker.exec(line);
    if (match) {
      sections.push({title: match[1].trim(), lines: [line]});
    } else {
      sections.at(-1).lines.push(line);
    }
  }
  return sections.map((section) => ({title: section.title, body: section.lines.join('\n').trim()}));
}

// ---------------------------------------------------------------------------------------------- pages
const GROUPS = [
  {id: 'start', label: 'Démarrer', match: /Installation|Quick Start|Fonctionnalités|Typage|Pattern contrôlé/},
  {id: 'tutorial', label: 'Tutoriel', match: /^Tutoriel/},
  {id: 'guides', label: 'Guides', match: /Mode local \/ distant|Pagination|Vues sauvegardées|Ordre des colonnes|Ligne détail|Sélection de lignes|Menu contextuel|Copie de cellule|Filtres : menu|Responsive|Accessibilité|État dans l'URL|Tester votre table/},
  {id: 'reference', label: 'Référence', match: /Référence API|Personnaliser les textes|Personnaliser le style/},
  {id: 'project', label: 'Projet', match: /Migrer|Points d'attention|Développement|Licence/},
];

const readme = read('README.md');
const [intro, ...sections] = splitSections(readme, 2);
const pages = [];
const usedSlugs = new Set(['index', 'search-index']);
const slugFor = (title) => {
  const base = slugify(cleanTitle(title)).replace(/-+/g, '-').slice(0, 70) || 'page';
  let slug = base;
  for (let n = 2; usedSlugs.has(slug); n++) slug = `${base}-${n}`;
  usedSlugs.add(slug);
  return slug;
};

for (const section of sections) {
  const group = GROUPS.find((candidate) => candidate.match.test(section.title)) ?? GROUPS[3];
  if (group.id === 'tutorial') {
    const [overview, ...steps] = splitSections(section.body, 3);
    pages.push({slug: slugFor('tutoriel'), title: 'Tutoriel pas à pas', nav: 'Présentation', group: group.id, markdown: shiftHeadings(overview.body, -1)});
    for (const step of steps) {
      pages.push({slug: slugFor(step.title), title: cleanTitle(step.title), nav: cleanTitle(step.title), group: group.id, markdown: shiftHeadings(step.body, -2)});
    }
  } else {
    pages.push({slug: slugFor(section.title), title: cleanTitle(section.title), nav: cleanTitle(section.title), group: group.id, markdown: shiftHeadings(section.body, -1)});
  }
}
pages.push({slug: slugFor('Journal des modifications'), title: 'Journal des modifications', nav: 'Journal des modifications', group: 'project', markdown: shiftHeadings(read('CHANGELOG.md'), 0).replace(/^# .*\n/, '# Journal des modifications\n')});
pages.push({slug: slugFor('Feuille de route'), title: 'Feuille de route', nav: 'Feuille de route', group: 'project', markdown: read('ROADMAP.md')});

// ---------------------------------------------------------------------------------------------- rendu
const idOwner = new Map(); // identifiant de titre → première page qui le porte
for (const page of pages) {
  const seen = new Set();
  page.headings = [];
  page.html = renderMarkdown(page.markdown, {
    headings: page.headings,
    uniqueId: (id) => {
      let unique = id || 'section';
      for (let n = 2; seen.has(unique); n++) unique = `${id}-${n}`;
      seen.add(unique);
      return unique;
    },
  });
  for (const heading of page.headings) {
    if (!idOwner.has(heading.id)) idOwner.set(heading.id, page.slug);
  }
}
const pageBySlug = new Map(pages.map((page) => [page.slug, page]));

/** Les liens `#ancre` du README visent une section : ils pointent vers la page qui la porte. */
function fixLinks(html, page) {
  const own = new Set(page.headings.map((heading) => heading.id));
  return html.replace(/href="#([^"]+)"/g, (whole, id) => {
    if (own.has(id) || id === 'content') return whole;
    const owner = idOwner.get(id);
    return owner ? `href="${owner}.html#${id}"` : whole;
  });
}

// ---------------------------------------------------------------------------------------------- gabarit
const ICONS = {
  logo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3"/><path d="M3 9.5h18M9.5 9.5V20"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.3"/><path d="M15.5 15.5l4.5 4.5"/></svg>',
  theme: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>',
  menu: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
  github: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 19c-4 1.2-4-2-6-2.5M15 21v-3.2c0-1 .1-1.4-.5-2 2.7-.3 5.5-1.3 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.3 4.3 0 0 0-.1-3.2s-1-.3-3.4 1.3a11.700 11.700 0 0 0-6.200 0C6.600 3.100 5.600 3.400 5.600 3.400a4.300 4.300 0 0 0-.1 3.200A4.600 4.600 0 0 0 4.200 9.800c0 4.600 2.800 5.700 5.500 6-.6.6-.6 1.200-.5 2V21"/></svg>',
};

function sidebar(current) {
  const link = (page) => `<li><a href="${page.slug}.html"${page === current ? ' aria-current="page"' : ''}>${escapeHtml(page.nav)}</a></li>`;
  return GROUPS.map((group) => {
    const items = pages.filter((page) => page.group === group.id);
    if (items.length === 0) return '';
    if (group.id === 'tutorial') {
      const open = items.includes(current) ? ' open' : '';
      return `<h2>${group.label}</h2><details${open}><summary>${items.length} étapes</summary><ul>${items.map(link).join('')}</ul></details>`;
    }
    const generated = group.id === 'reference' ? '<li><a href="api/index.html">Référence générée (TypeDoc)</a></li>' : '';
    const live = group.id === 'start' ? '<li><a href="demo/index.html">Démo en ligne (bac à sable)</a></li>' : '';
    return `<h2>${group.label}</h2><ul>${items.map(link).join('')}${live}${generated}</ul>`;
  }).join('');
}

function toc(page) {
  const entries = page.headings.filter((heading) => heading.level >= 2 && heading.level <= 3);
  if (entries.length < 2) return '';
  return `<nav class="toc" aria-label="Sur cette page"><h2>Sur cette page</h2>${entries
    .map((heading) => `<a${heading.level === 3 ? ' class="sub"' : ''} href="#${heading.id}">${escapeHtml(heading.text)}</a>`)
    .join('')}</nav>`;
}

function layout({page, content, isHome = false}) {
  const index = pages.indexOf(page);
  const previous = !isHome && index > 0 ? pages[index - 1] : null;
  const next = !isHome && index >= 0 && index < pages.length - 1 ? pages[index + 1] : null;
  const pager =
    previous || next
      ? `<nav class="pager" aria-label="Pages voisines">${previous ? `<a href="${previous.slug}.html"><small>Précédent</small>${escapeHtml(previous.title)}</a>` : '<span></span>'}${next ? `<a href="${next.slug}.html"><small>Suivant</small>${escapeHtml(next.title)}</a>` : ''}</nav>`
      : '';
  const title = isHome ? `${pkg.name} — documentation` : `${page.title} — ${pkg.name}`;
  return `<!doctype html>
<html lang="fr" data-base="" data-theme="light">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(pkg.description ?? '')}"/>
<link rel="icon" href="favicon.svg" type="image/svg+xml"/>
<link rel="stylesheet" href="style.css"/>
<script>try{var t=localStorage.getItem('ngt-docs-theme');document.documentElement.setAttribute('data-theme',t||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'))}catch(e){}</script>
</head>
<body>
<header class="topbar">
  <button class="icon-button menu-button" type="button" data-menu-toggle aria-label="Menu">${ICONS.menu}</button>
  <a class="brand" href="index.html">${ICONS.logo}<span>ng-table</span><small>v${escapeHtml(pkg.version)}</small></a>
  <div class="spacer"></div>
  <div class="search" role="search">${ICONS.search}<input type="search" placeholder="Rechercher (/)" aria-label="Rechercher dans la documentation" autocomplete="off"/><div class="results" hidden></div></div>
  <a class="icon-button" href="${escapeHtml(repository)}" aria-label="Dépôt GitHub">${ICONS.github}</a>
  <button class="icon-button" type="button" data-theme-toggle aria-label="Changer de thème">${ICONS.theme}</button>
</header>
<div class="layout">
  <aside class="sidebar" aria-label="Navigation">${sidebar(page)}</aside>
  <main id="content"><article>${content}${pager}</article></main>
  ${isHome ? '' : toc(page)}
</div>
<script src="app.js" defer></script>
</body>
</html>
`;
}

// ---------------------------------------------------------------------------------------------- accueil
const introBody = intro.body
  .replace(/^# .*\n/, '')
  .split('\n')
  .filter((line) => !/^\[!\[/.test(line) && !/^!\[/.test(line))
  .join('\n')
  .trim();
const homeCards = [
  ['Démarrer', 'start', 'Installation, premier tableau, pattern contrôlé.'],
  ['Tutoriel pas à pas', 'tutorial', 'Toutes les options, étape par étape.'],
  ['Guides', 'guides', 'Mode distant, vues, accessibilité, URL, tests.'],
  ['Référence API', 'reference', 'Entrées, sorties, colonnes, textes, thème.'],
  ['Journal des modifications', 'project', 'Ce qui change à chaque version.'],
  ['Feuille de route', 'project', 'Ce qui est fait et ce qui vient.'],
];
const firstOf = (groupId, title) => pages.find((page) => page.group === groupId && (!title || page.title === title || page.nav === title)) ?? pages.find((page) => page.group === groupId);
const cards = homeCards
  .map(([title, group, text]) => {
    const target = firstOf(group, title === 'Tutoriel pas à pas' ? title : title === 'Référence API' ? 'Référence API' : title === 'Démarrer' ? 'Installation' : title);
    return `<a class="card" href="${target.slug}.html"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(text)}</span></a>`;
  })
  .join('');
const highlights = [
  ['Tri, filtres, recherche', 'Filtres par colonne dont le filtre par ensemble de valeurs, recherche globale, tri multi-colonnes.'],
  ['1 000 000 de lignes', 'Défilement virtuel, tri par base, pipeline incrémental et calcul en Web Worker.'],
  ['Regroupement et pivot', 'Groupes multi-niveaux avec panneau, totaux, tableau croisé dynamique et graphiques.'],
  ['Sans Angular Material', 'Composants et thème (jetons CSS, sombre) propres à la bibliothèque, sur le CDK.'],
  ['Export Excel stylé', 'En-têtes colorés, vraies dates, formats, filtre automatique, sans dépendance.'],
  ['Édition et live', 'Édition de cellules, lignes épinglées, transactions et flux temps réel.'],
];
const homeHtml =
  `<section class="hero"><h1>${escapeHtml(pkg.name)}</h1>${renderMarkdown(introBody.split('\n\n').slice(0, 1).join('\n\n'))}` +
  `<div class="actions"><a class="button primary" href="${firstOf('start', 'Installation').slug}.html">Commencer</a>` +
  `<a class="button" href="${firstOf('tutorial').slug}.html">Parcourir le tutoriel</a><a class="button" href="${escapeHtml(repository)}">GitHub</a></div></section>` +
  `<div class="cards">${highlights.map(([title, text]) => `<div class="card"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(text)}</span></div>`).join('')}</div>` +
  `<h2>Explorer la documentation</h2><div class="cards">${cards}</div>` +
  renderMarkdown(introBody.split('\n\n').slice(1).join('\n\n'));

// ---------------------------------------------------------------------------------------------- recherche
function searchEntries(page) {
  const entries = [];
  let current = {title: page.title, id: '', level: 1, text: []};
  let fence = false;
  const flush = () => {
    const text = current.text.join(' ').replace(/\s+/g, ' ').trim();
    entries.push({title: current.title, page: page.title, url: `${page.slug}.html${current.id ? `#${current.id}` : ''}`, level: current.level, text: text.slice(0, 8000)});
  };
  let headingIndex = 0;
  for (const line of page.markdown.split('\n')) {
    if (/^\s*(`{3,}|~{3,})/.test(line)) {
      fence = !fence;
      continue;
    }
    const heading = !fence && /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      flush();
      const known = page.headings[headingIndex++];
      current = {title: known?.text ?? plainText(heading[2]), id: known?.id ?? '', level: heading[1].length, text: []};
      continue;
    }
    current.text.push(fence ? line : plainText(line));
  }
  flush();
  return entries.filter((entry) => entry.text || entry.level <= 2);
}

// ---------------------------------------------------------------------------------------------- écriture
rmSync(out, {recursive: true, force: true});
mkdirSync(out, {recursive: true});
const home = {slug: 'index', title: 'Accueil', headings: []};
writeFileSync(join(out, 'index.html'), layout({page: home, content: homeHtml, isHome: true}));
for (const page of pages) {
  writeFileSync(join(out, `${page.slug}.html`), layout({page, content: fixLinks(page.html, page)}));
}
writeFileSync(join(out, 'search-index.json'), JSON.stringify([{title: 'Accueil', page: 'Accueil', url: 'index.html', level: 1, text: plainText(introBody).slice(0, 1200)}, ...pages.flatMap(searchEntries)]));
copyFileSync(join(root, 'scripts/docs/style.css'), join(out, 'style.css'));
copyFileSync(join(root, 'scripts/docs/app.js'), join(out, 'app.js'));
writeFileSync(
  join(out, 'favicon.svg'),
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#2f6fa8" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="3"/><path d="M3 9.5h18M9.5 9.5V20"/></svg>',
);
writeFileSync(join(out, '.nojekyll'), '');
console.log(`Documentation : ${pages.length + 1} pages dans ${out}`);
