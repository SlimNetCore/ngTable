/**
 * Export Excel mis en forme, sans dépendance : en-têtes colorés, lignes alternées, filets fins, formats de nombres et de
 * dates réels (les dates sont de vraies dates Excel, pas du texte), largeurs de colonnes ajustées, filtre automatique,
 * première ligne figée et répétée à l'impression, mise en page paysage sur une page de large.
 *
 * Le fichier reste un classeur OOXML écrit à la main (voir `export-writers.ts`).
 */
import {
  columnLetter,
  CONTENT_TYPES,
  DOC_REL,
  escapeXml,
  ExportCell,
  MAIN_NS,
  ROOT_RELS,
  sanitizeSheetName,
  WORKBOOK_RELS,
  XML_HEADER,
  zipStored,
} from './export-writers';

/** Cellule d'un export mis en forme : comme `ExportCell`, plus les dates (écrites en vraies dates Excel). */
export type StyledXlsxCell = ExportCell | Date;

export interface StyledXlsxColumn {
  /** Largeur en caractères ; sinon ajustée au contenu (8 à 60). */
  width?: number;
  /** Format de nombre Excel (`'#,##0.00 "€"'`, `'0.0%'`, `'dd/mm/yyyy'`...). Sinon déduit du contenu. */
  numFmt?: string;
  /** Alignement ; sinon à droite pour les nombres, au centre pour les booléens, à gauche pour le reste. */
  align?: 'left' | 'center' | 'right';
}

export interface StyledXlsxOptions {
  sheetName?: string;
  columns?: readonly (StyledXlsxColumn | undefined)[];
  /** Couleur de fond de la ligne d'en-têtes (`#rrggbb`). Défaut : bleu `#2f6fa8`. */
  headerFill?: string;
  /** Couleur du texte des en-têtes ; sinon blanc ou presque noir selon le fond. */
  headerColor?: string;
  /** Lignes alternées (défaut : oui). `false` ou une couleur `#rrggbb`. */
  zebra?: boolean | string;
  /** Filtre automatique sur la ligne d'en-têtes (défaut : oui). */
  autoFilter?: boolean;
}

const DEFAULT_HEADER_FILL = '#2f6fa8';
const DEFAULT_ZEBRA = '#f4f6f9';
const BODY_BORDER = '#dfe4ea';
const BODY_TEXT = '#1f2933';

const BUILTIN_FORMATS: Record<string, number> = {General: 0, '0': 1, '0.00': 2, '#,##0': 3, '#,##0.00': 4, '0%': 9, '0.00%': 10};
const DATE_FORMAT = 'dd/mm/yyyy';
const DATETIME_FORMAT = 'dd/mm/yyyy hh:mm';

/** smallInteger : entiers sous 100 000 (années, identifiants, quantités) laissés tels quels, sans séparateur de milliers. */
type Kind = 'text' | 'integer' | 'smallInteger' | 'decimal' | 'boolean' | 'date' | 'datetime';

/** `#rrggbb` (ou `rgb(r, g, b)`) vers `FFRRGGBB` ; `null` si la couleur n'est pas reconnue. */
export function toArgb(color: string | undefined): string | null {
  const text = (color ?? '').trim();
  const hex = /^#([0-9a-f]{6})$/i.exec(text) ?? /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(text);
  if (hex) {
    return `FF${(hex.length === 2 ? hex[1] : hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3]).toUpperCase()}`;
  }
  const rgb = /^rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})/i.exec(text);
  if (rgb) {
    return `FF${[rgb[1], rgb[2], rgb[3]].map((part) => Math.min(255, Number(part)).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
  }
  return null;
}

/** Blanc ou presque noir : celui qui se lit le mieux sur ce fond (luminance relative WCAG). */
export function contrastingText(argb: string): string {
  const [r, g, b] = [2, 4, 6].map((start) => {
    const channel = parseInt(argb.slice(start, start + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? 'FF14212B' : 'FFFFFFFF';
}

/** Date vers numéro de série Excel. Minuit UTC = jour civil (dates ISO) ; sinon l'heure locale de l'utilisateur. */
export function excelSerial(date: Date): number {
  const utcMidnight = date.getUTCHours() === 0 && date.getUTCMinutes() === 0 && date.getUTCSeconds() === 0 && date.getUTCMilliseconds() === 0;
  const ms = utcMidnight
    ? date.getTime()
    : Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), date.getHours(), date.getMinutes(), date.getSeconds(), date.getMilliseconds());
  return ms / 86_400_000 + 25_569;
}

function isDateOnly(date: Date): boolean {
  return Number.isInteger(excelSerial(date));
}

function kindOf(values: readonly StyledXlsxCell[]): Kind {
  const present = values.filter((value) => value !== null && value !== '');
  if (present.length === 0) {
    return 'text';
  }
  if (present.every((value) => value instanceof Date && !Number.isNaN(value.getTime()))) {
    return present.every((value) => isDateOnly(value as Date)) ? 'date' : 'datetime';
  }
  if (present.every((value) => typeof value === 'number' && Number.isFinite(value))) {
    const numbers = present as number[];
    if (numbers.every((value) => Number.isInteger(value))) {
      return numbers.some((value) => Math.abs(value) >= 100_000) ? 'integer' : 'smallInteger';
    }
    return 'decimal';
  }
  if (present.every((value) => typeof value === 'boolean')) {
    return 'boolean';
  }
  return 'text';
}

/** Collection des styles du classeur : chaque combinaison (format, fond, bordure, police, alignement) devient un `xf`. */
class StyleBook {
  private readonly customFormats = new Map<string, number>();
  private readonly xfs: string[] = [];
  private readonly xfIds = new Map<string, number>();

  constructor(
    private readonly headerFill: string,
    private readonly zebraFill: string | null,
  ) {
    this.xf({numFmt: 'General', fill: 'none', border: 'none', font: 'body', align: 'left'}); // xf 0 : style par défaut
  }

  private numFmtId(format: string): number {
    if (format in BUILTIN_FORMATS) {
      return BUILTIN_FORMATS[format];
    }
    let id = this.customFormats.get(format);
    if (id === undefined) {
      id = 164 + this.customFormats.size;
      this.customFormats.set(format, id);
    }
    return id;
  }

  xf(style: {numFmt: string; fill: 'none' | 'header' | 'zebra'; border: 'none' | 'body' | 'header'; font: 'body' | 'header'; align: string}): number {
    const key = JSON.stringify(style);
    let index = this.xfIds.get(key);
    if (index === undefined) {
      const fillId = {none: 0, header: 2, zebra: 3}[style.fill];
      const borderId = {none: 0, body: 1, header: 2}[style.border];
      const fontId = style.font === 'header' ? 1 : 0;
      index = this.xfs.length;
      this.xfs.push(
        `<xf numFmtId="${this.numFmtId(style.numFmt)}" fontId="${fontId}" fillId="${fillId}" borderId="${borderId}" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">` +
          `<alignment horizontal="${style.align}" vertical="center"/></xf>`,
      );
      this.xfIds.set(key, index);
    }
    return index;
  }

  xml(headerText: string): string {
    const formats = [...this.customFormats].map(([format, id]) => `<numFmt numFmtId="${id}" formatCode="${escapeXml(format)}"/>`).join('');
    return (
      XML_HEADER +
      `<styleSheet xmlns="${MAIN_NS}">` +
      (formats ? `<numFmts count="${this.customFormats.size}">${formats}</numFmts>` : '') +
      '<fonts count="2">' +
      `<font><sz val="11"/><color rgb="${toArgb(BODY_TEXT)}"/><name val="Calibri"/><family val="2"/></font>` +
      `<font><b/><sz val="11"/><color rgb="${headerText}"/><name val="Calibri"/><family val="2"/></font>` +
      '</fonts>' +
      '<fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>' +
      `<fill><patternFill patternType="solid"><fgColor rgb="${this.headerFill}"/><bgColor indexed="64"/></patternFill></fill>` +
      `<fill><patternFill patternType="solid"><fgColor rgb="${this.zebraFill ?? 'FFFFFFFF'}"/><bgColor indexed="64"/></patternFill></fill></fills>` +
      '<borders count="3"><border><left/><right/><top/><bottom/><diagonal/></border>' +
      `<border><left/><right/><top/><bottom style="thin"><color rgb="${toArgb(BODY_BORDER)}"/></bottom><diagonal/></border>` +
      `<border><left/><right/><top/><bottom style="medium"><color rgb="${this.headerFill}"/></bottom><diagonal/></border></borders>` +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      `<cellXfs count="${this.xfs.length}">${this.xfs.join('')}</cellXfs>` +
      '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
      '</styleSheet>'
    );
  }
}

function cellXml(cell: StyledXlsxCell, ref: string, style: number): string {
  if (cell === null || cell === '') {
    return `<c r="${ref}" s="${style}"/>`; // cellule vide mais mise en forme (fond, filet)
  }
  if (cell instanceof Date) {
    return Number.isNaN(cell.getTime()) ? `<c r="${ref}" s="${style}"/>` : `<c r="${ref}" s="${style}"><v>${excelSerial(cell)}</v></c>`;
  }
  if (typeof cell === 'number' && Number.isFinite(cell)) {
    return `<c r="${ref}" s="${style}"><v>${cell}</v></c>`;
  }
  if (typeof cell === 'boolean') {
    return `<c r="${ref}" s="${style}" t="b"><v>${cell ? 1 : 0}</v></c>`;
  }
  const text = String(cell);
  const preserve = /^\s|\s$/.test(text) ? ' xml:space="preserve"' : '';
  return `<c r="${ref}" s="${style}" t="inlineStr"><is><t${preserve}>${escapeXml(text)}</t></is></c>`;
}

/** Largeur d'une colonne en caractères, d'après son contenu (bornée entre 8 et 60). */
function autoWidth(header: string, values: readonly StyledXlsxCell[], kind: Kind): number {
  let longest = header.length + 3; // la flèche du filtre automatique
  for (const value of values) {
    let length = 0;
    if (value instanceof Date) {
      length = kind === 'datetime' ? 16 : 10;
    } else if (typeof value === 'number') {
      length = value.toLocaleString('fr-FR', {maximumFractionDigits: 2}).length + 1;
    } else if (typeof value === 'boolean') {
      length = 5;
    } else if (value !== null) {
      length = Math.max(...String(value).split(/\r?\n/).map((line) => line.length));
    }
    longest = Math.max(longest, length);
  }
  return Math.min(60, Math.max(8, longest + 2));
}

/**
 * Classeur Excel d'une feuille, mis en forme. `matrix[0]` est la ligne d'en-têtes ; les autres sont des lignes de données.
 */
export function toStyledXlsx(matrix: readonly (readonly StyledXlsxCell[])[], options: StyledXlsxOptions = {}): Uint8Array {
  const headerFill = toArgb(options.headerFill) ?? toArgb(DEFAULT_HEADER_FILL)!;
  const headerText = toArgb(options.headerColor) ?? contrastingText(headerFill);
  const zebra = options.zebra === false ? null : (toArgb(typeof options.zebra === 'string' ? options.zebra : undefined) ?? toArgb(DEFAULT_ZEBRA));
  const book = new StyleBook(headerFill, zebra);

  const header = matrix[0] ?? [];
  const body = matrix.slice(1);
  const columnCount = Math.max(header.length, ...body.map((row) => row.length), 1);
  const sheetName = sanitizeSheetName(options.sheetName ?? 'Export');

  const columns = Array.from({length: columnCount}, (_, index) => {
    const values = body.map((row) => row[index] ?? null);
    const kind = kindOf(values);
    const custom = options.columns?.[index];
    const numFmt =
      custom?.numFmt ??
      (kind === 'decimal' ? '#,##0.00' : kind === 'integer' ? '#,##0' : kind === 'date' ? DATE_FORMAT : kind === 'datetime' ? DATETIME_FORMAT : 'General');
    const numeric = kind === 'decimal' || kind === 'integer' || kind === 'smallInteger';
    const align = custom?.align ?? (numeric ? 'right' : kind === 'boolean' || kind === 'date' || kind === 'datetime' ? 'center' : 'left');
    return {
      numFmt,
      align,
      width: custom?.width ?? autoWidth(String(header[index] ?? ''), values, kind),
      headerStyle: book.xf({numFmt: 'General', fill: 'header', border: 'header', font: 'header', align}),
      bodyStyle: (stripe: boolean) => book.xf({numFmt, fill: stripe && zebra ? 'zebra' : 'none', border: 'body', font: 'body', align}),
    };
  });

  const lastRef = `${columnLetter(columnCount - 1)}${Math.max(matrix.length, 1)}`;
  const headerRow =
    `<row r="1" ht="24" customHeight="1">${columns.map((column, index) => cellXml(header[index] ?? null, `${columnLetter(index)}1`, column.headerStyle)).join('')}</row>`;
  const rows = body
    .map((row, rowIndex) => {
      const stripe = rowIndex % 2 === 1;
      const cells = columns.map((column, index) => cellXml(row[index] ?? null, `${columnLetter(index)}${rowIndex + 2}`, column.bodyStyle(stripe))).join('');
      return `<row r="${rowIndex + 2}" ht="20" customHeight="1">${cells}</row>`;
    })
    .join('');

  const filter = options.autoFilter !== false;
  const sheet =
    XML_HEADER +
    `<worksheet xmlns="${MAIN_NS}">` +
    '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>' +
    `<dimension ref="A1:${lastRef}"/>` +
    '<sheetViews><sheetView showGridLines="0" workbookViewId="0">' +
    '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/>' +
    '</sheetView></sheetViews>' +
    '<sheetFormatPr defaultRowHeight="20" customHeight="1"/>' +
    `<cols>${columns.map((column, index) => `<col min="${index + 1}" max="${index + 1}" width="${column.width}" customWidth="1"/>`).join('')}</cols>` +
    `<sheetData>${headerRow}${rows}</sheetData>` +
    (filter ? `<autoFilter ref="A1:${lastRef}"/>` : '') +
    '<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/>' +
    '<pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/>' +
    '</worksheet>';

  const quoted = `'${sheetName.replace(/'/g, "''")}'`;
  const workbook =
    XML_HEADER +
    `<workbook xmlns="${MAIN_NS}" xmlns:r="${DOC_REL}">` +
    `<sheets><sheet name="${escapeXml(sheetName)}" sheetId="1" r:id="rId1"/></sheets>` +
    '<definedNames>' +
    (filter ? `<definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">${escapeXml(quoted)}!$A$1:$${columnLetter(columnCount - 1)}$${Math.max(matrix.length, 1)}</definedName>` : '') +
    `<definedName name="_xlnm.Print_Titles" localSheetId="0">${escapeXml(quoted)}!$1:$1</definedName>` +
    '</definedNames></workbook>';

  return zipStored([
    {name: '[Content_Types].xml', content: CONTENT_TYPES},
    {name: '_rels/.rels', content: ROOT_RELS},
    {name: 'xl/workbook.xml', content: workbook},
    {name: 'xl/_rels/workbook.xml.rels', content: WORKBOOK_RELS},
    {name: 'xl/styles.xml', content: book.xml(headerText)},
    {name: 'xl/worksheets/sheet1.xml', content: sheet},
  ]);
}
