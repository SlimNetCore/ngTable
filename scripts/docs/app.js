// Interactions du site de documentation : thème, menu mobile, recherche, copie du code, sommaire actif.
(() => {
  const root = document.documentElement;
  const stored = (() => {
    try {
      return localStorage.getItem('ngt-docs-theme');
    } catch {
      return null;
    }
  })();
  const applyTheme = (theme) => root.setAttribute('data-theme', theme);
  applyTheme(stored ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));

  document.querySelector('[data-theme-toggle]')?.addEventListener('click', () => {
    const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    try {
      localStorage.setItem('ngt-docs-theme', next);
    } catch {
      /* stockage indisponible */
    }
  });

  document.querySelector('[data-menu-toggle]')?.addEventListener('click', () => document.body.classList.toggle('menu-open'));
  document.querySelector('.sidebar')?.addEventListener('click', (event) => {
    if (event.target.closest('a')) document.body.classList.remove('menu-open');
  });

  // Copie du code
  document.querySelectorAll('.code .copy').forEach((button) => {
    button.addEventListener('click', async () => {
      const code = button.parentElement.querySelector('code').textContent;
      try {
        await navigator.clipboard.writeText(code);
        button.textContent = 'Copié';
      } catch {
        button.textContent = 'Échec';
      }
      setTimeout(() => (button.textContent = 'Copier'), 1500);
    });
  });

  // Lien de la page courante visible dans la barre latérale
  document.querySelector('.sidebar [aria-current="page"]')?.scrollIntoView({block: 'center'});

  // Sommaire : section visible
  const links = [...document.querySelectorAll('.toc a')];
  if (links.length > 0 && 'IntersectionObserver' in window) {
    const byId = new Map(links.map((link) => [link.getAttribute('href').slice(1), link]));
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            links.forEach((link) => link.classList.remove('active'));
            byId.get(entry.target.id)?.classList.add('active');
          }
        }
      },
      {rootMargin: '-72px 0px -70% 0px'},
    );
    byId.forEach((_, id) => {
      const heading = document.getElementById(id);
      if (heading) observer.observe(heading);
    });
  }

  // Recherche plein texte (index chargé à la première frappe)
  const input = document.querySelector('.search input');
  const results = document.querySelector('.results');
  if (!input || !results) return;
  let index = null;
  let active = -1;
  const load = () =>
    (index ??= fetch(document.documentElement.dataset.base + 'search-index.json').then((response) => response.json()));
  const fold = (text) => text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const escapeHtml = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const search = async () => {
    const terms = fold(input.value).split(/\s+/).filter(Boolean);
    if (terms.length === 0) {
      results.hidden = true;
      return;
    }
    const entries = await load();
    const scored = [];
    for (const entry of entries) {
      const title = fold(entry.title);
      const text = fold(entry.text);
      let score = 0;
      let matchesAll = true;
      for (const term of terms) {
        const inTitle = title.includes(term);
        const inText = text.includes(term);
        if (!inTitle && !inText) {
          matchesAll = false;
          break;
        }
        score += (inTitle ? 10 : 0) + (inText ? 2 : 0) + (title.startsWith(term) ? 5 : 0) + (entry.level === 1 ? 4 : entry.level === 2 ? 2 : 0);
      }
      if (matchesAll) scored.push({entry, score, position: text.indexOf(terms[0])});
    }
    scored.sort((a, b) => b.score - a.score);
    const top = scored.slice(0, 14);
    active = -1;
    results.hidden = false;
    results.innerHTML =
      top.length === 0
        ? '<a href="#" tabindex="-1"><strong>Aucun résultat</strong></a>'
        : top
            .map(({entry, position}) => {
              const start = Math.max(0, position - 40);
              const snippet = escapeHtml(entry.text.slice(start, start + 130));
              return `<a href="${entry.url}"><strong>${escapeHtml(entry.title)}</strong><small>${escapeHtml(entry.page)} — ${snippet}…</small></a>`;
            })
            .join('');
  };

  input.addEventListener('input', search);
  input.addEventListener('focus', () => input.value && search());
  input.addEventListener('keydown', (event) => {
    const items = [...results.querySelectorAll('a')];
    if (event.key === 'Escape') {
      results.hidden = true;
      input.blur();
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      active = (active + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % Math.max(items.length, 1);
      items.forEach((item, i) => item.classList.toggle('active', i === active));
      items[active]?.scrollIntoView({block: 'nearest'});
    } else if (event.key === 'Enter' && items[active]) {
      location.href = items[active].href;
    }
  });
  document.addEventListener('click', (event) => {
    if (!event.target.closest('.search')) results.hidden = true;
  });
  document.addEventListener('keydown', (event) => {
    if ((event.key === '/' || (event.key === 'k' && (event.ctrlKey || event.metaKey))) && document.activeElement !== input) {
      event.preventDefault();
      input.focus();
    }
  });
})();
