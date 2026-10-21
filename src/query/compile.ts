import type { TagQuery } from './types';

export interface CompiledQuery {
  /** A boolean SQL expression over the songs alias. Always parenthesised. */
  where: string;
  params: (number | string)[];
}

/** Maps every tag id to itself plus its descendants. See `buildDescendantMap`. */
export type DescendantMap = Map<number, number[]>;

/**
 * Compile a query to a SQL boolean expression.
 *
 * Inheritance ("a song tagged kpop matches an asian-pop query") is resolved by
 * expanding each tag leaf through `descendants` before generating SQL, rather
 * than nesting a recursive CTE per node. The generated SQL stays flat, and every
 * tag id goes in as a bound parameter — nothing is interpolated.
 */
export function compileWhere(
  query: TagQuery,
  descendants: DescendantMap,
  alias = 's'
): CompiledQuery {
  switch (query.type) {
    case 'all':
      return { where: '(1 = 1)', params: [] };

    case 'untagged':
      return {
        where: `(NOT EXISTS (SELECT 1 FROM song_tags st WHERE st.song_id = ${alias}.id))`,
        params: [],
      };

    case 'tag': {
      // A tag with no map entry has been deleted; its song_tags rows cascaded away
      // with it, so matching on the bare id correctly yields nothing.
      const ids = query.includeDescendants
        ? (descendants.get(query.tagId) ?? [query.tagId])
        : [query.tagId];
      const placeholders = ids.map(() => '?').join(',');
      return {
        where: `(EXISTS (SELECT 1 FROM song_tags st WHERE st.song_id = ${alias}.id AND st.tag_id IN (${placeholders})))`,
        params: ids,
      };
    }

    // Straight from the song's own metadata: no tags involved.
    case 'artist':
      return { where: `(${alias}.artist = ?)`, params: [query.name] };

    case 'album':
      return { where: `(${alias}.album_id = ?)`, params: [query.albumId] };

    case 'and':
    case 'or': {
      // An empty AND matches everything, an empty OR matches nothing — the
      // identity element for each operator. This is what makes an in-progress
      // query in the builder behave sensibly instead of throwing.
      if (query.children.length === 0) {
        return query.type === 'and' ? { where: '(1 = 1)', params: [] } : { where: '(1 = 0)', params: [] };
      }
      const compiled = query.children.map((child) => compileWhere(child, descendants, alias));
      const joiner = query.type === 'and' ? ' AND ' : ' OR ';
      return {
        where: `(${compiled.map((c) => c.where).join(joiner)})`,
        params: compiled.flatMap((c) => c.params),
      };
    }

    case 'not': {
      const inner = compileWhere(query.child, descendants, alias);
      return { where: `(NOT ${inner.where})`, params: inner.params };
    }
  }
}

export type SongOrder = 'title' | 'artist' | 'recent' | 'played' | 'random';

const ORDER_SQL: Record<SongOrder, string> = {
  title: 's.title COLLATE NOCASE',
  artist: 's.artist COLLATE NOCASE, s.title COLLATE NOCASE',
  recent: 's.added_at DESC',
  played: 's.play_count DESC, s.last_played_at DESC, s.title COLLATE NOCASE',
  random: 'RANDOM()',
};

/** Full SELECT for songs matching a query. Missing files are always excluded. */
export function compileSongSelect(
  query: TagQuery,
  descendants: DescendantMap,
  options: { order?: SongOrder; limit?: number } = {}
): { sql: string; params: (number | string)[] } {
  const { where, params } = compileWhere(query, descendants);
  const order = ORDER_SQL[options.order ?? 'title'];
  const limit = options.limit ? ` LIMIT ${Math.floor(options.limit)}` : '';

  return {
    sql: `SELECT s.* FROM songs s WHERE s.is_missing = 0 AND ${where} ORDER BY ${order}${limit}`,
    params,
  };
}

/** COUNT for the live "N songs match" readout in the builder. */
export function compileCountSelect(
  query: TagQuery,
  descendants: DescendantMap
): { sql: string; params: (number | string)[] } {
  const { where, params } = compileWhere(query, descendants);
  return {
    sql: `SELECT COUNT(*) AS n FROM songs s WHERE s.is_missing = 0 AND ${where}`,
    params,
  };
}
