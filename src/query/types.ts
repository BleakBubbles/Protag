import { readRef, type Ref } from './refs';
import type { Tuning } from './tuning';

/**
 * The shape of a Protag query.
 *
 * This AST is the contract between the visual builder, the SQL compiler, and the
 * saved-query store. A text query language ("driving AND kpop NOT sad") would parse
 * to exactly this, which is what keeps that option open without a redesign.
 */
export type TagQuery =
  | { type: 'all' }
  | { type: 'tag'; tagId: number; includeDescendants: boolean }
  | { type: 'artist'; name: string }
  | { type: 'album'; albumId: string }
  | { type: 'and'; children: TagQuery[] }
  | { type: 'or'; children: TagQuery[] }
  | { type: 'not'; child: TagQuery }
  | { type: 'untagged' };

export const MATCH_ALL: TagQuery = { type: 'all' };

/**
 * What the Play tab's builder edits: the pot. Compiles to a `TagQuery` via
 * `buildQuery`.
 *
 * Each ingredient is one or more tags, artists or albums (`Ref`s). A song plays
 * if it matches any ingredient, and an ingredient of several (combined by
 * dragging one onto another) needs all of them: "either" is the default, "both"
 * is deliberate. Exclusions apply on top. Each sits in at most one place, so
 * every tile has one state.
 */
export interface QueryDraft {
  ingredients: Ref[][];
  /** Whose songs never play. */
  exclude: Ref[];
  /** Whether tags also match their subtags. */
  includeDescendants: boolean;
  /** How ingredients weigh against each other in the shuffle; absent when it's a plain one (see tuning.ts). */
  tuning?: Tuning[];
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
  const leaf = (ref: Ref): TagQuery => {
    const read = readRef(ref);
    if (read.kind === 'artist') return { type: 'artist', name: read.name };
    if (read.kind === 'album') return { type: 'album', albumId: read.albumId };
    return { type: 'tag', tagId: read.tagId, includeDescendants: draft.includeDescendants };
  };
  const one = (children: TagQuery[], type: 'and' | 'or'): TagQuery =>
    children.length === 1 ? children[0] : { type, children };

  const ingredients = draft.ingredients.filter((tags) => tags.length > 0);
  const base: TagQuery =
    ingredients.length === 0 ? { type: 'all' } : one(ingredients.map((tags) => one(tags.map(leaf), 'and')), 'or');

  if (draft.exclude.length === 0) return base;

  const exclusions: TagQuery[] = draft.exclude.map((id) => ({ type: 'not', child: leaf(id) }));
  return { type: 'and', children: [base, ...exclusions] };
}

export type TagChoice = 'include' | 'exclude' | 'off';

export function tagChoice(draft: QueryDraft, ref: Ref): TagChoice {
  if (draft.ingredients.some((tags) => tags.includes(ref))) return 'include';
  if (draft.exclude.includes(ref)) return 'exclude';
  return 'off';
}

export function isEmptyDraft(draft: QueryDraft): boolean {
  return draft.ingredients.length === 0 && draft.exclude.length === 0;
}

/**
 * Whether two drafts play the same songs as written: the same ingredients and
 * exclusions, in any order. How the player knows what's playing is already a
 * saved mix.
 */
export function sameDraft(a: QueryDraft, b: QueryDraft): boolean {
  const sorted = (refs: readonly Ref[]) => refs.map(String).sort();
  const key = (d: QueryDraft) =>
    JSON.stringify([
      d.ingredients.map((tags) => sorted(tags).join()).sort(),
      sorted(d.exclude),
      d.includeDescendants,
      (d.tuning ?? []).map((t) => `${sorted(t.refs).join()}:${t.share}`).sort(),
    ]);
  return key(a) === key(b);
}

/**
 * Drop tags that no longer exist, e.g. from a mix saved before a tag was
 * deleted. Artists and albums stay: one whose songs are gone just matches nothing.
 */
export function pruneDraft(draft: QueryDraft, existing: ReadonlySet<number>): QueryDraft {
  return mapDraftTags(draft, (id) => (existing.has(id) ? id : null));
}

/** Rewrite every tag id in a draft, leaving artists and albums be; `null` drops it. */
export function mapDraftTags(draft: QueryDraft, map: (tagId: number) => number | null): QueryDraft {
  return mapDraftRefs(draft, (ref) => (typeof ref === 'number' ? map(ref) : ref));
}

/** Rewrite every ingredient in a draft; `null` drops it, and an ingredient left empty goes too. */
export function mapDraftRefs(draft: QueryDraft, map: (ref: Ref) => Ref | null): QueryDraft {
  const all = (refs: Ref[]) => refs.map(map).filter((ref): ref is Ref => ref !== null);
  // Tuning follows its ingredient; one that lost any of its refs is a different ingredient now, and plays plain.
  const tuning = draft.tuning
    ?.map((t) => ({ ...t, refs: all(t.refs) }))
    .filter((t, i) => t.refs.length === draft.tuning![i].refs.length);
  const { tuning: _old, ...rest } = draft;
  return {
    ...rest,
    ingredients: draft.ingredients.map(all).filter((tags) => tags.length > 0),
    exclude: all(draft.exclude),
    ...(tuning && tuning.length > 0 && { tuning }),
  };
}
