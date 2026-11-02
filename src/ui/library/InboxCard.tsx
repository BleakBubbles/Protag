import { Pressable, StyleSheet, Text, View } from 'react-native';

import { openInbox } from '../../navigation';
import { plural } from '../format';
import { useInbox } from '../hooks/useInbox';
import { Icon } from '../Icon';
import { IconButton } from '../IconButton';
import { font, iconSize, radius, spacing } from '../theme';
import { makeStyles, useColors } from '../ThemeContext';

/**
 * The songs waiting for tags, at the top of the Library's Tags and Songs
 * pages: tap to go tag them, or "Not now" to hide it until more arrive.
 * Takes no room while there's nothing to remind of.
 */
export function InboxCard() {
  const colors = useColors();
  const styles = useStyles();
  const { count, shown, dismiss } = useInbox();
  if (!shown) return null;
  return (
    <Pressable
      onPress={openInbox}
      accessibilityRole="button"
      accessibilityLabel={`${plural(count, 'song')} to tag`}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.badge}>
        <Icon name="tags" size={iconSize.sm} color={colors.accentFg} />
      </View>
      <View style={styles.text}>
        <Text style={styles.title} numberOfLines={1}>
          {plural(count, 'song')} to tag
        </Text>
        <Text style={styles.sub} numberOfLines={1}>
          Not in any tag yet, newest first
        </Text>
      </View>
      <IconButton icon="close" label="Not now" size={iconSize.sm} color={colors.textDim} onPress={dismiss} />
    </Pressable>
  );
}

const useStyles = makeStyles((colors) => StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginHorizontal: spacing.lg,
    marginVertical: spacing.sm,
    paddingLeft: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.lg,
    backgroundColor: colors.accentTint,
  },
  pressed: {
    opacity: 0.7,
  },
  badge: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
  },
  text: {
    flex: 1,
    paddingVertical: spacing.sm,
  },
  title: {
    ...font.name,
    color: colors.text,
  },
  sub: {
    ...font.caption,
    color: colors.textDim,
  },
}));
