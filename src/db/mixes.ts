import type { SQLiteDatabase } from 'expo-sqlite';

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

const ids = (value: unknown): number[] =>
  Array.isArray(value) ? value.filter((v): v is number => typeof v === 'number') : [];

/** Read a stored draft defensively: a damaged row becomes an empty mix, never a crash. */
export function parseDraft(json: string): QueryDraft {
  try {
    const data = JSON.parse(json) as Partial<Record<keyof QueryDraft, unknown>>;
    return {
      include: ids(data.include),
      exclude: ids(data.exclude),
      includeDescendants: data.includeDescendants !== false,
      mode: data.mode === 'or' ? 'or' : 'and',
    };
  } catch {
    return EMPTY_DRAFT;
  }
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
