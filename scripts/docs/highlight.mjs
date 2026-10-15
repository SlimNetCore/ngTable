// Coloration syntaxique minimale, sans dépendance : commentaires, chaînes, nombres, mots-clés et quelques motifs par
// langage. Une seule expression régulière par langage, des groupes nommés pour les classes.

const escapeHtml = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const JS_KEYWORDS =
  'abstract|as|async|await|break|case|catch|class|const|constructor|continue|default|delete|do|else|enum|export|extends|false|finally|for|from|function|get|if|implements|import|in|inject|instanceof|interface|let|new|null|of|private|protected|public|readonly|return|set|static|super|switch|this|throw|true|try|type|typeof|undefined|var|void|while|yield';
const JAVA_KEYWORDS =
  'abstract|boolean|break|case|catch|class|const|continue|default|do|double|else|enum|extends|false|final|finally|float|for|if|implements|import|instanceof|int|interface|long|new|null|package|private|protected|public|record|return|static|super|switch|this|throw|throws|true|try|var|void|while';

const LANGUAGES = {
  ts: {
    comment: String.raw`\/\/[^\n]*|\/\*[\s\S]*?\*\/`,
    string: String.raw`'(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"|` + '`(?:\\\\.|[^`\\\\])*`',
    decorator: String.raw`@[A-Za-z_]\w*`,
    number: String.raw`\b\d[\d_]*(?:\.\d+)?\b`,
    keyword: String.raw`\b(?:${JS_KEYWORDS})\b`,
    type: String.raw`\b[A-Z][A-Za-z0-9_]*\b`,
  },
  java: {
    comment: String.raw`\/\/[^\n]*|\/\*[\s\S]*?\*\/`,
    string: String.raw`"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])'`,
    decorator: String.raw`@[A-Za-z_]\w*`,
    number: String.raw`\b\d[\d_]*(?:\.\d+)?[LlDdFf]?\b`,
    keyword: String.raw`\b(?:${JAVA_KEYWORDS})\b`,
    type: String.raw`\b[A-Z][A-Za-z0-9_]*\b`,
  },
  html: {
    comment: String.raw`<!--[\s\S]*?-->`,
    tag: String.raw`<\/?[A-Za-z][\w-]*|\/?>`,
    attr: String.raw`[@\[\(#*]?[\w:.\-\]\)]+(?==)`,
    string: String.raw`"[^"]*"|'[^']*'`,
  },
  css: {
    comment: String.raw`\/\*[\s\S]*?\*\/`,
    string: String.raw`'[^'\n]*'|"[^"\n]*"`,
    property: String.raw`--[\w-]+|[a-z-]+(?=\s*:)`,
    number: String.raw`#[0-9a-fA-F]{3,8}\b|-?\b\d+(?:\.\d+)?(?:px|rem|em|%|vh|vw|ms|s)?\b`,
    keyword: String.raw`@[\w-]+|:{1,2}[a-z-]+`,
  },
  json: {
    property: String.raw`"(?:\\.|[^"\\])*"(?=\s*:)`,
    string: String.raw`"(?:\\.|[^"\\])*"`,
    number: String.raw`-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b`,
    keyword: String.raw`\b(?:true|false|null)\b`,
  },
  shell: {
    comment: String.raw`(?:^|\s)#[^\n]*`,
    string: String.raw`'[^'\n]*'|"(?:\\.|[^"\\\n])*"`,
    keyword: String.raw`\b(?:npm|npx|ng|node|git|cd|mvn|mvnw|export|if|then|fi|for|do|done|echo|curl|docker)\b`,
    property: String.raw`(?<=\s)--?[a-zA-Z][\w-]*`,
  },
  yaml: {
    comment: String.raw`#[^\n]*`,
    property: String.raw`^[ \t-]*[\w.\-"]+(?=:)`,
    string: String.raw`'[^'\n]*'|"[^"\n]*"`,
    number: String.raw`\b\d+(?:\.\d+)?\b`,
    keyword: String.raw`\b(?:true|false|null)\b`,
  },
  sql: {
    comment: String.raw`--[^\n]*|\/\*[\s\S]*?\*\/`,
    string: String.raw`'(?:''|[^'])*'`,
    number: String.raw`\b\d+(?:\.\d+)?\b`,
    keyword: String.raw`\b(?:select|from|where|and|or|not|in|like|order|by|group|having|join|left|right|inner|on|as|limit|offset|insert|into|values|update|set|delete|create|table|null|is|distinct|count|sum|avg|min|max)\b`,
  },
};

const ALIASES = {
  ts: 'ts', typescript: 'ts', javascript: 'ts', js: 'ts', tsx: 'ts', jsx: 'ts', kotlin: 'java', java: 'java',
  html: 'html', xml: 'html', svg: 'html', scss: 'css', css: 'css', json: 'json', jsonc: 'json',
  bash: 'shell', sh: 'shell', shell: 'shell', powershell: 'shell', ps1: 'shell', console: 'shell', cmd: 'shell',
  yaml: 'yaml', yml: 'yaml', properties: 'yaml', sql: 'sql',
};

const cache = new Map();

function compile(name) {
  let entry = cache.get(name);
  if (!entry) {
    const rules = LANGUAGES[name];
    const flags = name === 'sql' ? 'gim' : name === 'yaml' ? 'gm' : 'g';
    const groups = Object.keys(rules);
    entry = {groups, regex: new RegExp(groups.map((group) => `(?<${group}>${rules[group]})`).join('|'), flags)};
    cache.set(name, entry);
  }
  return entry;
}

/** Code HTML coloré ; une langue inconnue donne simplement du texte échappé. */
export function highlight(code, lang = '') {
  const name = ALIASES[lang.toLowerCase()];
  if (!name) {
    return escapeHtml(code);
  }
  const {groups, regex} = compile(name);
  let out = '';
  let last = 0;
  regex.lastIndex = 0;
  for (let match = regex.exec(code); match; match = regex.exec(code)) {
    if (match[0] === '') {
      regex.lastIndex++;
      continue;
    }
    const group = groups.find((candidate) => match.groups[candidate] !== undefined);
    out += escapeHtml(code.slice(last, match.index));
    out += `<span class="tok-${group}">${escapeHtml(match[0])}</span>`;
    last = match.index + match[0].length;
  }
  return out + escapeHtml(code.slice(last));
}
