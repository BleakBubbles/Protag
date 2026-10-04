import type { TagRow } from '../db/types';

/** Separator for displaying a tag's path, e.g. "asian-pop › kpop". */
export const PATH_SEPARATOR = ' › ';

/**
 * In-memory view of the whole tag tree, built from one `listTags` query.
 *
 * The tree is small (hundreds of tags at most), so screens that need paths,
 * children, or valid move targets compute them here rather than each issuing
 * recursive queries. Pure, so it's unit-tested without a database.
 */
export interface TagIndex {
  byId: ReadonlyMap<number, TagRow>;
  /** Direct children, by name. `null` for top-level tags. */
  children(parentId: number | null): TagRow[];
  /** Root → tag, inclusive. Empty if the tag doesn't exist. */
  path(id: number): TagRow[];
  /** "asian-pop › kpop" */
  label(id: number): string;
  /** Every tag below this one, not including itself. */
  descendantIds(id: number): Set<number>;
  /**
   * Tags this one may be moved under: everything except itself and its own
   * descendants (moving into your own subtree would create a cycle), sorted by
   * path label. Doesn't include "top level" — that's `null`, offered separately.
   */
  validParents(id: number): TagRow[];
  /** Every tag, sorted by path label — the order pickers show them in. */
  all(): TagRow[];
}

const byName = (a: TagRow, b: TagRow) =>
  a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });

export function buildTagIndex(tags: readonly TagRow[]): TagIndex {
  const byId = new Map(tags.map((t) => [t.id, t]));
  const childrenOf = new Map<number | null, TagRow[]>();
  for (const tag of tags) {
    const list = childrenOf.get(tag.parent_id);
    if (list) list.push(tag);
    else childrenOf.set(tag.parent_id, [tag]);
  }
  for (const list of childrenOf.values()) list.sort(byName);

  const path = (id: number): TagRow[] => {
    const out: TagRow[] = [];
    const seen = new Set<number>(); // the DB prevents cycles; don't loop forever if one slips in
    let current = byId.get(id);
    while (current && !seen.has(current.id)) {
      seen.add(current.id);
      out.unshift(current);
      current = current.parent_id === null ? undefined : byId.get(current.parent_id);
    }
    return out;
  };

  const label = (id: number) =>
    path(id)
      .map((t) => t.name)
      .join(PATH_SEPARATOR);

  const descendantIds = (id: number): Set<number> => {
    const out = new Set<number>();
    const stack = [...(childrenOf.get(id) ?? [])];
    while (stack.length > 0) {
      const tag = stack.pop()!;
      if (out.has(tag.id)) continue;
      out.add(tag.id);
      stack.push(...(childrenOf.get(tag.id) ?? []));
    }
    return out;
  };

  const sortedByLabel = (list: TagRow[]) =>
    list
      .map((t) => ({ t, key: label(t.id) }))
      .sort((a, b) => a.key.localeCompare(b.key, undefined, { sensitivity: 'base' }))
      .map(({ t }) => t);

  return {
    byId,
    children: (parentId) => childrenOf.get(parentId) ?? [],
    path,
    label,
    descendantIds,
    validParents(id) {
      const excluded = descendantIds(id);
      excluded.add(id);
      return sortedByLabel(tags.filter((t) => !excluded.has(t.id)));
    },
    all: () => sortedByLabel([...tags]),
  };
}
