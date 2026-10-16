import {describe, expect, it} from 'vitest';
import {crc32} from './export-writers';
import {contrastingText, excelSerial, StyledXlsxCell, toArgb, toStyledXlsx} from './xlsx-styled';

/** Relit l'archive zip « stored » via son répertoire central. */
function readZip(bytes: Uint8Array): Map<string, string> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const endOffset = bytes.length - 22;
  const entryCount = view.getUint16(endOffset + 10, true);
  let central = view.getUint32(endOffset + 16, true);
  const files = new Map<string, string>();
  for (let i = 0; i < entryCount; i++) {
    const crc = view.getUint32(central + 16, true);
    const size = view.getUint32(central + 20, true);
    const nameLength = view.getUint16(central + 28, true);
    const localOffset = view.getUint32(central + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(central + 46, central + 46 + nameLength));
    const start = localOffset + 30 + view.getUint16(localOffset + 26, true);
    const data = bytes.subarray(start, start + size);
    expect(crc32(data)).toBe(crc);
    files.set(name, new TextDecoder().decode(data));
    central += 46 + nameLength;
  }
  return files;
}

const parse = (xml: string) => new DOMParser().parseFromString(xml, 'application/xml');

const MATRIX: StyledXlsxCell[][] = [
  ['Référence', 'Montant', 'Quantité', 'Date', 'Urgent'],
  ['CMD-1 & <co>', 1234.5, 3, new Date(Date.UTC(2026, 0, 2)), true],
  ['CMD-2', 99.99, 12, new Date(Date.UTC(2026, 0, 3)), false],
  ['CMD-3', null, null, null, null],
];

describe('xlsx-styled', () => {
  const files = readZip(toStyledXlsx(MATRIX, {sheetName: 'Commandes'}));
  const sheet = files.get('xl/worksheets/sheet1.xml')!;
  const styles = files.get('xl/styles.xml')!;

  it('produit les mêmes parties OOXML que l’export brut, toutes en XML bien formé', () => {
    expect([...files.keys()].sort()).toEqual([
      '[Content_Types].xml',
      '_rels/.rels',
      'xl/_rels/workbook.xml.rels',
      'xl/styles.xml',
      'xl/workbook.xml',
      'xl/worksheets/sheet1.xml',
    ]);
    for (const [name, xml] of files) {
      expect(parse(xml).querySelector('parsererror'), name).toBeNull();
    }
  });

  it('écrit les dates en vrais numéros de série Excel, les nombres et booléens typés, le texte échappé', () => {
    expect(excelSerial(new Date(Date.UTC(2026, 0, 2)))).toBe(46024);
    expect(sheet).toMatch(/<c r="D2" s="\d+"><v>46024<\/v><\/c>/);
    expect(sheet).toMatch(/<c r="B2" s="\d+"><v>1234.5<\/v><\/c>/);
    expect(sheet).toMatch(/<c r="E2" s="\d+" t="b"><v>1<\/v><\/c>/);
    expect(sheet).toContain('<t>CMD-1 &amp; &lt;co&gt;</t>');
    expect(sheet).toMatch(/<c r="B4" s="\d+"\/>/); // cellule vide, mise en forme conservée
  });

  it('déduit les formats : décimaux à 2 chiffres, entiers sans séparateur, dates jj/mm/aaaa', () => {
    expect(styles).toContain('formatCode="dd/mm/yyyy"');
    expect(styles).toMatch(/numFmtId="4"/); // #,##0.00
    expect(styles).not.toContain('formatCode="#,##0"');
  });

  it('colore l’en-tête, alterne les lignes, fige la première ligne, filtre et répète l’en-tête à l’impression', () => {
    expect(styles).toContain('rgb="FF2F6FA8"'); // fond d'en-tête par défaut
    expect(styles).toContain('rgb="FFF4F6F9"'); // lignes alternées
    expect(sheet).toContain('state="frozen"');
    expect(sheet).toContain('<autoFilter ref="A1:E4"/>');
    expect(sheet).toContain('showGridLines="0"');
    expect(sheet).toContain('orientation="landscape"');
    const workbook = files.get('xl/workbook.xml')!;
    expect(workbook).toContain("'Commandes'!$1:$1");
    expect(workbook).toContain("'Commandes'!$A$1:$E$4");
  });

  it('ajuste les largeurs au contenu, dans des bornes', () => {
    const widths = [...sheet.matchAll(/<col min="\d+" max="\d+" width="([\d.]+)"/g)].map((match) => Number(match[1]));
    expect(widths).toHaveLength(5);
    expect(widths[0]).toBeGreaterThan(widths[2]);
    expect(widths.every((width) => width >= 8 && width <= 60)).toBe(true);
  });

  it('les réglages : couleur d’en-tête, format et largeur par colonne, sans filtre ni alternance', () => {
    const custom = readZip(
      toStyledXlsx(MATRIX, {
        headerFill: '#7c3aed',
        zebra: false,
        autoFilter: false,
        columns: [{width: 30}, {numFmt: '#,##0.00 "€"', align: 'center'}],
      }),
    );
    const customSheet = custom.get('xl/worksheets/sheet1.xml')!;
    const customStyles = custom.get('xl/styles.xml')!;
    expect(customStyles).toContain('rgb="FF7C3AED"');
    expect(customStyles).toContain('formatCode="#,##0.00 &quot;€&quot;"');
    expect(customStyles).toContain('horizontal="center"');
    expect(customSheet).not.toContain('autoFilter');
    expect(customSheet).toContain('width="30"');
    expect(custom.get('xl/workbook.xml')).not.toContain('_FilterDatabase');
    expect(customStyles).not.toContain('FFF4F6F9');
  });

  it('couleurs : #rgb, #rrggbb et rgb() reconnus, le reste ignoré ; le texte d’en-tête suit le fond', () => {
    expect(toArgb('#abc')).toBe('FFAABBCC');
    expect(toArgb('#2f6fa8')).toBe('FF2F6FA8');
    expect(toArgb('rgb(47, 111, 168)')).toBe('FF2F6FA8');
    expect(toArgb('bleu')).toBeNull();
    expect(contrastingText('FF2F6FA8')).toBe('FFFFFFFF');
    expect(contrastingText('FF7FB4D6')).toBe('FF14212B'); // accent du thème sombre : texte foncé
  });

  it('un tableau sans ligne de données donne tout de même un classeur valide', () => {
    const empty = readZip(toStyledXlsx([['A', 'B']]));
    expect(empty.get('xl/worksheets/sheet1.xml')).toContain('<dimension ref="A1:B1"/>');
    const none = readZip(toStyledXlsx([]));
    expect(parse(none.get('xl/worksheets/sheet1.xml')!).querySelector('parsererror')).toBeNull();
  });
});
