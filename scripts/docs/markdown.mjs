// Convertisseur Markdown → HTML sans dépendance, pour le site de documentation. Il couvre ce que la documentation de
// ng-table utilise : titres, paragraphes, listes imbriquées, tableaux, blocs de code, citations, règles, HTML brut en bloc,
// et en ligne : code, liens, images, gras, italique, barré.
import {highlight} from './highlight.mjs';

export function escapeHtml(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Identifiant de titre façon GitHub : minuscules, sans ponctuation, espaces en tirets. */
export function slugify(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .trim()
    .replace(/\s+/g, '-');
}

/** Texte brut d'un fragment Markdown en ligne (pour les sommaires et la recherche). */
export function plainText(markdown) {
  return markdown
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[`*_~]/g, '')
    .replace(/<[^>]+>/g, '')
    .trim();
}

/** Code en ligne mis à part, le reste échappé puis balisé. */
export function inline(source) {
  const codes = [];
  let text = source.replace(/(`+)([\s\S]*?[^`])\1(?!`)/g, (_, _ticks, code) => {
    codes.push(`<code>${escapeHtml(code.trim())}</code>`);
    return `\u0000${codes.length - 1}\u0000`;
  });
  text = escapeHtml(text);
  text = text
    .replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;[^&]*&quot;)?\)/g, '<img alt="$1" src="$2" loading="lazy"/>')
    .replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+&quot;[^&]*&quot;)?\)/g, (_, label, href) => `<a href="${href}">${label}</a>`)
    .replace(/\*\*([^*]+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?!\*)/g, '$1<em>$2</em>')
    .replace(/~~([^~]+)~~/g, '<del>$1</del>')
    .replace(/&lt;(kbd|sub|sup|br)\/?&gt;/g, '<$1>')
    .replace(/&lt;\/(kbd|sub|sup)&gt;/g, '</$1>');
  return text.replace(/\u0000(\d+)\u0000/g, (_, index) => codes[Number(index)]);
}

const FENCE = /^(\s*)(`{3,}|~{3,})\s*([\w+-]*)\s*$/;
const LIST_ITEM = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
const TABLE_SEPARATOR = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;

function splitRow(line) {
  let row = line.trim();
  if (row.startsWith('|')) row = row.slice(1);
  if (row.endsWith('|') && !row.endsWith('\\|')) row = row.slice(0, -1);
  const cells = [];
  let current = '';
  let inCode = false;
  for (let i = 0; i < row.length; i++) {
    const char = row[i];
    if (char === '`') inCode = !inCode;
    if (char === '\\' && row[i + 1] === '|') {
      current += '|';
      i++;
    } else if (char === '|' && !inCode) {
      cells.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  cells.push(current.trim());
  return cells;
}

/**
 * Markdown vers HTML. `headings` reçoit {level, text, id} de chaque titre, dans l'ordre ; `onHeading` peut remplacer
 * l'identifiant (unicité garantie par l'appelant).
 */
export function renderMarkdown(markdown, {headings = [], uniqueId = (id) => id} = {}) {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const html = [];
  let index = 0;

  const isBlank = (line) => line.trim() === '';

  const parseBlocks = (blockLines) => {
    const out = [];
    let i = 0;
    while (i < blockLines.length) {
      const line = blockLines[i];
      if (isBlank(line)) {
        i++;
        continue;
      }
      const fence = FENCE.exec(line);
      if (fence) {
        const [, indent, marks, lang] = fence;
        const body = [];
        i++;
        while (i < blockLines.length && !new RegExp(`^\\s*${marks[0]}{${marks.length},}\\s*$`).test(blockLines[i])) {
          body.push(blockLines[i].startsWith(indent) ? blockLines[i].slice(indent.length) : blockLines[i].trimStart());
          i++;
        }
        i++;
        const code = body.join('\n');
        out.push(`<div class="code"><button class="copy" type="button" aria-label="Copier le code">Copier</button><pre><code class="language-${lang || 'text'}">${highlight(code, lang)}</code></pre></div>`);
        continue;
      }
      const heading = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
      if (heading) {
        const text = plainText(heading[2]);
        const id = uniqueId(slugify(text));
        headings.push({level: heading[1].length, text, id});
        out.push(`<h${heading[1].length} id="${id}">${inline(heading[2])}<a class="anchor" href="#${id}" aria-label="Lien vers cette section">#</a></h${heading[1].length}>`);
        i++;
        continue;
      }
      if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
        out.push('<hr/>');
        i++;
        continue;
      }
      if (/^\s*\|/.test(line) && i + 1 < blockLines.length && TABLE_SEPARATOR.test(blockLines[i + 1])) {
        const header = splitRow(line);
        const align = splitRow(blockLines[i + 1]).map((cell) => (cell.startsWith(':') && cell.endsWith(':') ? 'center' : cell.endsWith(':') ? 'right' : ''));
        i += 2;
        const rows = [];
        while (i < blockLines.length && /^\s*\|/.test(blockLines[i])) {
          rows.push(splitRow(blockLines[i]));
          i++;
        }
        const cell = (tag, text, column) => `<${tag}${align[column] ? ` style="text-align:${align[column]}"` : ''}>${inline(text)}</${tag}>`;
        out.push(
          `<div class="table"><table><thead><tr>${header.map((text, column) => cell('th', text, column)).join('')}</tr></thead>` +
            `<tbody>${rows.map((row) => `<tr>${row.map((text, column) => cell('td', text, column)).join('')}</tr>`).join('')}</tbody></table></div>`,
        );
        continue;
      }
      if (/^\s*>/.test(line)) {
        const quote = [];
        while (i < blockLines.length && /^\s*>/.test(blockLines[i])) {
          quote.push(blockLines[i].replace(/^\s*>\s?/, ''));
          i++;
        }
        out.push(`<blockquote>${parseBlocks(quote).join('\n')}</blockquote>`);
        continue;
      }
      if (LIST_ITEM.test(line)) {
        const result = parseList(blockLines, i);
        out.push(result.html);
        i = result.next;
        continue;
      }
      if (/^\s*<(?:!--|\/?[a-zA-Z])/.test(line)) {
        const raw = [];
        while (i < blockLines.length && !isBlank(blockLines[i])) {
          raw.push(blockLines[i]);
          i++;
        }
        const text = raw.join('\n');
        out.push(/^\s*<!--/.test(text) ? '' : text);
        continue;
      }
      const paragraph = [];
      while (
        i < blockLines.length &&
        !isBlank(blockLines[i]) &&
        !FENCE.test(blockLines[i]) &&
        !/^#{1,6}\s/.test(blockLines[i]) &&
        !LIST_ITEM.test(blockLines[i]) &&
        !/^\s*>/.test(blockLines[i]) &&
        !(/^\s*\|/.test(blockLines[i]) && i + 1 < blockLines.length && TABLE_SEPARATOR.test(blockLines[i + 1]))
      ) {
        paragraph.push(blockLines[i].trim());
        i++;
      }
      out.push(`<p>${inline(paragraph.join(' '))}</p>`);
    }
    return out;
  };

  const parseList = (blockLines, start) => {
    const first = LIST_ITEM.exec(blockLines[start]);
    const baseIndent = first[1].length;
    const ordered = /\d/.test(first[2]);
    const items = [];
    let i = start;
    while (i < blockLines.length) {
      const match = LIST_ITEM.exec(blockLines[i]);
      if (!match || match[1].length !== baseIndent || /\d/.test(match[2]) !== ordered) break;
      const content = [match[3]];
      i++;
      // Suite de l'élément : lignes plus indentées, lignes vides suivies d'une ligne indentée.
      while (i < blockLines.length) {
        const next = blockLines[i];
        if (isBlank(next)) {
          let ahead = i + 1;
          while (ahead < blockLines.length && isBlank(blockLines[ahead])) ahead++;
          if (ahead < blockLines.length && /^\s+\S/.test(blockLines[ahead]) && blockLines[ahead].search(/\S/) > baseIndent) {
            content.push('');
            i++;
            continue;
          }
          break;
        }
        if (next.search(/\S/) > baseIndent) {
          content.push(next.slice(Math.min(next.search(/\S/), baseIndent + 2)));
          i++;
          continue;
        }
        break;
      }
      items.push(content);
    }
    const tag = ordered ? 'ol' : 'ul';
    const body = items
      .map((content) => {
        const [head, ...rest] = content;
        const nested = rest.length ? parseBlocks(rest).join('\n') : '';
        const headHtml = inline(head);
        return `<li>${headHtml}${nested}</li>`;
      })
      .join('');
    return {html: `<${tag}>${body}</${tag}>`, next: i};
  };

  html.push(...parseBlocks(lines));
  void index;
  return html.join('\n');
}
