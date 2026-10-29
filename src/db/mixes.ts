import type { SQLiteDatabase } from 'expo-sqlite';

import { isRef, type Ref } from '../query/refs';
import { parseTuning } from '../query/tuning';
import { EMPTY_DRAFT, type QueryDraft } from '../query/types';
import { getSetting, setSetting, SettingKey } from './settings';

/**
 * A mix: a named, saved tag combination. Like a smart playlist, it's a rule
 * rather than a list, so songs tagged later join it automatically.
 *
 * Stored in `saved_queries` as the builder's draft, not the compiled query, so a
 * mix can be opened back up in the builder and edited.
 */
export interface Mix {
  id: number;
  name: string;
  draft: QueryDraft;
  createdAt: number;
  /** Pinned to the front of the shelf. */
  pinned: boolean;
}

/** Thrown for mix operations the user could plausibly trigger; the message is for the user. */
export class MixError extends Error {}

const ids = (value: unknown): Ref[] => (Array.isArray(value) ? value.filter(isRef) : []);

/**
 * Read a stored draft defensively: a damaged row becomes an empty mix, never a
 * crash. Mixes saved before the pot (2026-10-20) kept a flat `include` list and
 * a `mode`: "all of these" becomes one combined ingredient, "any of these" one
 * ingredient per tag.
 */
export function parseDraft(json: string): QueryDraft {
  try {
    const data = JSON.parse(json) as Record<string, unknown>;
    const ingredients = Array.isArray(data.ingredients)
      ? data.ingredients.map(ids).filter((tags) => tags.length > 0)
      : legacyIngredients(ids(data.include), data.mode);
    const tuning = parseTuning(data.tuning, isRef);
    return {
      ingredients,
      exclude: ids(data.exclude),
      includeDescendants: data.includeDescendants !== false,
      ...(tuning.length > 0 && { tuning }),
    };
  } catch {
    return EMPTY_DRAFT;
  }
}

/**
 * The pot as kept between launches: what's in it, the mix open for editing (if
 * any), and what the pot held before that, to put back when the editing's done.
 */
export type KeptPot = { draft: QueryDraft; editing: number | null; before: QueryDraft | null };

export function keepPot(pot: KeptPot): string {
  return JSON.stringify(pot);
}

/** Read back a kept pot; anything damaged is an empty one. */
export function parseKeptPot(json: string | null): KeptPot {
  if (!json) return { draft: EMPTY_DRAFT, editing: null, before: null };
  try {
    const data = JSON.parse(json) as { draft?: unknown; editing?: unknown; before?: unknown };
    const editing = typeof data.editing === 'number' ? data.editing : null;
    return {
      draft: parseDraft(JSON.stringify(data.draft ?? {})),
      editing,
      before: editing !== null && data.before ? parseDraft(JSON.stringify(data.before)) : null,
    };
  } catch {
    return { draft: EMPTY_DRAFT, editing: null, before: null };
  }
}

function legacyIngredients(include: Ref[], mode: unknown): Ref[][] {
  if (include.length === 0) return [];
  return mode === 'or' ? include.map((id) => [id]) : [include];
}

/** Pinned mixes first, the most recently pinned leading; then the rest, oldest first. */
export async function listMixes(db: SQLiteDatabase): Promise<Mix[]> {
  const [rows, pins] = await Promise.all([
    db.getAllAsync<{ id: number; name: string; query_json: string; created_at: number }>(
      'SELECT id, name, query_json, created_at FROM saved_queries ORDER BY created_at'
    ),
    readPins(db),
  ]);
  const mixes = rows.map((r) => ({
    id: r.id,
    name: r.name,
    draft: parseDraft(r.query_json),
    createdAt: r.created_at,
    pinned: pins.includes(r.id),
  }));
  const pinRank = (mix: Mix) => (mix.pinned ? pins.indexOf(mix.id) : pins.length);
  return mixes.sort((a, b) => pinRank(a) - pinRank(b));
}

/**
 * Pins a mix to the front of the shelf (ahead of any pinned before it), or
 * lets it back into its place. Kept as a setting, a list of ids: a deleted
 * mix's id is just never matched.
 */
export async function pinMix(db: SQLiteDatabase, id: number, pinned: boolean): Promise<void> {
  const pins = (await readPins(db)).filter((pin) => pin !== id);
  await setSetting(db, SettingKey.pinnedMixes, JSON.stringify(pinned ? [id, ...pins] : pins));
}

async function readPins(db: SQLiteDatabase): Promise<number[]> {
  try {
    const pins = JSON.parse((await getSetting(db, SettingKey.pinnedMixes)) ?? '[]');
    return Array.isArray(pins) ? pins.filter((pin): pin is number => typeof pin === 'number') : [];
  } catch {
    return [];
  }
}

/**
 * Save under a name. Saving to an existing name (ignoring case) updates that
 * mix, which is how an opened-and-edited mix gets saved back.
 */
export async function saveMix(db: SQLiteDatabase, name: string, draft: QueryDraft): Promise<number> {
  const clean = name.trim();
  if (!clean) throw new MixError('Give the mix a name.');
  const json = JSON.stringify(draft);
  const existing = await db.getFirstAsync<{ id: number }>(
    'SELECT id FROM saved_queries WHERE name = ? COLLATE NOCASE',
    clean
  );
  if (existing) {
    await db.runAsync('UPDATE saved_queries SET query_json = ? WHERE id = ?', json, existing.id);
    return existing.id;
  }
  const result = await db.runAsync(
    'INSERT INTO saved_queries (name, query_json, created_at) VALUES (?, ?, ?)',
    clean,
    json,
    Date.now()
  );
  return result.lastInsertRowId;
}

/**
 * Save from the Play tab or the player. A name another mix already has is
 * refused, so a mix is never overwritten by accident; the name of the mix
 * being edited (`editingId`) updates it.
 */
export async function saveMixAs(
  db: SQLiteDatabase,
  name: string,
  draft: QueryDraft,
  editingId: number | null
): Promise<number> {
  const clash = await db.getFirstAsync<{ id: number; name: string }>(
    'SELECT id, name FROM saved_queries WHERE name = ? COLLATE NOCASE',
    name.trim()
  );
  if (clash && clash.id !== editingId) throw new MixError(`There's already a mix called "${clash.name}".`);
  return saveMix(db, name, draft);
}

export async function renameMix(db: SQLiteDatabase, id: number, name: string): Promise<void> {
  const clean = name.trim();
  if (!clean) throw new MixError('Give the mix a name.');
  const clash = await db.getFirstAsync<{ id: number }>(
    'SELECT id FROM saved_queries WHERE name = ? COLLATE NOCASE AND id != ?',
    clean,
    id
  );
  if (clash) throw new MixError(`There's already a mix called "${clean}".`);
  await db.runAsync('UPDATE saved_queries SET name = ? WHERE id = ?', clean, id);
}

export async function deleteMix(db: SQLiteDatabase, id: number): Promise<void> {
  await db.runAsync('DELETE FROM saved_queries WHERE id = ?', id);
}
