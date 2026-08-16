/**
 * The shape of a ProTag query.
 *
 * This AST is the contract between the visual builder, the SQL compiler, and the
 * saved-query store. A text query language ("driving AND kpop NOT sad") would parse
 * to exactly this, which is what keeps that option open without a redesign.
 */
export type TagQuery =
  | { type: 'all' }
  | { type: 'tag'; tagId: number; includeDescendants: boolean }
  | { type: 'and'; children: TagQuery[] }
  | { type: 'or'; children: TagQuery[] }
  | { type: 'not'; child: TagQuery }
  | { type: 'untagged' };

export const MATCH_ALL: TagQuery = { type: 'all' };

/** What the visual builder edits. Compiles to a `TagQuery` via `buildQuery`. */
export interface QueryDraft {
  /** Tags that must match. Combined by `mode`. */
  include: number[];
  /** Tags that must not match. Always AND-ed as exclusions. */
  exclude: number[];
  /** Whether include/exclude tags also match their subtags. */
  includeDescendants: boolean;
  mode: 'and' | 'or';
}

export const EMPTY_DRAFT: QueryDraft = {
  include: [],
  exclude: [],
  includeDescendants: true,
  mode: 'and',
};

/**
 * Turn builder state into a query.
 *
 * Exclusions are always AND-ed even in "or" mode: "any of these, but never that"
 * is what people mean, whereas OR-ing an exclusion would make it match everything.
 */
export function buildQuery(draft: QueryDraft): TagQuery {
  const leaf = (tagId: number): TagQuery => ({
    type: 'tag',
    tagId,
    includeDescendants: draft.includeDescendants,
  });

  const includes = draft.include.map(leaf);
  const base: TagQuery =
    includes.length === 0
      ? { type: 'all' }
      : includes.length === 1
        ? includes[0]
        : { type: draft.mode, children: includes };

  if (draft.exclude.length === 0) return base;

  const exclusions: TagQuery[] = draft.exclude.map((id) => ({ type: 'not', child: leaf(id) }));
  return { type: 'and', children: [base, ...exclusions] };
}

/** True when the query would match the entire library, i.e. nothing was specified. */
export function isEmptyQuery(query: TagQuery): boolean {
  return query.type === 'all';
}
