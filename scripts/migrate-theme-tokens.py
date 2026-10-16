"""Remplace, dans les styles de la bibliothèque, les anciennes variables `--app-*` / `--mat-sys-error` (avec leur
valeur de repli) par la lecture d'un jeton de thème : `var(--ngt-NOM, var(--app-ANCIEN, repli))`.

À lancer une fois (le résultat est dans le dépôt) ; sans effet si tout est déjà migré.
"""
import io
import re
import sys

TOKENS = {
    'app-primary': 'primary',
    'app-primary-soft': 'primary-soft',
    'app-primary-outline': 'primary-outline',
    'app-text': 'text',
    'app-muted': 'text-muted',
    'app-text-muted': 'text-muted',
    'app-border': 'border',
    'app-border-strong': 'border-strong',
    'app-surface': 'surface',
    'app-surface-solid': 'surface',
    'app-frost': 'surface',
    'app-surface-alt': 'surface-alt',
    'app-surface-soft': 'surface-soft',
    'app-hover-surface': 'hover-surface',
    'app-field-bg': 'field-bg',
    'app-field-hover-bg': 'field-hover-bg',
    'app-filter-panel-bg': 'filter-panel-bg',
    'app-shadow-soft': 'shadow-soft',
    'mat-sys-error': 'danger',
}

# var(--app-xxx) ou var(--app-xxx, repli) ; le repli peut contenir des parenthèses imbriquées (rgba(...)).
PATTERN = re.compile(r'var\(--(app-[a-z-]+|mat-sys-error)(?:,\s*((?:[^()]|\((?:[^()]|\([^()]*\))*\))*))?\)')

count = 0
unknown = set()


def replace(match):
    global count
    legacy, fallback = match.group(1), match.group(2)
    token = TOKENS.get(legacy)
    if token is None:
        unknown.add(legacy)
        return match.group(0)
    count += 1
    inner = f'var(--{legacy}, {fallback.strip()})' if fallback else f'var(--{legacy})'
    return f'var(--ngt-{token}, {inner})'


for path in sys.argv[1:]:
    text = io.open(path, encoding='utf-8', newline='').read()
    migrated = PATTERN.sub(replace, text)
    if migrated != text:
        io.open(path, 'w', encoding='utf-8', newline='').write(migrated)

print(f'{count} lectures migrées', f'(sans jeton : {sorted(unknown)})' if unknown else '')
