import {describe, expect, it} from 'vitest';
import {columnLetter, crc32, toCsv, toXlsx} from './export-writers';

/** Relit une archive zip "stored" comme le ferait un vrai lecteur : via le répertoire central. */
function readZip(bytes: Uint8Array): Map<string, string> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const endOffset = bytes.length - 22;
  expect(view.getUint32(endOffset, true)).toBe(0x06054b50);
  const entryCount = view.getUint16(endOffset + 10, true);
  let centralOffset = view.getUint32(endOffset + 16, true);

  const decoder = new TextDecoder();
  const files = new Map<string, string>();
  for (let i = 0; i < entryCount; i++) {
    expect(view.getUint32(centralOffset, true)).toBe(0x02014b50);
    const crc = view.getUint32(centralOffset + 16, true);
    const size = view.getUint32(centralOffset + 20, true);
    const nameLength = view.getUint16(centralOffset + 28, true);
    const localOffset = view.getUint32(centralOffset + 42, true);
    const name = decoder.decode(bytes.subarray(centralOffset + 46, centralOffset + 46 + nameLength));

    expect(view.getUint32(localOffset, true)).toBe(0x04034b50);
    const localNameLength = view.getUint16(localOffset + 26, true);
    const dataStart = localOffset + 30 + localNameLength;
    const data = bytes.subarray(dataStart, dataStart + size);
    expect(crc32(data)).toBe(crc);

    files.set(name, decoder.decode(data));
    centralOffset += 46 + nameLength;
  }
  return files;
}

describe('export-writers', () => {
  describe('toCsv', () => {
    it('sépare par ";" et n’entoure de guillemets que si nécessaire', () => {
      const csv = toCsv([
        ['Nom', 'Note'],
        ['Dupont; SA', 'dit "le grand"'],
        ['Martin', null],
      ]);
      expect(csv).toBe('Nom;Note\r\n"Dupont; SA";"dit ""le grand"""\r\nMartin;');
    });
  });

  describe('crc32', () => {
    it('donne la valeur de référence', () => {
      // CRC-32 standard de "123456789" : 0xCBF43926.
      expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
    });
  });

  describe('columnLetter', () => {
    it('suit la numérotation Excel', () => {
      expect(columnLetter(0)).toBe('A');
      expect(columnLetter(25)).toBe('Z');
      expect(columnLetter(26)).toBe('AA');
      expect(columnLetter(701)).toBe('ZZ');
      expect(columnLetter(702)).toBe('AAA');
    });
  });

  describe('toXlsx', () => {
    const xlsx = toXlsx([
      ['Référence', 'Montant', 'Urgent'],
      ['CMD-1 & <co>', 12.5, true],
      ['CMD-2', null, false],
    ]);
    const files = readZip(xlsx);

    it('produit une archive zip valide avec toutes les parties OOXML', () => {
      expect([...files.keys()].sort()).toEqual([
        '[Content_Types].xml',
        '_rels/.rels',
        'xl/_rels/workbook.xml.rels',
        'xl/styles.xml',
        'xl/workbook.xml',
        'xl/worksheets/sheet1.xml',
      ]);
    });

    it('garde les nombres et booléens typés, échappe le texte, omet les cellules vides', () => {
      const sheet = files.get('xl/worksheets/sheet1.xml')!;
      expect(sheet).toContain('<c r="B2"><v>12.5</v></c>');
      expect(sheet).toContain('<c r="C2" t="b"><v>1</v></c>');
      expect(sheet).toContain('<t>CMD-1 &amp; &lt;co&gt;</t>');
      expect(sheet).not.toContain('r="B3"');
    });

    it('met les en-têtes en gras et fige la première ligne', () => {
      const sheet = files.get('xl/worksheets/sheet1.xml')!;
      expect(sheet).toContain('<c r="A1" s="1" t="inlineStr"><is><t>Référence</t></is></c>');
      expect(sheet).toContain('state="frozen"');
    });
  });
});
