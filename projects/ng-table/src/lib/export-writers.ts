/**
 * Génération des fichiers d'export (CSV, XLSX) sans aucune dépendance.
 *
 * Le XLSX est écrit à la main : c'est une archive zip de quelques fichiers XML
 * (format Office Open XML). On utilise des entrées zip non compressées ("stored"),
 * ce qui évite d'embarquer un algorithme deflate — le fichier est un peu plus gros,
 * mais reste lisible par Excel, LibreOffice et Google Sheets. Aucune dépendance
 * tierce (SheetJS publié sur npm n'est plus maintenu et a des failles connues).
 */

/** Valeur d'une cellule exportée. `null` = cellule vide. */
export type ExportCell = string | number | boolean | null;

export type NgTableExportFormat = 'csv' | 'xlsx';

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** CSV séparé par `;` (séparateur attendu par Excel en français), lignes `\r\n`. */
export function toCsv(matrix: readonly (readonly ExportCell[])[]): string {
  return matrix.map((row) => row.map((cell) => csvEscape(cell === null ? '' : String(cell))).join(';')).join('\r\n');
}

/** Classeur XLSX d'une feuille ; la première ligne (en-têtes) est en gras et figée. */
export function toXlsx(matrix: readonly (readonly ExportCell[])[], sheetName = 'Export'): Uint8Array {
  return zipStored([
    {name: '[Content_Types].xml', content: CONTENT_TYPES},
    {name: '_rels/.rels', content: ROOT_RELS},
    {name: 'xl/workbook.xml', content: workbookXml(sheetName)},
    {name: 'xl/_rels/workbook.xml.rels', content: WORKBOOK_RELS},
    {name: 'xl/styles.xml', content: STYLES},
    {name: 'xl/worksheets/sheet1.xml', content: sheetXml(matrix)},
  ]);
}

/** Déclenche le téléchargement d'un fichier dans le navigateur (sans effet côté serveur). */
export function downloadFile(content: BlobPart, filename: string, mimeType: string): void {
  if (typeof document === 'undefined') {
    return;
  }
  const blob = new Blob([content], {type: mimeType});
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/** Lettre(s) de colonne Excel : 0 → A, 25 → Z, 26 → AA. */
export function columnLetter(index: number): string {
  let letters = '';
  let n = index + 1;
  while (n > 0) {
    const remainder = (n - 1) % 26;
    letters = String.fromCharCode(65 + remainder) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

/** Guillemets seulement si nécessaire (séparateur, guillemet ou saut de ligne présent). */
function csvEscape(value: string): string {
  return /[";\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

// --- XLSX -----------------------------------------------------------------

const XML_HEADER = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const MAIN_NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const REL_NS = 'http://schemas.openxmlformats.org/package/2006/relationships';
const DOC_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

const CONTENT_TYPES =
  XML_HEADER +
  '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
  '<Default Extension="xml" ContentType="application/xml"/>' +
  '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
  '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
  '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
  '</Types>';

const ROOT_RELS =
  XML_HEADER +
  `<Relationships xmlns="${REL_NS}">` +
  `<Relationship Id="rId1" Type="${DOC_REL}/officeDocument" Target="xl/workbook.xml"/>` +
  '</Relationships>';

const WORKBOOK_RELS =
  XML_HEADER +
  `<Relationships xmlns="${REL_NS}">` +
  `<Relationship Id="rId1" Type="${DOC_REL}/worksheet" Target="worksheets/sheet1.xml"/>` +
  `<Relationship Id="rId2" Type="${DOC_REL}/styles" Target="styles.xml"/>` +
  '</Relationships>';

/** Style 0 = normal, style 1 = gras (en-têtes). */
const STYLES =
  XML_HEADER +
  `<styleSheet xmlns="${MAIN_NS}">` +
  '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
  '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
  '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
  '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>' +
  '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
  '</styleSheet>';

function workbookXml(sheetName: string): string {
  return (
    XML_HEADER +
    `<workbook xmlns="${MAIN_NS}" xmlns:r="${DOC_REL}">` +
    `<sheets><sheet name="${escapeXml(sanitizeSheetName(sheetName))}" sheetId="1" r:id="rId1"/></sheets>` +
    '</workbook>'
  );
}

function sheetXml(matrix: readonly (readonly ExportCell[])[]): string {
  const rows = matrix
    .map((row, rowIndex) => {
      const style = rowIndex === 0 ? ' s="1"' : '';
      const cells = row
        .map((cell, columnIndex) => cellXml(cell, `${columnLetter(columnIndex)}${rowIndex + 1}`, style))
        .join('');
      return `<row r="${rowIndex + 1}">${cells}</row>`;
    })
    .join('');

  return (
    XML_HEADER +
    `<worksheet xmlns="${MAIN_NS}">` +
    // Ligne d'en-têtes figée : elle reste visible en faisant défiler dans Excel.
    '<sheetViews><sheetView workbookViewId="0">' +
    '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>' +
    '</sheetView></sheetViews>' +
    `<sheetData>${rows}</sheetData>` +
    '</worksheet>'
  );
}

function cellXml(cell: ExportCell, ref: string, style: string): string {
  if (cell === null || cell === '') {
    return '';
  }
  if (typeof cell === 'number' && Number.isFinite(cell)) {
    return `<c r="${ref}"${style}><v>${cell}</v></c>`;
  }
  if (typeof cell === 'boolean') {
    return `<c r="${ref}"${style} t="b"><v>${cell ? 1 : 0}</v></c>`;
  }
  const text = String(cell);
  const preserve = /^\s|\s$/.test(text) ? ' xml:space="preserve"' : '';
  return `<c r="${ref}"${style} t="inlineStr"><is><t${preserve}>${escapeXml(text)}</t></is></c>`;
}

/** Échappe le XML et retire les caractères de contrôle interdits en XML 1.0. */
function escapeXml(value: string): string {
  return value
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Excel refuse les noms de feuille de plus de 31 caractères ou contenant `[]:*?/\`. */
function sanitizeSheetName(name: string): string {
  const cleaned = name.replace(/[[\]:*?/\\]/g, ' ').trim().slice(0, 31);
  return cleaned || 'Export';
}

// --- Zip ("stored", sans compression) -------------------------------------

interface ZipEntry {
  name: string;
  content: string;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** 1980-01-01 00:00, la plus petite date DOS : fichier identique à contenu identique. */
const DOS_TIME = 0;
const DOS_DATE = (0 << 9) | (1 << 5) | 1;
/** Bit 11 : noms de fichiers en UTF-8. */
const UTF8_FLAG = 0x0800;

function zipStored(entries: readonly ZipEntry[]): Uint8Array {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const data = encoder.encode(entry.content);
    const crc = crc32(data);

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, UTF8_FLAG, true);
    local.setUint16(8, 0, true); // méthode 0 = stored
    local.setUint16(10, DOS_TIME, true);
    local.setUint16(12, DOS_DATE, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, data.length, true);
    local.setUint16(26, name.length, true);
    local.setUint16(28, 0, true);
    localParts.push(new Uint8Array(local.buffer), name, data);

    const central = new DataView(new ArrayBuffer(46));
    central.setUint32(0, 0x02014b50, true);
    central.setUint16(4, 20, true);
    central.setUint16(6, 20, true);
    central.setUint16(8, UTF8_FLAG, true);
    central.setUint16(10, 0, true);
    central.setUint16(12, DOS_TIME, true);
    central.setUint16(14, DOS_DATE, true);
    central.setUint32(16, crc, true);
    central.setUint32(20, data.length, true);
    central.setUint32(24, data.length, true);
    central.setUint16(28, name.length, true);
    central.setUint16(30, 0, true);
    central.setUint16(32, 0, true);
    central.setUint16(34, 0, true);
    central.setUint16(36, 0, true);
    central.setUint32(38, 0, true);
    central.setUint32(42, offset, true);
    centralParts.push(new Uint8Array(central.buffer), name);

    offset += 30 + name.length + data.length;
  }

  const centralSize = centralParts.reduce((size, part) => size + part.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(4, 0, true);
  end.setUint16(6, 0, true);
  end.setUint16(8, entries.length, true);
  end.setUint16(10, entries.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);
  end.setUint16(20, 0, true);

  return concat([...localParts, ...centralParts, new Uint8Array(end.buffer)]);
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const result = new Uint8Array(parts.reduce((size, part) => size + part.length, 0));
  let position = 0;
  for (const part of parts) {
    result.set(part, position);
    position += part.length;
  }
  return result;
}
