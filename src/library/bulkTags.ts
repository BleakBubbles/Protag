/**
 * Editing the tags of several songs at once, with tri-state checkboxes: a tag
 * every selected song has is checked ("all"), one only some have is partial
 * ("some"), one none have is unchecked ("none"). Only tags the user touches
 * change; a tag left as it started is left alone song by song, which is what
 * makes this safe when the songs don't share all their tags.
 *
 * Pure, so the rules are testable without a device. Works on *direct* tags
 * only: a song under a tag through a subtag doesn't count as having it.
 */

export type TagMark = 'all' | 'some' | 'none';

/** How many of the selected songs carry each tag directly; tags none carry are absent. */
export function countTags(
  songIds: readonly number[],
  tagsOf: ReadonlyMap<number, readonly number[]>
): Map<number, number> {
  const counts = new Map<number, number>();
  for (const songId of songIds) {
    for (const tagId of new Set(tagsOf.get(songId) ?? [])) counts.set(tagId, (counts.get(tagId) ?? 0) + 1);
  }
  return counts;
}

export function markFor(count: number, songCount: number): TagMark {
  if (count === 0) return 'none';
  return count >= songCount ? 'all' : 'some';
}

/**
 * One tap. A tag that started partial cycles all → none → back to partial
 * (meaning "leave it as it was"); one that started checked or unchecked just
 * toggles, since there's no partial state to return to.
 */
export function nextMark(initial: TagMark, current: TagMark): TagMark {
  if (initial === 'some') return current === 'some' ? 'all' : current === 'all' ? 'none' : 'some';
  return current === 'all' ? 'none' : 'all';
}

export interface BulkTagEdit {
  /** [songId, tagId] links to create. */
  add: [number, number][];
  /** [songId, tagId] links to delete. */
  remove: [number, number][];
}

/** The links a save would add and remove, for every tag whose mark changed. */
export function planBulkEdit(
  songIds: readonly number[],
  tagsOf: ReadonlyMap<number, readonly number[]>,
  marks: ReadonlyMap<number, TagMark>
): BulkTagEdit {
  const edit: BulkTagEdit = { add: [], remove: [] };
  for (const [tagId, mark] of marks) {
    if (mark === 'some') continue; // "as it was"
    for (const songId of songIds) {
      const has = (tagsOf.get(songId) ?? []).includes(tagId);
      if (mark === 'all' && !has) edit.add.push([songId, tagId]);
      if (mark === 'none' && has) edit.remove.push([songId, tagId]);
    }
  }
  return edit;
}

/**
 * What a tag's chip shows in the editor, which opens down the tree: its own
 * mark, or what its subtags' marks (`below`) say, since a song in
 * "kpop › gen 4" is in kpop.
 */
export function shownMark(own: TagMark, below: readonly TagMark[]): TagMark {
  if (own === 'all' || below.includes('all')) return 'all';
  return own === 'some' || below.includes('some') ? 'some' : 'none';
}

/**
 * How a tag's chip shows: its shown mark, except a tag on only because a
 * subtag is ("kpop" through "gen 4") shows as "via", since it isn't saved as
 * itself.
 */
export type ChipState = TagMark | 'via';

export function chipState(own: TagMark, below: readonly TagMark[]): ChipState {
  const shown = shownMark(own, below);
  return shown === 'all' && own !== 'all' ? 'via' : shown;
}

/**
 * One tap on a tag in the editor, given its subtags (`below`) and parents
 * (`above`), returning the new marks. A tag showing as on goes off, subtags
 * and all. One showing as off that started on for some songs goes back to how
 * it started. Anything else goes on, and a parent turned on earlier in the
 * visit (on the way down to this one) goes back to how it started: the subtag
 * says it now, so "kpop" + "gen 4" saves as just "gen 4".
 */
export function tapTag(
  marks: ReadonlyMap<number, TagMark>,
  initial: (tagId: number) => TagMark,
  tagId: number,
  below: readonly number[],
  above: readonly number[]
): Map<number, TagMark> {
  const markOf = (id: number) => marks.get(id) ?? initial(id);
  const family = [tagId, ...below];
  const shown = shownMark(markOf(tagId), below.map(markOf));
  const next = new Map(marks);
  if (shown === 'all') {
    for (const id of family) next.set(id, 'none');
  } else if (shown === 'none' && family.some((id) => initial(id) !== 'none')) {
    for (const id of family) next.delete(id);
  } else {
    next.set(tagId, 'all');
    for (const id of above) if (next.get(id) === 'all' && initial(id) !== 'all') next.delete(id);
  }
  return next;
}
