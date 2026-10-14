/**
 * Données arborescentes : index parent / enfants, filtrage qui garde les ancêtres, et mise à plat
 * des lignes visibles dans l'ordre d'affichage. Fonctions pures, sans Angular.
 */

export interface TreeIndex {
  /** Clé du parent de chaque ligne ; absente pour une racine. */
  parent: Map<unknown, unknown>;
  /** Clés des enfants de chaque ligne, dans l'ordre d'arrivée. */
  children: Map<unknown, unknown[]>;
  /** Profondeur de chaque ligne (0 = racine). */
  depth: Map<unknown, number>;
}

/**
 * Aplatit des lignes imbriquées (`children`) en liste à plat, parents avant leurs enfants.
 * Renvoie aussi la clé du parent de chaque ligne.
 */
export function flattenNested<T>(
  roots: readonly T[],
  childrenOf: (row: T) => readonly T[] | null | undefined,
  keyOf: (row: T) => unknown,
): { rows: T[]; parents: Map<unknown, unknown> } {
  const rows: T[] = [];
  const parents = new Map<unknown, unknown>();
  const seen = new Set<unknown>();
  // Pile explicite : des arbres très profonds ne doivent pas faire déborder la pile d'appels.
  const stack: { row: T; parentKey: unknown }[] = [];
  for (let index = roots.length - 1; index >= 0; index--) {
    stack.push({row: roots[index], parentKey: undefined});
  }
  while (stack.length > 0) {
    const {row, parentKey} = stack.pop()!;
    const key = keyOf(row);
    if (seen.has(key)) {
      continue; // clé en double ou cycle : la première occurrence l'emporte
    }
    seen.add(key);
    rows.push(row);
    if (parentKey !== undefined) {
      parents.set(key, parentKey);
    }
    const children = childrenOf(row);
    if (children) {
      for (let index = children.length - 1; index >= 0; index--) {
        stack.push({row: children[index], parentKey: key});
      }
    }
  }
  return {rows, parents};
}

/**
 * Index d'un arbre à partir de lignes à plat. `parentKeyOf` donne la clé du parent (`null` ou
 * `undefined` pour une racine). Un parent inconnu fait de la ligne une racine, et un cycle est coupé.
 */
export function buildTreeIndex<T>(
  rows: readonly T[],
  keyOf: (row: T) => unknown,
  parentKeyOf: (row: T) => unknown,
): TreeIndex {
  const known = new Set<unknown>();
  for (const row of rows) {
    known.add(keyOf(row));
  }
  const parent = new Map<unknown, unknown>();
  const children = new Map<unknown, unknown[]>();
  for (const row of rows) {
    const key = keyOf(row);
    const parentKey = parentKeyOf(row);
    if (parentKey === null || parentKey === undefined || Object.is(parentKey, key) || !known.has(parentKey)) {
      continue;
    }
    parent.set(key, parentKey);
    const siblings = children.get(parentKey);
    if (siblings) {
      siblings.push(key);
    } else {
      children.set(parentKey, [key]);
    }
  }

  const depth = new Map<unknown, number>();
  for (const row of rows) {
    const start = keyOf(row);
    if (depth.has(start)) {
      continue;
    }
    // Remonte jusqu'à une racine (ou un nœud déjà connu), puis redescend en numérotant.
    const chain: unknown[] = [];
    const onChain = new Set<unknown>();
    let key: unknown = start;
    let base = -1;
    while (key !== undefined) {
      if (depth.has(key)) {
        base = depth.get(key)!;
        break;
      }
      if (onChain.has(key)) {
        // Cycle : on coupe le lien qui boucle, ce nœud devient une racine.
        const parentKey = parent.get(key);
        parent.delete(key);
        children.set(parentKey, (children.get(parentKey) ?? []).filter((child) => !Object.is(child, key)));
        // `key` devient une racine : seuls les nœuds sous lui dans la chaîne sont numérotés ici,
        // ceux au-dessus (le reste du cycle) le seront à leur tour, depuis `key`.
        chain.length = chain.indexOf(key) + 1;
        break;
      }
      chain.push(key);
      onChain.add(key);
      key = parent.get(key);
    }
    for (let index = chain.length - 1; index >= 0; index--) {
      depth.set(chain[index], ++base);
    }
  }
  return {parent, children, depth};
}

/** Les clés données plus tous leurs ancêtres. */
export function withAncestors(keys: Iterable<unknown>, index: TreeIndex): Set<unknown> {
  const result = new Set<unknown>();
  for (const start of keys) {
    let key: unknown = start;
    while (key !== undefined && !result.has(key)) {
      result.add(key);
      key = index.parent.get(key);
    }
  }
  return result;
}

/**
 * Lignes visibles dans l'ordre d'affichage : chaque parent suivi de ses enfants, dans l'ordre
 * de `sorted` (donc trié entre frères), sans les descendants d'un nœud replié.
 * `sorted` ne contient que les lignes retenues (filtre, ancêtres compris).
 */
export function layoutTree<T>(
  sorted: readonly T[],
  keyOf: (row: T) => unknown,
  index: TreeIndex,
  isExpanded: (key: unknown, depth: number) => boolean,
): T[] {
  const present = new Set<unknown>();
  for (const row of sorted) {
    present.add(keyOf(row));
  }
  const ROOT = Symbol('root');
  const byParent = new Map<unknown, T[]>();
  for (const row of sorted) {
    const parentKey = index.parent.get(keyOf(row));
    const bucket = parentKey !== undefined && present.has(parentKey) ? parentKey : ROOT;
    const list = byParent.get(bucket);
    if (list) {
      list.push(row);
    } else {
      byParent.set(bucket, [row]);
    }
  }
  const out: T[] = [];
  const stack: T[] = [];
  const roots = byParent.get(ROOT) ?? [];
  for (let i = roots.length - 1; i >= 0; i--) {
    stack.push(roots[i]);
  }
  while (stack.length > 0) {
    const row = stack.pop()!;
    out.push(row);
    const key = keyOf(row);
    const kids = byParent.get(key);
    if (kids && isExpanded(key, index.depth.get(key) ?? 0)) {
      for (let i = kids.length - 1; i >= 0; i--) {
        stack.push(kids[i]);
      }
    }
  }
  return out;
}
