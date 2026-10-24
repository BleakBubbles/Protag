import type { SQLiteDatabase } from 'expo-sqlite';

import { isRef, type Ref } from '../query/refs';
import { EMPTY_DRAFT, type QueryDraft } from '../query/types';

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
    return { ingredients, exclude: ids(data.exclude), includeDescendants: data.includeDescendants !== false };
  } catch {
    return EMPTY_DRAFT;
  }
}

function legacyIngredients(include: Ref[], mode: unknown): Ref[][] {
  if (include.length === 0) return [];
  return mode === 'or' ? include.map((id) => [id]) : [include];
}

export async function listMixes(db: SQLiteDatabase): Promise<Mix[]> {
  const rows = await db.getAllAsync<{ id: number; name: string; query_json: string; created_at: number }>(
    'SELECT id, name, query_json, created_at FROM saved_queries ORDER BY created_at'
  );
  return rows.map((r) => ({ id: r.id, name: r.name, draft: parseDraft(r.query_json), createdAt: r.created_at }));
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
