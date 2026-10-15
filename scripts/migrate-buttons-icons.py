"""Remplace `<mat-icon>` par `<ng-table-icon>`, `mat-*-button` par `ngt-*-button`, et les sélecteurs CSS Material
correspondants. À lancer une fois ; sans effet si tout est déjà migré."""
import io
import re
import sys


def load(path):
    return io.open(path, encoding='utf-8', newline='').read()


def save(path, text):
    io.open(path, 'w', encoding='utf-8', newline='').write(text)


ICON = re.compile(r'<mat-icon([^>]*)>(.*?)</mat-icon>', re.DOTALL)


def icon(match):
    attributes, content = match.group(1), match.group(2).strip()
    expression = re.fullmatch(r'\{\{\s*(.+?)\s*\}\}', content, re.DOTALL)
    name = f'[name]="{expression.group(1)}"' if expression else f'name="{content}"'
    return f'<ng-table-icon{attributes} {name}/>'


BUTTONS = {
    'mat-icon-button': 'ngt-icon-button',
    'mat-stroked-button': 'ngt-stroked-button',
    'mat-flat-button': 'ngt-flat-button',
    'mat-button': 'ngt-button',
}


def template(path):
    text = load(path)
    text = ICON.sub(icon, text)
    for old, new in BUTTONS.items():
        text = re.sub(rf'(?<![\w-]){old}(?![\w-])', new, text)
    save(path, text)


def stylesheet(path):
    text = load(path)
    text = re.sub(r'(?<![\w-])mat-icon(?![\w-])', 'ng-table-icon', text)
    text = text.replace('.mat-icon', 'ng-table-icon')
    text = text.replace('.mat-mdc-icon-button', '[ngt-icon-button]')
    # La taille d'un bouton rond se réglait par une variable Material : elle devient largeur et hauteur.
    text = re.sub(r'--(?:mat|mdc)-icon-button-state-layer-size:\s*(\d+px);', r'width: \1;\n  height: \1;', text)
    save(path, text)


for path in sys.argv[1:]:
    (template if path.endswith('.html') else stylesheet)(path)
print('ok')
