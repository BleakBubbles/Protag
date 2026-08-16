/** Row shapes as they come back from SQLite (snake_case, integers for booleans). */

export type MetadataState = 'pending' | 'done' | 'failed';

export interface SongRow {
  id: number;
  media_id: string;
  uri: string;
  filename: string;
  title: string;
  artist: string | null;
  album: string | null;
  duration_ms: number;
  year: number | null;
  track_no: number | null;
  artwork_path: string | null;
  added_at: number;
  last_played_at: number | null;
  play_count: number;
  metadata_state: MetadataState;
  last_seen_at: number;
  is_missing: number;
}

export interface TagRow {
  id: number;
  name: string;
  parent_id: number | null;
  sort_order: number;
  created_at: number;
}

export interface SavedQueryRow {
  id: number;
  name: string;
  query_json: string;
  created_at: number;
}

/** A tag plus the counts the directory view needs. */
export interface TagWithCounts extends TagRow {
  /** Songs tagged with this tag or any descendant of it. */
  song_count: number;
  /** Immediate children only. */
  child_count: number;
}

/** A song with its directly-applied tags attached. */
export interface SongWithTags extends SongRow {
  tags: TagRow[];
}
