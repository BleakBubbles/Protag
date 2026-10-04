import { normalize } from './match';

/**
 * Precompute a song's search key once, so filtering a large library on every
 * keystroke is a plain substring check rather than re-normalizing every field.
 */
export function searchKey(fields: readonly (string | null | undefined)[]): string {
  return normalize(fields.filter(Boolean).join(' '));
}

/**
 * Case-, accent-, and punctuation-insensitive substring match: "beyonce" finds
 * "Beyoncé", "acdc" doesn't find "AC/DC" but "ac dc" does. Every word of the
 * query must appear, in any order — "halo beyonce" finds "Beyoncé – Halo".
 */
export function matchesQuery(key: string, query: string): boolean {
  const words = normalize(query).split(' ').filter(Boolean);
  return words.every((word) => key.includes(word));
}
