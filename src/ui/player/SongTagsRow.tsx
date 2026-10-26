import { ScrollView, StyleSheet, View } from 'react-native';

import { getTagsForSong } from '../../db/tags';
import { openSongTags } from '../../navigation';
import { useLibraryQuery } from '../hooks/useLibraryQuery';
import { NoTags, TagButton } from '../TagButton';
import { TagChip } from '../TagChip';
import { spacing, touchTarget } from '../theme';

/**
 * The playing song's tags, under its title: how it's tagged at a glance, each
 * tag a way to its page, and the tag button first — tag while listening, the
 * moment the opinion is fresh. The button stays put while the tags scroll
 * beside it, so it's in reach however many there are. A constant height, so
 * the controls below never move, tagged or not.
 */
export function SongTagsRow({ songId, onOpenTag }: { songId: number; onOpenTag: (tagId: number) => void }) {
  // Reloads after tagging, like every library view.
  const { data: tags } = useLibraryQuery((db) => getTagsForSong(db, songId), [songId]);
  const edit = () => openSongTags(songId);

  return (
    <View style={styles.row}>
      {tags === undefined ? null : tags.length === 0 ? (
        <View style={styles.centred}>
          <NoTags onPress={edit} label="Tag this song" />
        </View>
      ) : (
        <View style={styles.tagged}>
          <TagButton onPress={edit} label="Edit tags for this song" />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.scroller}
            contentContainerStyle={styles.chips}
          >
            {tags.map((tag) => (
              <TagChip key={tag.id} name={tag.name} color={tag.color} onPress={() => onOpenTag(tag.id)} />
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    alignSelf: 'stretch',
    height: touchTarget,
  },
  centred: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  // Button and tags centred together like the rest of the player when they
  // fit; when they don't, the tags take the room left and scroll.
  tagged: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
  },
  scroller: {
    flexGrow: 0,
    flexShrink: 1,
  },
  chips: {
    alignItems: 'center',
    gap: spacing.sm,
  },
});
