import type { Ref } from './refs';
import type { QueryDraft } from './types';

/**
 * What the Shuffle tab's pot does with each tap and drop, as pure functions of
 * the draft. Kept apart from the screen so the rules can be tested directly.
 */

/** Something picked up: a tile (tag, artist or album), or one of the pot's own chips. */
export type PotItem = { kind: 'tile'; ref: Ref } | { kind: 'ingredient'; index: number } | { kind: 'excluded'; ref: Ref };

/** Where it was let go. `null` is anywhere outside the pot. */
export type PotSpot = { kind: 'ingredient'; index: number } | { kind: 'pot' } | { kind: 'keepOut' } | null;

/** Take a tag (or artist, or album) out of wherever it sits in the draft. */
function takeOut(draft: QueryDraft, ref: Ref): QueryDraft {
  return {
    ...draft,
    ingredients: draft.ingredients.map((tags) => tags.filter((id) => id !== ref)).filter((tags) => tags.length > 0),
    exclude: draft.exclude.filter((id) => id !== ref),
  };
}

/** A tile tapped: into the pot as its own ingredient, or back out from wherever it is. */
export function tapTag(draft: QueryDraft, ref: Ref): QueryDraft {
  const inUse = draft.ingredients.some((tags) => tags.includes(ref)) || draft.exclude.includes(ref);
  if (inUse) return takeOut(draft, ref);
  return { ...draft, ingredients: [...draft.ingredients, [ref]] };
}

/** An ingredient tapped: a combined one splits into its tags; a single one goes back. */
export function tapIngredient(draft: QueryDraft, index: number): QueryDraft {
  const tags = draft.ingredients[index];
  if (!tags) return draft;
  const ingredients = [...draft.ingredients];
  ingredients.splice(index, 1, ...(tags.length > 1 ? tags.map((id) => [id]) : []));
  return { ...draft, ingredients };
}

/** An excluded tag tapped: it goes back. */
export function tapExcluded(draft: QueryDraft, ref: Ref): QueryDraft {
  return takeOut(draft, ref);
}

/**
 * Something dragged and let go:
 * - onto an ingredient: combined with it (songs must have both);
 * - into the pot: added as its own ingredient;
 * - into Keep out: excluded (one tag at a time; a combination snaps back);
 * - anywhere else: taken out of the pot (a tile dragged off the grid just
 *   goes back to where it was).
 */
export function dropInPot(draft: QueryDraft, item: PotItem, spot: PotSpot): QueryDraft {
  const moving = item.kind === 'ingredient' ? draft.ingredients[item.index] : [item.ref];
  if (!moving) return draft;
  // Without what's moving, so a tag never ends up in two places.
  const rest =
    item.kind === 'ingredient'
      ? {
          ...draft,
          ingredients: draft.ingredients.filter((_, i) => i !== item.index),
        }
      : takeOut(draft, item.ref);

  if (spot === null) return item.kind === 'tile' ? draft : rest;

  switch (spot.kind) {
    case 'ingredient': {
      const target = draft.ingredients[spot.index];
      if (!target || (item.kind === 'ingredient' && item.index === spot.index)) return draft;
      if (moving.every((id) => target.includes(id))) return draft;
      // One pass over the original list, so the target keeps its place.
      const ingredients = draft.ingredients
        .map((tags, i) => {
          if (i === spot.index) return [...tags, ...moving.filter((id) => !tags.includes(id))];
          if (item.kind === 'ingredient') return i === item.index ? [] : tags;
          return tags.filter((id) => id !== item.ref);
        })
        .filter((tags) => tags.length > 0);
      return { ...rest, ingredients };
    }
    case 'pot':
      if (item.kind === 'ingredient' || draft.ingredients.some((tags) => tags.includes(item.ref))) return draft;
      return { ...rest, ingredients: [...rest.ingredients, [item.ref]] };
    case 'keepOut':
      if (moving.length !== 1 || draft.exclude.includes(moving[0])) return draft;
      return { ...rest, exclude: [...rest.exclude, moving[0]] };
  }
}
