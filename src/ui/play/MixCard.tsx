import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon, type IconName } from '../Icon';
import { colors, font, iconSize, radius, spacing } from '../theme';
import { ArtMosaic } from './ArtMosaic';

const ACTION = 42;
const RING_GAP = 2;
const RING_WIDTH = 2;

export interface MixCardActions {
  onEdit: () => void;
  onRename: () => void;
  onDelete: () => void;
}

export interface MixCardProps {
  name: string;
  /** What the mix is, in words: "kpop × chill, not sad". */
  description: string;
  /** Album ids for the artwork, most played first. */
  albumIds: readonly string[];
  /** For a mix with no artwork: the colour of its first tag. */
  color: string;
  /** The card is this wide and its artwork square. */
  width: number;
  onPress: () => void;
  onLongPress: () => void;
  /** Held: its artwork offers these, ringed like a tile in the mix. */
  held?: MixCardActions;
  /** Another card is held: this one steps back. */
  faded?: boolean;
}

/**
 * A saved mix, led by its artwork so it's recognisable at a glance. One tap
 * shuffles it. Held, its own artwork dims and offers Edit, Rename and Delete
 * as round buttons, so what's acted on is the card under the finger, not a
 * menu beside it. Fixed height, so cards line up whatever their text.
 */
export function MixCard({ name, description, albumIds, color, width, onPress, onLongPress, held, faded }: MixCardProps) {
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="button"
      accessibilityLabel={held ? `${name}, held` : `Shuffle ${name}: ${description}`}
      accessibilityHint={held ? undefined : 'Long press to edit, rename or delete'}
      style={({ pressed }) => [styles.card, { width }, faded && styles.faded, pressed && !held && styles.pressed]}
    >
      <View>
        <View style={styles.art}>
          <ArtMosaic albumIds={albumIds} size={width} fallbackColor={color} />
          {held && (
            <View style={styles.veil}>
              <Action icon="create-outline" label={`Edit ${name}`} onPress={held.onEdit} />
              <Action icon="text-outline" label={`Rename ${name}`} onPress={held.onRename} />
              <Action icon="trash-outline" label={`Delete ${name}`} onPress={held.onDelete} danger />
            </View>
          )}
        </View>
        {held && <View pointerEvents="none" style={styles.ring} />}
      </View>
      <Text style={styles.name} numberOfLines={1}>
        {name}
      </Text>
      <Text style={styles.description} numberOfLines={1}>
        {description}
      </Text>
    </Pressable>
  );
}

function Action({ icon, label, onPress, danger }: { icon: IconName; label: string; onPress: () => void; danger?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.action, pressed && styles.actionPressed]}
    >
      <Icon name={icon} size={iconSize.sm} color={danger ? colors.danger : colors.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 2,
  },
  pressed: {
    opacity: 0.7,
  },
  faded: {
    opacity: 0.45,
  },
  art: {
    borderRadius: radius.md,
    overflow: 'hidden',
    marginBottom: spacing.xs,
  },
  // The artwork dimmed under its actions.
  veil: {
    ...StyleSheet.absoluteFill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: 'rgba(21, 20, 19, 0.78)',
  },
  action: {
    width: ACTION,
    height: ACTION,
    borderRadius: ACTION / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.raised,
  },
  actionPressed: {
    backgroundColor: colors.border,
  },
  // The same white ring as a tile in the mix: this is the one being acted on.
  ring: {
    position: 'absolute',
    top: -RING_GAP - RING_WIDTH,
    left: -RING_GAP - RING_WIDTH,
    right: -RING_GAP - RING_WIDTH,
    bottom: spacing.xs - RING_GAP - RING_WIDTH,
    borderRadius: radius.md + RING_GAP + RING_WIDTH,
    borderWidth: RING_WIDTH,
    borderColor: colors.text,
  },
  name: {
    ...font.listTitle,
    color: colors.text,
  },
  description: {
    ...font.caption,
    color: colors.textDim,
  },
});
