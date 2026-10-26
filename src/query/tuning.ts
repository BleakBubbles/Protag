import type { Ref } from './refs';
import type { QueryDraft } from './types';

/**
 * How one ingredient of a mix plays in its shuffle, set from the mix's
 * Details: its `share` multiplies its natural share (its size) in doublings,
 * and `repeats` sends it round again until the rest run out. Kept in the draft
 * beside the ingredients, by the ingredient's refs, so it saves with a mix,
 * stays with the pot between launches, and goes through backups like the
 * ingredients do. An ingredient that changes (combined, split) is a new one,
 * and starts plain.
 */
export interface Tuning {
  refs: Ref[];
  share: number;
  repeats: boolean;
}

export type IngredientTuning = Omit<Tuning, 'refs'>;

/** From a quarter to eight times its natural share; 1 is untouched. */
export const SHARES = [0.25, 0.5, 1, 2, 4, 8] as const;

export const PLAIN: IngredientTuning = { share: 1, repeats: false };

const keyOf = (refs: readonly Ref[]) => refs.map(String).sort().join('+');
const isPlain = (t: IngredientTuning) => t.share === 1 && !t.repeats;

/**
 * Shares are of the whole shuffle, so a raised ingredient can only keep its
 * share by going round again: above its natural share, it always repeats.
 */
export const goesRound = (t: IngredientTuning) => t.share > 1 || t.repeats;

export function tuningOf(draft: QueryDraft, refs: readonly Ref[]): IngredientTuning {
  const key = keyOf(refs);
  const found = draft.tuning?.find((t) => keyOf(t.refs) === key);
  return found ? { share: found.share, repeats: found.repeats } : PLAIN;
}

/** Only for ingredients still in the pot, and only what differs from plain. */
function tidy(draft: QueryDraft, tuning: readonly Tuning[]): QueryDraft {
  const present = new Set(draft.ingredients.map(keyOf));
  const kept = tuning.filter((t) => present.has(keyOf(t.refs)) && !isPlain(t));
  const { tuning: _old, ...rest } = draft;
  return kept.length > 0 ? { ...rest, tuning: kept } : rest;
}

export function setTuning(draft: QueryDraft, refs: readonly Ref[], next: IngredientTuning): QueryDraft {
  const key = keyOf(refs);
  const others = (draft.tuning ?? []).filter((t) => keyOf(t.refs) !== key);
  return tidy(draft, [...others, { refs: [...refs], share: next.share, repeats: next.repeats }]);
}

/** Whether the mix shuffles any other way than plainly: only with two or more ingredients to weigh. */
export function isTuned(draft: QueryDraft): boolean {
  return draft.ingredients.length > 1 && draft.ingredients.some((refs) => !isPlain(tuningOf(draft, refs)));
}

/** Back to a plain shuffle. */
export function untuned(draft: QueryDraft): QueryDraft {
  return tidy(draft, []);
}

/** Read stored tuning defensively: anything malformed is dropped. */
export function parseTuning(value: unknown, isRef: (v: unknown) => v is Ref): Tuning[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((t) => {
    if (!t || typeof t !== 'object') return [];
    const { refs, share, repeats } = t as Record<string, unknown>;
    if (!Array.isArray(refs) || !refs.every(isRef) || !SHARES.includes(share as never)) return [];
    return [{ refs: refs as Ref[], share: share as number, repeats: repeats === true }];
  });
}
