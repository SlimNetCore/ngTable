/**
 * Tri rapide des lignes : chaque niveau de tri est converti en une colonne de nombres, puis les
 * indices sont triés par un tri par base (radix) stable, niveau par niveau, du moins au plus
 * important. Pas de comparaison, pas d'objet par ligne : environ dix fois plus rapide que
 * `Array.sort` avec un comparateur sur un million de lignes.
 *
 * Le résultat est celui de `sortRows` : mêmes vides en dernier dans les deux sens, mêmes égalités
 * départagées par l'ordre d'origine. Quand un niveau contient des valeurs qu'on ne sait pas
 * ranger en nombres (types mêlés, dates invalides, NaN), `buildSortOrder` renvoie `null` et
 * l'appelant retombe sur le tri générique.
 */
import {asciiCollation, isPrintableAscii} from './ascii-collation';
import type {SortLevel, SortValue} from './row-pipeline';
import {getSortValue} from './row-pipeline';

const EMPTY = Number.POSITIVE_INFINITY;

/** Colonne de clés numériques d'un niveau de tri, déjà multipliée par le sens (±1) ; `null` si impossible. */
export function sortKeyColumn<T>(rows: readonly T[], level: SortLevel<T>, collator: Intl.Collator): Float64Array | null {
  const count = rows.length;
  const values: SortValue[] = new Array<SortValue>(count);
  let kind: 'number' | 'boolean' | 'date' | 'string' | null = null;
  for (let i = 0; i < count; i++) {
    const value = getSortValue(rows[i], level.column);
    values[i] = value;
    if (value === null || value === undefined) {
      continue;
    }
    const current = value instanceof Date ? 'date' : typeof value === 'number' ? 'number' : typeof value === 'boolean' ? 'boolean' : 'string';
    if (kind === null) {
      kind = current;
    } else if (kind !== current) {
      return null; // types mêlés : le tri générique sait les comparer
    }
  }

  const keys = new Float64Array(count);
  const factor = level.factor;
  if (kind === null) {
    keys.fill(EMPTY);
    return keys;
  }

  if (kind === 'string') {
    return stringRanks(values as (string | null)[], factor, collator, keys);
  }

  for (let i = 0; i < count; i++) {
    const value = values[i];
    if (value === null || value === undefined) {
      keys[i] = EMPTY;
      continue;
    }
    const number = kind === 'date' ? (value as Date).getTime() : kind === 'boolean' ? Number(value) : (value as number);
    if (Number.isNaN(number)) {
      return null;
    }
    // `+ 0` : -0 devient 0, les deux sont égaux pour le tri générique.
    keys[i] = Math.max(-Number.MAX_VALUE, Math.min(Number.MAX_VALUE, number * factor)) + 0;
  }
  return keys;
}

/** Part de valeurs distinctes en dessous de laquelle on classe les valeurs distinctes plutôt que toutes les lignes. */
const LOW_CARDINALITY = 0.25;

/** Rang de chaque chaîne selon `collator` ; deux chaînes égales pour lui ont le même rang. */
function stringRanks(values: (string | null)[], factor: number, collator: Intl.Collator, keys: Float64Array): Float64Array {
  const fast = asciiCollation(collator);
  if (fast && sampleDistinctRatio(values) > LOW_CARDINALITY) {
    // Beaucoup de valeurs distinctes (références, identifiants...) : clés de tri en octets triées par
    // un tri par base, ou à défaut comparées par le tri natif, sans comparateur JavaScript.
    const ranked = rankByKeyBytes(values, factor, fast.keyInto, keys) ?? rankByKeys(values, factor, fast.key, keys);
    if (ranked) {
      return ranked;
    }
  }
  const distinct = new Map<string, number>();
  for (const value of values) {
    if (value !== null && value !== undefined && !distinct.has(value)) {
      distinct.set(value, 0);
    }
  }
  const sorted = [...distinct.keys()];
  // Textes ASCII : un comparateur équivalent au collateur (vérifié contre lui), bien plus rapide.
  const compare = fast && sorted.every(isPrintableAscii) ? fast.compare : collator.compare;
  sorted.sort(compare);
  let rank = 0;
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && compare(sorted[i - 1], sorted[i]) !== 0) {
      rank++;
    }
    distinct.set(sorted[i], rank);
  }
  for (let i = 0; i < values.length; i++) {
    const value = values[i];
    keys[i] = value === null || value === undefined ? EMPTY : distinct.get(value)! * factor + 0;
  }
  return keys;
}

/** Proportion de valeurs distinctes parmi les 2 000 premières (1 = toutes différentes). */
function sampleDistinctRatio(values: (string | null)[]): number {
  const seen = new Set<string>();
  const size = Math.min(values.length, 2000);
  for (let i = 0; i < size; i++) {
    const value = values[i];
    if (value !== null && value !== undefined) {
      seen.add(value);
    }
  }
  return size === 0 ? 0 : seen.size / size;
}

/** Longueur maximale d'une clé en octets pour le tri par base (au-delà : tri natif des clés). */
const MAX_KEY_BYTES = 64;

/**
 * Rangs obtenus en triant les clés de tri, écrites en octets, par un tri par base position par
 * position (du dernier octet au premier, chaque passe est stable : à clé égale, l'ordre d'origine
 * est gardé). Les positions où tous les octets sont égaux (préfixe commun) sont sautées. `null` si
 * une valeur n'est pas de l'ASCII imprimable ou si les clés sont trop longues.
 */
function rankByKeyBytes(
  values: (string | null)[],
  factor: number,
  keyInto: (text: string, out: Uint8Array, offset: number) => number,
  keys: Float64Array,
): Float64Array | null {
  const count = values.length;
  let longest = 0;
  for (let i = 0; i < count; i++) {
    const value = values[i];
    if (value !== null && value !== undefined) {
      if (value.length * 2 > MAX_KEY_BYTES * 4) {
        return null;
      }
      longest = Math.max(longest, value.length);
    }
  }
  const stride = longest * 2 + 1; // une clé fait au plus deux octets par caractère
  const bytes = new Uint8Array(count * stride);
  const lengths = new Uint8Array(count);
  const present: number[] = [];
  let width = 0;
  for (let i = 0; i < count; i++) {
    const value = values[i];
    if (value === null || value === undefined) {
      keys[i] = EMPTY;
      continue;
    }
    if (!isPrintableAscii(value)) {
      return null;
    }
    const length = keyInto(value, bytes, i * stride);
    if (length < 0 || length > MAX_KEY_BYTES) {
      return null;
    }
    lengths[i] = length;
    width = Math.max(width, length);
    present.push(i);
  }

  let source = Uint32Array.from(present);
  let target = new Uint32Array(source.length);
  const histogram = new Uint32Array(256);
  for (let position = width - 1; position >= 0; position--) {
    histogram.fill(0);
    for (const row of source) {
      histogram[bytes[row * stride + position]]++;
    }
    if (histogram[bytes[source[0] * stride + position]] === source.length) {
      continue;
    }
    let sum = 0;
    for (let bucket = 0; bucket < 256; bucket++) {
      const size = histogram[bucket];
      histogram[bucket] = sum;
      sum += size;
    }
    for (const row of source) {
      target[histogram[bytes[row * stride + position]]++] = row;
    }
    [source, target] = [target, source];
  }

  let rank = -1;
  let previous = -1;
  for (const row of source) {
    if (previous < 0 || !sameKey(bytes, stride, lengths, previous, row)) {
      rank++;
    }
    keys[row] = rank * factor + 0;
    previous = row;
  }
  return keys;
}

function sameKey(bytes: Uint8Array, stride: number, lengths: Uint8Array, a: number, b: number): boolean {
  const length = lengths[a];
  if (length !== lengths[b]) {
    return false;
  }
  const from = a * stride;
  const other = b * stride;
  for (let i = 0; i < length; i++) {
    if (bytes[from + i] !== bytes[other + i]) {
      return false;
    }
  }
  return true;
}

/**
 * Rangs obtenus en triant, par le tri natif, des chaînes « clé de tri + indice de ligne ». À clé
 * égale l'indice départage, ce qui garde l'ordre d'origine. `null` si une valeur n'est pas de
 * l'ASCII imprimable ou est trop longue : l'appelant utilise alors un comparateur.
 */
function rankByKeys(values: (string | null)[], factor: number, keyOf: (text: string) => string | null, keys: Float64Array): Float64Array | null {
  const count = values.length;
  const composites: string[] = [];
  for (let i = 0; i < count; i++) {
    const value = values[i];
    if (value === null || value === undefined) {
      keys[i] = EMPTY;
      continue;
    }
    if (!isPrintableAscii(value)) {
      return null;
    }
    const key = keyOf(value);
    if (key === null) {
      return null;
    }
    // Séparateur \0 (plus petit que tout caractère d'une clé), puis l'indice sur deux unités de 16 bits.
    composites.push(key + String.fromCharCode(0, i >>> 16, i & 0xffff));
  }
  composites.sort();
  let rank = -1;
  let previous = '';
  for (const composite of composites) {
    const length = composite.length;
    const prefix = composite.substring(0, length - 3);
    if (prefix !== previous) {
      rank++;
      previous = prefix;
    }
    const index = (composite.charCodeAt(length - 2) << 16) | composite.charCodeAt(length - 1);
    keys[index] = rank * factor + 0;
  }
  return keys;
}

/**
 * Trie `order` (indices) par `keys` croissant, de façon stable, par un tri par base sur les 64 bits
 * des nombres (4 passes de 16 bits ; une passe où tous les chiffres sont égaux est sautée).
 * Modifie et renvoie `order`.
 */
export function radixSortByKeys(order: Uint32Array, keys: Float64Array): Uint32Array {
  const count = order.length;
  // Nombres → entiers de 64 bits qui se trient comme eux (bit de signe, puis complément si négatif).
  const words = new Uint32Array(keys.buffer, keys.byteOffset, keys.length * 2);
  const hi = new Uint32Array(keys.length);
  const lo = new Uint32Array(keys.length);
  for (let i = 0; i < keys.length; i++) {
    const high = words[2 * i + 1];
    const low = words[2 * i];
    if (high & 0x80000000) {
      hi[i] = ~high >>> 0;
      lo[i] = ~low >>> 0;
    } else {
      hi[i] = (high | 0x80000000) >>> 0;
      lo[i] = low;
    }
  }

  let source: Uint32Array = order;
  let target: Uint32Array = new Uint32Array(count);
  const histogram = new Uint32Array(65536);
  for (const [digits, shift] of [[lo, 0], [lo, 16], [hi, 0], [hi, 16]] as const) {
    histogram.fill(0);
    for (let i = 0; i < count; i++) {
      histogram[(digits[source[i]] >>> shift) & 0xffff]++;
    }
    // Tous les éléments dans le même seau : la passe ne changerait rien.
    if (histogram[(digits[source[0]] >>> shift) & 0xffff] === count) {
      continue;
    }
    let sum = 0;
    for (let bucket = 0; bucket < 65536; bucket++) {
      const size = histogram[bucket];
      histogram[bucket] = sum;
      sum += size;
    }
    for (let i = 0; i < count; i++) {
      const index = source[i];
      target[histogram[(digits[index] >>> shift) & 0xffff]++] = index;
    }
    [source, target] = [target, source];
  }
  return source;
}

/**
 * Ordre trié (indices dans `rows`) pour les niveaux donnés, ou `null` si un niveau n'est pas
 * convertible en nombres (voir `sortKeyColumn`).
 */
export function buildSortOrder<T>(rows: readonly T[], levels: readonly SortLevel<T>[], collator: Intl.Collator): Uint32Array | null {
  const count = rows.length;
  let order: Uint32Array = new Uint32Array(count);
  for (let i = 0; i < count; i++) {
    order[i] = i;
  }
  if (count < 2 || levels.length === 0) {
    return order;
  }
  const columns: Float64Array[] = [];
  for (const level of levels) {
    const keys = sortKeyColumn(rows, level, collator);
    if (!keys) {
      return null;
    }
    columns.push(keys);
  }
  // Du niveau le moins important au plus important : chaque passe est stable.
  for (let level = columns.length - 1; level >= 0; level--) {
    order = radixSortByKeys(order, columns[level]);
  }
  return order;
}

/** Lignes triées comme `sortRows`, par tri par base quand c'est possible ; `null` sinon. */
export function sortRowsFast<T>(rows: readonly T[], levels: readonly SortLevel<T>[], collator: Intl.Collator): T[] | null {
  const order = buildSortOrder(rows, levels, collator);
  if (!order) {
    return null;
  }
  const sorted = new Array<T>(rows.length);
  for (let i = 0; i < order.length; i++) {
    sorted[i] = rows[order[i]];
  }
  return sorted;
}
