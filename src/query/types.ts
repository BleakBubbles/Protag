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

/**
 * What the Shuffle tab's builder edits: the pot. Compiles to a `TagQuery` via
 * `buildQuery`.
 *
 * Each ingredient is one or more tags. A song plays if it matches any
 * ingredient, and an ingredient of several tags (combined by dragging one onto
 * another) needs all of them: "either" is the default, "both" is deliberate.
 * Exclusions apply on top. A tag sits in at most one place, so every tile has
 * one state.
 */
export interface QueryDraft {
  ingredients: number[][];
  /** Tags whose songs never play. */
  exclude: number[];
  /** Whether tags also match their subtags. */
  includeDescendants: boolean;
}

export const EMPTY_DRAFT: QueryDraft = {
  ingredients: [],
  exclude: [],
  includeDescendants: true,
};

/**
 * Turn builder state into a query.
 *
 * Exclusions are always AND-ed on top: "any of these, but never that" is what
 * people mean, whereas OR-ing an exclusion would make it match everything.
 */
export function buildQuery(draft: QueryDraft): TagQuery {
  const leaf = (tagId: number): TagQuery => ({
    type: 'tag',
    tagId,
    includeDescendants: draft.includeDescendants,
  });
  const one = (children: TagQuery[], type: 'and' | 'or'): TagQuery =>
    children.length === 1 ? children[0] : { type, children };

  const ingredients = draft.ingredients.filter((tags) => tags.length > 0);
  const base: TagQuery =
    ingredients.length === 0 ? { type: 'all' } : one(ingredients.map((tags) => one(tags.map(leaf), 'and')), 'or');

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
  if (draft.ingredients.some((tags) => tags.includes(tagId))) return 'include';
  if (draft.exclude.includes(tagId)) return 'exclude';
  return 'off';
}

export function isEmptyDraft(draft: QueryDraft): boolean {
  return draft.ingredients.length === 0 && draft.exclude.length === 0;
}

/** Drop tags that no longer exist, e.g. from a mix saved before a tag was deleted. */
export function pruneDraft(draft: QueryDraft, existing: ReadonlySet<number>): QueryDraft {
  return mapDraftTags(draft, (id) => (existing.has(id) ? id : null));
}

/** Rewrite every tag id in a draft; `null` drops it, and an ingredient left empty goes too. */
export function mapDraftTags(draft: QueryDraft, map: (tagId: number) => number | null): QueryDraft {
  const all = (ids: number[]) => ids.map(map).filter((id): id is number => id !== null);
  return {
    ...draft,
    ingredients: draft.ingredients.map(all).filter((tags) => tags.length > 0),
    exclude: all(draft.exclude),
  };
}
