import { Pressable, StyleSheet, Text } from 'react-native';

import { openInbox } from '../../navigation';
import { plural } from '../format';
import { useInbox } from '../hooks/useInbox';
import { Icon } from '../Icon';
import { IconButton } from '../IconButton';
import { font, iconSize, radius, spacing } from '../theme';
import { makeStyles, useColors } from '../ThemeContext';

/**
 * The songs waiting for tags, one line at the top of the Library's Tags and
 * Songs pages: tap to go tag them, or "Not now" to hide it until more arrive.
 * Takes no room while there's nothing to remind of.
 */
export function InboxCard() {
  const colors = useColors();
  const styles = useStyles();
  const { count, shown, dismiss } = useInbox();
  if (!shown) return null;
  const label = plural(count, 'untagged song');
  return (
    <Pressable
      onPress={openInbox}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <Icon name="tags" size={iconSize.sm} color={colors.accentFg} />
      <Text style={styles.label} numberOfLines={1}>
        {label}
      </Text>
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
    borderRadius: radius.lg,
    backgroundColor: colors.accentTint,
  },
  pressed: {
    opacity: 0.7,
  },
  label: {
    ...font.name,
    flex: 1,
    color: colors.text,
  },
}));
