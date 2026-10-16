/**
 * Comparaison de texte ASCII imprimable, équivalente à `Intl.Collator` mais environ dix fois plus
 * rapide : sur un million de valeurs distinctes, le tri par `collator.compare` coûtait plusieurs
 * secondes.
 *
 * Le comparateur n'est pas écrit « de mémoire » d'après les règles ICU : il est construit à partir
 * du collateur donné (rang de chaque caractère mesuré par le collateur lui-même) et vérifié
 * contre lui sur un corpus d'essai avant la première utilisation. S'il diffère, `null` est renvoyé
 * et l'appelant garde `collator.compare` : le résultat reste toujours celui du collateur.
 */

const FIRST = 32;
const LAST = 126;

/** Tous les caractères sont dans l'ASCII imprimable (32 à 126). */
export function isPrintableAscii(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code < FIRST || code > LAST) {
      return false;
    }
  }
  return true;
}

type Comparator = (a: string, b: string) => number;

/** Outils de comparaison rapide d'un collateur. */
export interface AsciiCollation {
  /** Même signe que `collator.compare`, pour deux textes ASCII imprimables. */
  compare: Comparator;
  /**
   * Clé de tri : comparer deux clés avec `<` (ordre des unités UTF-16, natif, donc très rapide)
   * donne le même ordre que `compare` sur les textes. Deux textes égaux pour le collateur ont la
   * même clé. `null` pour un texte trop long.
   */
  key: (text: string) => string | null;
  /**
   * Même clé, écrite en octets dans `out` à partir de `offset` (ordre : comparaison octet par octet,
   * un texte qui est le début d'un autre passe avant). Renvoie la longueur écrite, ou -1 si une suite
   * de chiffres est trop longue pour tenir sur un octet.
   */
  keyInto: (text: string, out: Uint8Array, offset: number) => number;
}

/** Longueur maximale d'une suite de chiffres dans une clé en octets. */
const MAX_DIGIT_RUN = 120;

const cache = new WeakMap<Intl.Collator, AsciiCollation | null>();

/** Outils rapides pour les textes ASCII imprimables selon `collator`, ou `null` s'ils ne lui sont pas équivalents. */
export function asciiCollation(collator: Intl.Collator): AsciiCollation | null {
  if (cache.has(collator)) {
    return cache.get(collator)!;
  }
  const built = build(collator);
  const verified = built && agrees(built, collator) ? built : null;
  cache.set(collator, verified);
  return verified;
}

/** Comparateur rapide pour les textes ASCII imprimables selon `collator`, ou `null` s'il ne lui est pas équivalent. */
export function asciiComparator(collator: Intl.Collator): Comparator | null {
  return asciiCollation(collator)?.compare ?? null;
}

/** Longueur maximale d'un texte pour construire sa clé de tri. */
const MAX_KEY_SOURCE = 256;

const isDigit = (code: number) => code >= 48 && code <= 57;

function build(collator: Intl.Collator): AsciiCollation | null {
  const numeric = collator.resolvedOptions().numeric;
  // Rang de chaque caractère : deux caractères égaux pour le collateur (« a » et « A » en
  // `sensitivity: 'base'`) ont le même rang.
  const chars = Array.from({length: LAST - FIRST + 1}, (_, i) => String.fromCharCode(FIRST + i));
  const sorted = [...chars].sort((a, b) => collator.compare(a, b));
  const rank = new Int32Array(128);
  let current = 0;
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && collator.compare(sorted[i - 1], sorted[i]) !== 0) {
      current++;
    }
    rank[sorted[i].charCodeAt(0)] = current;
  }

  const digitClass = rank[48] + 1;
  const buffer = new Uint16Array(MAX_KEY_SOURCE * 2 + 8);

  const key = (text: string): string | null => {
    const length = text.length;
    if (length > MAX_KEY_SOURCE) {
      return null;
    }
    let out = 0;
    let i = 0;
    while (i < length) {
      const code = text.charCodeAt(i);
      if (numeric && isDigit(code)) {
        // Suite de chiffres : classe « chiffre », puis sa longueur (sans les zéros de tête), puis les chiffres.
        let start = i;
        while (start < length && text.charCodeAt(start) === 48) {
          start++;
        }
        let end = start;
        while (end < length && isDigit(text.charCodeAt(end))) {
          end++;
        }
        buffer[out++] = digitClass;
        buffer[out++] = 0x100 + (end - start);
        for (let k = start; k < end; k++) {
          buffer[out++] = text.charCodeAt(k);
        }
        i = end;
      } else {
        buffer[out++] = rank[code] + 1;
        i++;
      }
    }
    return String.fromCharCode.apply(null, buffer.subarray(0, out) as unknown as number[]);
  };

  const keyInto = (text: string, out: Uint8Array, offset: number): number => {
    const length = text.length;
    let at = offset;
    let i = 0;
    while (i < length) {
      const code = text.charCodeAt(i);
      if (numeric && isDigit(code)) {
        let start = i;
        while (start < length && text.charCodeAt(start) === 48) {
          start++;
        }
        let end = start;
        while (end < length && isDigit(text.charCodeAt(end))) {
          end++;
        }
        if (end - start > MAX_DIGIT_RUN) {
          return -1;
        }
        out[at++] = digitClass;
        out[at++] = 0x80 + (end - start);
        for (let k = start; k < end; k++) {
          out[at++] = text.charCodeAt(k);
        }
        i = end;
      } else {
        out[at++] = rank[code] + 1;
        i++;
      }
    }
    return at - offset;
  };

  const compare: Comparator = (a, b) => {
    const la = a.length;
    const lb = b.length;
    let i = 0;
    let j = 0;
    while (i < la && j < lb) {
      const ca = a.charCodeAt(i);
      const cb = b.charCodeAt(j);
      if (numeric && isDigit(ca) && isDigit(cb)) {
        // Suites de chiffres : comparées comme des nombres (zéros de tête ignorés).
        let si = i;
        while (si < la && a.charCodeAt(si) === 48) {
          si++;
        }
        let sj = j;
        while (sj < lb && b.charCodeAt(sj) === 48) {
          sj++;
        }
        let ei = si;
        while (ei < la && isDigit(a.charCodeAt(ei))) {
          ei++;
        }
        let ej = sj;
        while (ej < lb && isDigit(b.charCodeAt(ej))) {
          ej++;
        }
        const lengthA = ei - si;
        const lengthB = ej - sj;
        if (lengthA !== lengthB) {
          return lengthA < lengthB ? -1 : 1;
        }
        for (let k = 0; k < lengthA; k++) {
          const diff = a.charCodeAt(si + k) - b.charCodeAt(sj + k);
          if (diff !== 0) {
            return diff < 0 ? -1 : 1;
          }
        }
        i = ei;
        j = ej;
        continue;
      }
      const ra = rank[ca];
      const rb = rank[cb];
      if (ra !== rb) {
        return ra < rb ? -1 : 1;
      }
      i++;
      j++;
    }
    if (i < la) {
      return 1;
    }
    return j < lb ? -1 : 0;
  };

  return {compare, key, keyInto};
}

/** Le comparateur donne le même signe que le collateur sur un corpus varié (casse, chiffres, zéros de tête, ponctuation). */
function agrees({compare: comparator, key, keyInto}: AsciiCollation, collator: Intl.Collator): boolean {
  let seed = 123456789;
  const next = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  const pools = ['abcXYZ', '0123456789', ' -_./:,;()#&@', 'aA09- ', '0019'];
  const words: string[] = ['', '0', '00', '000', '1', '01', '001', '10', '010', '9', '09', 'a', 'A', 'a1', 'a01', 'a001', 'a10', 'a2', 'CMD-0001', 'cmd-001', 'CMD-10', 'x-1-2', 'x-01-02', ' a', 'a ', '-', '_', '--', 'a-b', 'a_b', 'ab'];
  for (let i = 0; i < 1500; i++) {
    const pool = pools[Math.floor(next() * pools.length)];
    const length = Math.floor(next() * 9);
    let word = '';
    for (let k = 0; k < length; k++) {
      word += pool[Math.floor(next() * pool.length)];
    }
    words.push(word);
  }
  const sign = (value: number) => (value < 0 ? -1 : value > 0 ? 1 : 0);
  const keys = words.map((word) => key(word));
  if (keys.some((value) => value === null)) {
    return false;
  }
  const keyOrder = (i: number, j: number) => (keys[i]! < keys[j]! ? -1 : keys[i]! > keys[j]! ? 1 : 0);
  const bytes = words.map((word) => {
    const out = new Uint8Array(word.length * 2 + 4);
    return out.subarray(0, Math.max(0, keyInto(word, out, 0)));
  });
  const byteOrder = (i: number, j: number) => {
    const a = bytes[i];
    const b = bytes[j];
    for (let k = 0; k < Math.min(a.length, b.length); k++) {
      if (a[k] !== b[k]) {
        return a[k] < b[k] ? -1 : 1;
      }
    }
    return sign(a.length - b.length);
  };
  const matches = (i: number, j: number) => {
    const expected = sign(collator.compare(words[i], words[j]));
    return sign(comparator(words[i], words[j])) === expected && keyOrder(i, j) === expected && byteOrder(i, j) === expected;
  };
  for (let i = 0; i < words.length; i++) {
    for (let n = 0; n < 12; n++) {
      if (!matches(i, Math.floor(next() * words.length))) {
        return false;
      }
    }
  }
  // Tous les couples du petit jeu fixe (les cas limites).
  for (let i = 0; i < 32; i++) {
    for (let j = 0; j < 32; j++) {
      if (!matches(i, j)) {
        return false;
      }
    }
  }
  return true;
}
