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

export type TagChoice = 'include' | 'exclude' | 'off';

export function tagChoice(draft: QueryDraft, tagId: number): TagChoice {
  if (draft.include.includes(tagId)) return 'include';
  if (draft.exclude.includes(tagId)) return 'exclude';
  return 'off';
}

/**
 * One tap on a tag in the builder: off → include → exclude → off. Every state
 * shows on the chip, so the cycle teaches itself.
 */
export function cycleTag(draft: QueryDraft, tagId: number): QueryDraft {
  const without = (ids: number[]) => ids.filter((id) => id !== tagId);
  switch (tagChoice(draft, tagId)) {
    case 'off':
      return { ...draft, include: [...draft.include, tagId] };
    case 'include':
      return { ...draft, include: without(draft.include), exclude: [...draft.exclude, tagId] };
    case 'exclude':
      return { ...draft, exclude: without(draft.exclude) };
  }
}

export function isEmptyDraft(draft: QueryDraft): boolean {
  return draft.include.length === 0 && draft.exclude.length === 0;
}

/** Drop tags that no longer exist, e.g. from a mix saved before a tag was deleted. */
export function pruneDraft(draft: QueryDraft, existing: ReadonlySet<number>): QueryDraft {
  return {
    ...draft,
    include: draft.include.filter((id) => existing.has(id)),
    exclude: draft.exclude.filter((id) => existing.has(id)),
  };
}
